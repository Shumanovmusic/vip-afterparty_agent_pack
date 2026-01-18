#!/usr/bin/env python3
"""
Tail Progression Gate: Verify tail metrics do not regress from baseline.

This script compares fresh simulation results against a committed baseline CSV
to ensure tail distribution metrics (1000x+, 10000x+, max_win_x) do not regress
beyond allowed tolerances.

Usage:
    # Default: use baseline params automatically
    python -m scripts.tail_progression --compare-to ../out/tail_baseline_buy_gate.csv --verbose

    # With explicit params (must match baseline)
    python -m scripts.tail_progression --compare-to ../out/tail_baseline_buy_gate.csv \
        --mode buy --rounds 20000 --seed AUDIT_2025 --verbose

Tolerances (documented in CONFIG.md / this script):
    rate_1000x_plus: Absolute tolerance (default 0.2 percentage points)
    rate_10000x_plus: Absolute tolerance (default 0.01 percentage points); 0 baseline allows 0
    max_win_x: Absolute tolerance (default 100.0x)

Exit Codes:
    0: PASS - tail metrics within tolerance
    1: FAIL - regression detected or validation error
"""
import argparse
import csv
import sys
import tempfile
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.audit_sim import (
    generate_csv,
    get_config_hash,
    run_simulation,
)

# Default tolerances for tail progression check
# These are ABSOLUTE tolerances (in percentage points for rates)
DEFAULT_TOLERANCE_RATE_1000X_PLUS = 0.2  # 0.2 percentage points
DEFAULT_TOLERANCE_RATE_10000X_PLUS = 0.01  # 0.01 percentage points
DEFAULT_TOLERANCE_MAX_WIN_X = 100.0  # Absolute tolerance in x-multiplier

# Required fields in baseline CSV
REQUIRED_BASELINE_FIELDS = [
    "config_hash",
    "mode",
    "rounds",
    "seed",
    "debit_multiplier",
    "rate_1000x_plus",
    "rate_10000x_plus",
    "max_win_x",
    "capped_rate",
]


def load_csv_row(path: Path) -> dict[str, str] | None:
    """Load single row from CSV file."""
    if not path.exists():
        return None
    try:
        with open(path, "r") as f:
            reader = csv.DictReader(f)
            return next(reader, None)
    except (OSError, csv.Error):
        return None


def validate_baseline_csv(baseline_row: dict[str, str]) -> tuple[bool, list[str]]:
    """
    Validate baseline CSV has all required fields.

    Returns:
        (is_valid, missing_fields)
    """
    missing = [f for f in REQUIRED_BASELINE_FIELDS if f not in baseline_row]
    return len(missing) == 0, missing


def get_baseline_params(baseline_row: dict[str, str]) -> tuple[str, int, str]:
    """
    Extract mode, rounds, seed from baseline CSV row.

    Returns:
        (mode, rounds, seed)
    """
    mode = baseline_row.get("mode", "")
    rounds = int(baseline_row.get("rounds", 0))
    seed = baseline_row.get("seed", "")
    return mode, rounds, seed


def validate_params_match(
    cli_mode: str | None,
    cli_rounds: int,
    cli_seed: str,
    baseline_mode: str,
    baseline_rounds: int,
    baseline_seed: str,
) -> tuple[bool, str]:
    """
    Validate CLI params match baseline params exactly.

    Returns:
        (is_match, error_message)
    """
    mismatches = []

    if cli_mode is not None and cli_mode != baseline_mode:
        mismatches.append(f"mode: got {cli_mode}, baseline has {baseline_mode}")

    if cli_rounds != baseline_rounds:
        mismatches.append(f"rounds: got {cli_rounds}, baseline has {baseline_rounds}")

    if cli_seed != baseline_seed:
        mismatches.append(f"seed: got {cli_seed}, baseline has {baseline_seed}")

    if mismatches:
        msg = (
            f"Param mismatch: baseline rounds={baseline_rounds} seed={baseline_seed} "
            f"mode={baseline_mode}, got rounds={cli_rounds} seed={cli_seed} mode={cli_mode}.\n"
            f"Use default behavior (omit --mode/--rounds/--seed) to use baseline params."
        )
        return False, msg

    return True, ""


def validate_config_match(
    run_config_hash: str,
    baseline_config_hash: str,
    run_debit_multiplier: str,
    baseline_debit_multiplier: str,
) -> tuple[bool, str]:
    """
    Validate config_hash and debit_multiplier match baseline.

    Returns:
        (is_match, error_message)
    """
    errors = []

    if run_config_hash != baseline_config_hash:
        errors.append(
            f"config_hash mismatch: run={run_config_hash}, baseline={baseline_config_hash}. "
            f"Game math has changed. Regenerate baseline with 'make tail-baseline'."
        )

    if run_debit_multiplier != baseline_debit_multiplier:
        errors.append(
            f"debit_multiplier mismatch: run={run_debit_multiplier}, baseline={baseline_debit_multiplier}. "
            f"Mode cost settings differ."
        )

    if errors:
        return False, "\n".join(errors)

    return True, ""


def check_tail_regression(
    run_row: dict[str, str],
    baseline_row: dict[str, str],
    tolerances: dict[str, float],
) -> tuple[bool, list[str]]:
    """
    Check if tail metrics have regressed beyond tolerances.

    REGRESSION means: run value < baseline - tolerance
    (i.e., tail got worse - fewer big wins)

    Args:
        run_row: Current simulation result
        baseline_row: Baseline CSV row to compare against
        tolerances: Dict of field -> tolerance values

    Returns:
        (passed, list of status messages)
    """
    messages: list[str] = []
    all_passed = True

    # Fields to check for regression (run must be >= baseline - tolerance)
    checks = [
        ("rate_1000x_plus", tolerances.get("rate_1000x_plus", DEFAULT_TOLERANCE_RATE_1000X_PLUS)),
        ("rate_10000x_plus", tolerances.get("rate_10000x_plus", DEFAULT_TOLERANCE_RATE_10000X_PLUS)),
        ("max_win_x", tolerances.get("max_win_x", DEFAULT_TOLERANCE_MAX_WIN_X)),
    ]

    for field, tolerance in checks:
        try:
            run_val = float(run_row.get(field, 0))
            baseline_val = float(baseline_row.get(field, 0))

            # Special case: if baseline is 0, run being 0 is not regression
            if baseline_val == 0 and run_val == 0:
                messages.append(f"PASS: {field}: {run_val:.6f} (baseline=0, run=0, no regression possible)")
                continue

            # Minimum allowed value
            min_allowed = baseline_val - tolerance

            if run_val >= min_allowed:
                diff = run_val - baseline_val
                messages.append(
                    f"PASS: {field}: {run_val:.6f} >= {min_allowed:.6f} "
                    f"(baseline={baseline_val:.6f}, diff={diff:+.6f})"
                )
            else:
                all_passed = False
                regression = baseline_val - run_val
                messages.append(
                    f"FAIL: {field}: {run_val:.6f} < {min_allowed:.6f} "
                    f"(baseline={baseline_val:.6f}, regression={regression:.6f}, tolerance={tolerance})"
                )

        except (ValueError, TypeError):
            all_passed = False
            messages.append(f"FAIL: {field}: could not parse values")

    return all_passed, messages


def run_tail_progression(
    baseline_path: Path,
    cli_mode: str | None,
    cli_rounds: int | None,
    cli_seed: str | None,
    use_baseline_params: bool,
    verbose: bool,
    tolerances: dict[str, float],
) -> int:
    """
    Run tail progression check: simulate once, compare to baseline for regression.

    Args:
        baseline_path: Path to baseline CSV
        cli_mode: Mode from CLI (can be None to use baseline)
        cli_rounds: Rounds from CLI (can be None to use baseline)
        cli_seed: Seed from CLI (can be None to use baseline)
        use_baseline_params: If True, always use params from baseline CSV
        verbose: Show progress
        tolerances: Tolerance overrides

    Returns:
        0 if passed, 1 if failed
    """
    # Validate baseline file exists
    if not baseline_path.exists():
        print(f"ERROR: Baseline file not found: {baseline_path}")
        print("Hint: Generate baseline with 'make tail-baseline' first.")
        return 1

    # Load baseline CSV
    baseline_row = load_csv_row(baseline_path)
    if baseline_row is None:
        print(f"ERROR: Baseline CSV is empty or invalid: {baseline_path}")
        return 1

    # Validate required fields
    is_valid, missing = validate_baseline_csv(baseline_row)
    if not is_valid:
        print(f"ERROR: Baseline CSV missing required fields: {', '.join(missing)}")
        return 1

    # Extract baseline params
    baseline_mode, baseline_rounds, baseline_seed = get_baseline_params(baseline_row)
    baseline_config_hash = baseline_row.get("config_hash", "")
    baseline_debit_multiplier = baseline_row.get("debit_multiplier", "")

    # Validate config_hash matches before running simulation
    current_config_hash = get_config_hash()
    if current_config_hash != baseline_config_hash:
        print(f"ERROR: config_hash mismatch!")
        print(f"  Current: {current_config_hash}")
        print(f"  Baseline: {baseline_config_hash}")
        print("  Game math has changed since baseline was created.")
        print("  Regenerate baseline with 'make tail-baseline' or revert config changes.")
        return 1

    # Determine actual params to use
    if use_baseline_params or (cli_mode is None and cli_rounds is None and cli_seed is None):
        # Use baseline params
        mode = baseline_mode
        rounds = baseline_rounds
        seed = baseline_seed
        print("=== TAIL PROGRESSION GATE ===")
        print(f"Using baseline params: mode={mode}, seed={seed}, rounds={rounds}")
    else:
        # Strict mode: CLI params must match baseline exactly
        mode = cli_mode or baseline_mode
        rounds = cli_rounds if cli_rounds is not None else baseline_rounds
        seed = cli_seed or baseline_seed

        # Validate params match
        is_match, error_msg = validate_params_match(
            cli_mode, rounds, seed, baseline_mode, baseline_rounds, baseline_seed
        )
        if not is_match:
            print(f"ERROR: {error_msg}")
            return 1

        print("=== TAIL PROGRESSION GATE (strict params) ===")

    print(f"Baseline: {baseline_path}")
    print(f"Mode: {mode}")
    print(f"Rounds: {rounds}")
    print(f"Seed: {seed}")
    print(f"Config hash: {current_config_hash}")
    print()

    # Run simulation
    print(f"Running simulation ({rounds} rounds)...")
    stats = run_simulation(
        mode=mode,
        rounds=rounds,
        seed_str=seed,
        verbose=verbose,
    )

    # Write to temp file to get CSV row format
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
        tmp_path = Path(f.name)

    generate_csv(
        mode=mode,
        rounds=rounds,
        seed_str=seed,
        stats=stats,
        output_path=str(tmp_path),
    )

    # Load run result
    run_row = load_csv_row(tmp_path)
    if run_row is None:
        print(f"ERROR: Failed to load generated CSV: {tmp_path}")
        tmp_path.unlink(missing_ok=True)
        return 1

    # Validate debit_multiplier matches
    run_debit_multiplier = run_row.get("debit_multiplier", "")
    config_match, config_error = validate_config_match(
        current_config_hash, baseline_config_hash,
        run_debit_multiplier, baseline_debit_multiplier,
    )
    if not config_match:
        print(f"ERROR: {config_error}")
        tmp_path.unlink(missing_ok=True)
        return 1

    # Check for tail regression
    passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

    # Print results table
    print()
    print("=" * 80)
    print("TAIL PROGRESSION RESULTS")
    print("=" * 80)
    print(f"{'Field':<25} | {'Run':>15} | {'Baseline':>15} | {'Status':<10}")
    print("-" * 80)

    key_fields = ["rate_1000x_plus", "rate_10000x_plus", "max_win_x", "capped_rate"]
    for field in key_fields:
        run_val = run_row.get(field, "N/A")
        baseline_val = baseline_row.get(field, "N/A")
        try:
            run_f = float(run_val)
            baseline_f = float(baseline_val)
            tolerance = tolerances.get(
                field.replace("rate_", ""),
                DEFAULT_TOLERANCE_RATE_1000X_PLUS if "rate" in field else DEFAULT_TOLERANCE_MAX_WIN_X
            )
            # Use the correct tolerance key
            if field == "rate_1000x_plus":
                tolerance = tolerances.get("rate_1000x_plus", DEFAULT_TOLERANCE_RATE_1000X_PLUS)
            elif field == "rate_10000x_plus":
                tolerance = tolerances.get("rate_10000x_plus", DEFAULT_TOLERANCE_RATE_10000X_PLUS)
            elif field == "max_win_x":
                tolerance = tolerances.get("max_win_x", DEFAULT_TOLERANCE_MAX_WIN_X)
            else:
                tolerance = tolerances.get("rate_1000x_plus", DEFAULT_TOLERANCE_RATE_1000X_PLUS)

            # Status: PASS if run >= baseline - tolerance (no regression)
            min_allowed = baseline_f - tolerance
            status = "PASS" if run_f >= min_allowed or (baseline_f == 0 and run_f == 0) else "FAIL"
        except (ValueError, TypeError):
            status = "ERROR"
        print(f"{field:<25} | {run_val:>15} | {baseline_val:>15} | {status:<10}")

    print("-" * 80)

    # Print detailed messages
    if messages:
        print()
        print("Details:")
        for msg in messages:
            print(f"  {msg}")

    print()
    print("=" * 80)
    if passed:
        print("RESULT: PASSED - No tail regression detected")
    else:
        print("RESULT: FAILED - Tail regression detected beyond tolerance")
    print("=" * 80)

    # Cleanup temp file
    tmp_path.unlink(missing_ok=True)

    return 0 if passed else 1


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Tail Progression Gate: Check for tail metric regression"
    )
    parser.add_argument(
        "--compare-to",
        type=str,
        required=True,
        help="Path to baseline CSV for comparison",
    )
    parser.add_argument(
        "--mode",
        choices=["buy"],  # v1: only buy mode supported
        default=None,
        help="Mode (v1: only 'buy' supported; defaults to baseline mode)",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=None,
        help="Number of rounds (defaults to baseline rounds)",
    )
    parser.add_argument(
        "--seed",
        type=str,
        default=None,
        help="Seed string (defaults to baseline seed)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress during simulation",
    )

    # Tolerance overrides
    parser.add_argument(
        "--tolerance-rate-1000x-plus",
        type=float,
        default=DEFAULT_TOLERANCE_RATE_1000X_PLUS,
        help=f"Tolerance for rate_1000x_plus in percentage points (default: {DEFAULT_TOLERANCE_RATE_1000X_PLUS})",
    )
    parser.add_argument(
        "--tolerance-rate-10000x-plus",
        type=float,
        default=DEFAULT_TOLERANCE_RATE_10000X_PLUS,
        help=f"Tolerance for rate_10000x_plus in percentage points (default: {DEFAULT_TOLERANCE_RATE_10000X_PLUS})",
    )
    parser.add_argument(
        "--tolerance-max-win-x",
        type=float,
        default=DEFAULT_TOLERANCE_MAX_WIN_X,
        help=f"Tolerance for max_win_x in x-multiplier (default: {DEFAULT_TOLERANCE_MAX_WIN_X})",
    )

    args = parser.parse_args()

    # Build tolerances dict
    tolerances = {
        "rate_1000x_plus": args.tolerance_rate_1000x_plus,
        "rate_10000x_plus": args.tolerance_rate_10000x_plus,
        "max_win_x": args.tolerance_max_win_x,
    }

    # Determine if using baseline params (default behavior when no explicit params given)
    use_baseline_params = args.mode is None and args.rounds is None and args.seed is None

    return run_tail_progression(
        baseline_path=Path(args.compare_to),
        cli_mode=args.mode,
        cli_rounds=args.rounds,
        cli_seed=args.seed,
        use_baseline_params=use_baseline_params,
        verbose=args.verbose,
        tolerances=tolerances,
    )


if __name__ == "__main__":
    sys.exit(main())
