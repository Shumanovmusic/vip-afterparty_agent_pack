#!/usr/bin/env python3
"""
Diff audit script to diagnose RTP differences between gate tests and audit-long.

Runs audit simulations twice with identical parameters and compares results
to verify reproducibility. If results differ, that indicates a bug or
non-determinism in the simulation.

Usage:
    python -m scripts.diff_audit --verbose  # Uses gate defaults: 20k rounds, AUDIT_2025
    python -m scripts.diff_audit --rounds 50000 --seed CUSTOM_SEED --verbose

Compare to reference (strict - params must match):
    python -m scripts.diff_audit --compare-to ../out/audit_base.csv --mode base --rounds 100000 --seed AUDIT_2025

Compare to reference (use reference params automatically):
    python -m scripts.diff_audit --compare-to ../out/audit_base.csv --use-reference-params --verbose
"""
import argparse
import csv
import sys
import tempfile
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.audit_sim import (
    generate_csv,
    get_config_hash,
    run_simulation,
)

# Default parameters - match Step 5c (RTP Targets Gate) exactly
DEFAULT_ROUNDS = 20000
DEFAULT_SEED = "AUDIT_2025"  # Same as test_rtp_targets_gate.py
DEFAULT_OUTDIR = "../out/diff"

# Modes to compare
MODES = ["base", "buy", "hype"]

# Comparison thresholds for determinism check
RTP_EPSILON = 0.0001  # RTP must match within 0.0001%

# Required fields for --compare-to reference comparison
REQUIRED_COMPARE_FIELDS = [
    "config_hash",
    "mode",
    "rounds",
    "seed",
    "debit_multiplier",
    "rtp",
    "hit_freq",
    "bonus_entry_rate",
    "p95_win_x",
    "p99_win_x",
    "max_win_x",
    "rate_1000x_plus",
    "rate_10000x_plus",
    "capped_rate",
    "scatter_chance_base",
    "scatter_chance_effective",
    "scatter_chance_multiplier",
]

# Default tolerances for --compare-to mode
DEFAULT_TOLERANCE_RTP = 0.02  # 0.02 percentage points
DEFAULT_TOLERANCE_HIT_FREQ = 0.02  # 0.02 percentage points
DEFAULT_TOLERANCE_BONUS_RATE = 0.0002  # 0.0002 percentage points (0.02%)
DEFAULT_TOLERANCE_TAIL_RATE = 0.0002  # for rate_1000x_plus, rate_10000x_plus, capped_rate
DEFAULT_TOLERANCE_QUANTILES = 0.01  # for p95_win_x, p99_win_x, max_win_x

# Scatter fields require exact match (string equality)
SCATTER_EXACT_FIELDS = [
    "scatter_chance_base",
    "scatter_chance_effective",
    "scatter_chance_multiplier",
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


def compare_results(
    run_a: dict[str, str],
    run_b: dict[str, str],
    mode: str,
) -> tuple[bool, list[str]]:
    """
    Compare two simulation results.

    Returns:
        (is_identical, list of differences)
    """
    differences: list[str] = []

    # Critical fields that must match exactly
    critical_fields = ["config_hash", "mode", "rounds", "seed"]
    for field in critical_fields:
        if run_a.get(field) != run_b.get(field):
            differences.append(f"CRITICAL: {field} mismatch: {run_a.get(field)} vs {run_b.get(field)}")

    # Numeric fields to compare with tolerance
    numeric_fields = [
        ("rtp", RTP_EPSILON),
        ("hit_freq", RTP_EPSILON),
        ("bonus_entry_rate", RTP_EPSILON),
        ("avg_debit", 0.0001),
        ("avg_credit", 0.0001),
        ("max_win_x", 0.01),
        ("rate_1000x_plus", RTP_EPSILON),
        ("rate_10000x_plus", RTP_EPSILON),
        ("capped_rate", RTP_EPSILON),
    ]

    for field, epsilon in numeric_fields:
        try:
            val_a = float(run_a.get(field, 0))
            val_b = float(run_b.get(field, 0))
            if abs(val_a - val_b) > epsilon:
                differences.append(f"{field}: {val_a:.6f} vs {val_b:.6f} (diff: {abs(val_a - val_b):.6f})")
        except (ValueError, TypeError):
            differences.append(f"{field}: could not parse values")

    is_identical = len(differences) == 0
    return is_identical, differences


def print_comparison_table(results: dict[str, dict[str, Any]]) -> None:
    """Print formatted comparison table."""
    print("\n" + "=" * 80)
    print("DIFF AUDIT COMPARISON TABLE")
    print("=" * 80)

    # Header
    print(f"{'Mode':<8} | {'Run':<12} | {'RTP':>10} | {'Hit%':>8} | {'Bonus%':>8} | {'Max Win':>10}")
    print("-" * 80)

    for mode in MODES:
        for run_label in ["gate-like", "long-like"]:
            key = f"{mode}_{run_label}"
            if key in results:
                r = results[key]
                print(
                    f"{mode:<8} | {run_label:<12} | "
                    f"{float(r.get('rtp', 0)):>10.4f} | "
                    f"{float(r.get('hit_freq', 0)):>8.4f} | "
                    f"{float(r.get('bonus_entry_rate', 0)):>8.4f} | "
                    f"{float(r.get('max_win_x', 0)):>10.2f}"
                )
        print("-" * 80)


def print_diff_summary(
    results: dict[str, dict[str, Any]],
    comparisons: dict[str, tuple[bool, list[str]]],
) -> bool:
    """
    Print diff summary and return True if all comparisons passed.
    """
    print("\n" + "=" * 80)
    print("DIFF SUMMARY")
    print("=" * 80)

    all_passed = True
    for mode in MODES:
        key = mode
        if key in comparisons:
            is_identical, differences = comparisons[key]
            status = "PASS" if is_identical else "FAIL"
            print(f"\n{mode.upper()}: {status}")

            if not is_identical:
                all_passed = False
                for diff in differences:
                    print(f"  - {diff}")
            else:
                print("  Results are identical (deterministic)")

    print("\n" + "=" * 80)
    if all_passed:
        print("ALL MODES PASSED - Simulations are deterministic")
    else:
        print("SOME MODES FAILED - Check differences above")
    print("=" * 80)

    return all_passed


def validate_reference_csv(ref_row: dict[str, str]) -> tuple[bool, list[str]]:
    """
    Validate reference CSV has all required fields.

    Returns:
        (is_valid, missing_fields)
    """
    missing = [f for f in REQUIRED_COMPARE_FIELDS if f not in ref_row]
    return len(missing) == 0, missing


def get_reference_params(ref_row: dict[str, str]) -> tuple[str, int, str]:
    """
    Extract mode, rounds, seed from reference CSV row.

    Returns:
        (mode, rounds, seed)
    """
    mode = ref_row.get("mode", "")
    rounds = int(ref_row.get("rounds", 0))
    seed = ref_row.get("seed", "")
    return mode, rounds, seed


def validate_params_match(
    cli_mode: str | None,
    cli_rounds: int,
    cli_seed: str,
    ref_mode: str,
    ref_rounds: int,
    ref_seed: str,
) -> tuple[bool, str]:
    """
    Validate CLI params match reference params exactly.

    Returns:
        (is_match, error_message)
    """
    mismatches = []

    if cli_mode is not None and cli_mode != ref_mode:
        mismatches.append(f"mode: got {cli_mode}, reference has {ref_mode}")

    if cli_rounds != ref_rounds:
        mismatches.append(f"rounds: got {cli_rounds}, reference has {ref_rounds}")

    if cli_seed != ref_seed:
        mismatches.append(f"seed: got {cli_seed}, reference has {ref_seed}")

    if mismatches:
        msg = (
            f"Param mismatch: reference rounds={ref_rounds} seed={ref_seed} mode={ref_mode}, "
            f"got rounds={cli_rounds} seed={cli_seed} mode={cli_mode}.\n"
            f"Use --use-reference-params or pass matching params."
        )
        return False, msg

    return True, ""


def validate_config_match(
    run_config_hash: str,
    ref_config_hash: str,
    run_debit_multiplier: str,
    ref_debit_multiplier: str,
) -> tuple[bool, str]:
    """
    Validate config_hash and debit_multiplier match.

    Returns:
        (is_match, error_message)
    """
    errors = []

    if run_config_hash != ref_config_hash:
        errors.append(
            f"config_hash mismatch: run={run_config_hash}, reference={ref_config_hash}. "
            f"Game math has changed since reference was created."
        )

    if run_debit_multiplier != ref_debit_multiplier:
        errors.append(
            f"debit_multiplier mismatch: run={run_debit_multiplier}, reference={ref_debit_multiplier}. "
            f"Mode cost settings differ."
        )

    if errors:
        return False, "\n".join(errors)

    return True, ""


def compare_to_reference(
    run_row: dict[str, str],
    ref_row: dict[str, str],
    tolerances: dict[str, float],
) -> tuple[bool, list[str]]:
    """
    Compare a single run against a reference CSV row.

    Args:
        run_row: Current simulation result
        ref_row: Reference CSV row to compare against
        tolerances: Dict of field -> tolerance values

    Returns:
        (passed, list of differences/failures)
    """
    differences: list[str] = []

    # Check config_hash match (warning, not failure)
    if run_row.get("config_hash") != ref_row.get("config_hash"):
        differences.append(
            f"WARNING: config_hash differs: run={run_row.get('config_hash')} vs ref={ref_row.get('config_hash')}"
        )

    # Check mode match
    if run_row.get("mode") != ref_row.get("mode"):
        differences.append(
            f"FAIL: mode mismatch: run={run_row.get('mode')} vs ref={ref_row.get('mode')}"
        )
        return False, differences

    # Scatter fields: exact string equality
    for field in SCATTER_EXACT_FIELDS:
        run_val = run_row.get(field, "")
        ref_val = ref_row.get(field, "")
        if run_val != ref_val:
            differences.append(f"FAIL: {field} exact mismatch: run={run_val} vs ref={ref_val}")

    # Numeric fields with tolerances
    tolerance_map = {
        "rtp": tolerances.get("rtp", DEFAULT_TOLERANCE_RTP),
        "hit_freq": tolerances.get("hit_freq", DEFAULT_TOLERANCE_HIT_FREQ),
        "bonus_entry_rate": tolerances.get("bonus_rate", DEFAULT_TOLERANCE_BONUS_RATE),
        "p95_win_x": tolerances.get("quantiles", DEFAULT_TOLERANCE_QUANTILES),
        "p99_win_x": tolerances.get("quantiles", DEFAULT_TOLERANCE_QUANTILES),
        "max_win_x": tolerances.get("quantiles", DEFAULT_TOLERANCE_QUANTILES),
        "rate_1000x_plus": tolerances.get("tail_rate", DEFAULT_TOLERANCE_TAIL_RATE),
        "rate_10000x_plus": tolerances.get("tail_rate", DEFAULT_TOLERANCE_TAIL_RATE),
        "capped_rate": tolerances.get("tail_rate", DEFAULT_TOLERANCE_TAIL_RATE),
    }

    for field, tolerance in tolerance_map.items():
        try:
            run_val = float(run_row.get(field, 0))
            ref_val = float(ref_row.get(field, 0))
            diff = abs(run_val - ref_val)
            if diff > tolerance:
                differences.append(
                    f"FAIL: {field}: {run_val:.6f} vs {ref_val:.6f} "
                    f"(diff={diff:.6f}, tolerance={tolerance})"
                )
        except (ValueError, TypeError):
            differences.append(f"FAIL: {field}: could not parse values")

    # Determine overall pass/fail
    has_failures = any(d.startswith("FAIL:") for d in differences)
    return not has_failures, differences


def run_compare_to_mode(
    compare_to_path: Path,
    cli_mode: str | None,
    cli_rounds: int,
    cli_seed: str,
    use_reference_params: bool,
    verbose: bool,
    tolerances: dict[str, float],
) -> int:
    """
    Run compare-to mode: simulate once, compare to reference.

    Args:
        compare_to_path: Path to reference CSV
        cli_mode: Mode from CLI (can be None if use_reference_params)
        cli_rounds: Rounds from CLI
        cli_seed: Seed from CLI
        use_reference_params: If True, use params from reference CSV
        verbose: Show progress
        tolerances: Tolerance overrides

    Returns:
        0 if passed, 1 if failed
    """
    # Validate reference file exists
    if not compare_to_path.exists():
        print(f"ERROR: Reference file not found: {compare_to_path}")
        print("Hint: Create reference with audit_sim or run 'make audit-long' first.")
        return 1

    # Load reference CSV
    ref_row = load_csv_row(compare_to_path)
    if ref_row is None:
        print(f"ERROR: Reference CSV is empty or invalid: {compare_to_path}")
        return 1

    # Validate required fields
    is_valid, missing = validate_reference_csv(ref_row)
    if not is_valid:
        print(f"ERROR: Reference CSV missing required fields: {', '.join(missing)}")
        return 1

    # Extract reference params
    ref_mode, ref_rounds, ref_seed = get_reference_params(ref_row)
    ref_config_hash = ref_row.get("config_hash", "")
    ref_debit_multiplier = ref_row.get("debit_multiplier", "")

    # Determine actual params to use
    if use_reference_params:
        # Use reference params, ignore CLI params
        mode = ref_mode
        rounds = ref_rounds
        seed = ref_seed
        print("=== DIFF AUDIT: COMPARE-TO MODE (--use-reference-params) ===")
        print(f"Using reference params: mode={mode}, seed={seed}, rounds={rounds}")
    else:
        # Strict mode: CLI params must match reference exactly
        mode = cli_mode
        rounds = cli_rounds
        seed = cli_seed

        # Validate params match
        is_match, error_msg = validate_params_match(
            cli_mode, cli_rounds, cli_seed, ref_mode, ref_rounds, ref_seed
        )
        if not is_match:
            print(f"ERROR: {error_msg}")
            return 1

        # If cli_mode was None but matched (shouldn't happen with strict validation)
        if mode is None:
            mode = ref_mode

        print("=== DIFF AUDIT: COMPARE-TO MODE (strict) ===")

    # Validate config_hash matches before running simulation
    current_config_hash = get_config_hash()
    if current_config_hash != ref_config_hash:
        print(f"ERROR: config_hash mismatch!")
        print(f"  Current: {current_config_hash}")
        print(f"  Reference: {ref_config_hash}")
        print("  Game math has changed since reference was created.")
        print("  Regenerate reference with current config or revert config changes.")
        return 1

    print(f"Reference: {compare_to_path}")
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
        current_config_hash, ref_config_hash,
        run_debit_multiplier, ref_debit_multiplier,
    )
    if not config_match:
        print(f"ERROR: {config_error}")
        tmp_path.unlink(missing_ok=True)
        return 1

    # Compare
    passed, differences = compare_to_reference(run_row, ref_row, tolerances)

    # Print comparison table
    print()
    print("=" * 80)
    print("COMPARISON RESULTS")
    print("=" * 80)
    print(f"{'Field':<25} | {'Run':>15} | {'Reference':>15} | {'Status':<10}")
    print("-" * 80)

    key_fields = ["rtp", "hit_freq", "bonus_entry_rate", "max_win_x", "rate_1000x_plus"]
    for field in key_fields:
        run_val = run_row.get(field, "N/A")
        ref_val = ref_row.get(field, "N/A")
        try:
            run_f = float(run_val)
            ref_f = float(ref_val)
            tolerance = {
                "rtp": tolerances.get("rtp", DEFAULT_TOLERANCE_RTP),
                "hit_freq": tolerances.get("hit_freq", DEFAULT_TOLERANCE_HIT_FREQ),
                "bonus_entry_rate": tolerances.get("bonus_rate", DEFAULT_TOLERANCE_BONUS_RATE),
                "max_win_x": tolerances.get("quantiles", DEFAULT_TOLERANCE_QUANTILES),
                "rate_1000x_plus": tolerances.get("tail_rate", DEFAULT_TOLERANCE_TAIL_RATE),
            }.get(field, 0.01)
            status = "PASS" if abs(run_f - ref_f) <= tolerance else "FAIL"
        except (ValueError, TypeError):
            status = "ERROR"
        print(f"{field:<25} | {run_val:>15} | {ref_val:>15} | {status:<10}")

    print("-" * 80)

    # Print all differences
    if differences:
        print()
        print("Details:")
        for d in differences:
            print(f"  {d}")

    print()
    print("=" * 80)
    if passed:
        print("RESULT: PASSED - Run matches reference (deterministic)")
    else:
        print("RESULT: FAILED - Run differs from reference beyond tolerances")
    print("=" * 80)

    # Cleanup temp file
    tmp_path.unlink(missing_ok=True)

    return 0 if passed else 1


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Diff audit script to diagnose RTP differences"
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=DEFAULT_ROUNDS,
        help=f"Number of rounds per simulation (default: {DEFAULT_ROUNDS})",
    )
    parser.add_argument(
        "--seed",
        type=str,
        default=DEFAULT_SEED,
        help=f"Seed string (default: {DEFAULT_SEED})",
    )
    parser.add_argument(
        "--outdir",
        type=str,
        default=DEFAULT_OUTDIR,
        help=f"Output directory (default: {DEFAULT_OUTDIR})",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress during simulation",
    )

    # Compare-to mode arguments
    parser.add_argument(
        "--compare-to",
        type=str,
        default=None,
        help="Path to reference CSV for comparison (single-run mode)",
    )
    parser.add_argument(
        "--mode",
        choices=["base", "buy", "hype"],
        default=None,
        help="Mode for --compare-to (must match reference unless --use-reference-params)",
    )
    parser.add_argument(
        "--use-reference-params",
        action="store_true",
        help="Use mode/rounds/seed from reference CSV instead of CLI args",
    )

    # Tolerance overrides for --compare-to mode
    parser.add_argument(
        "--tolerance-rtp",
        type=float,
        default=DEFAULT_TOLERANCE_RTP,
        help=f"RTP tolerance in percentage points (default: {DEFAULT_TOLERANCE_RTP})",
    )
    parser.add_argument(
        "--tolerance-hit-freq",
        type=float,
        default=DEFAULT_TOLERANCE_HIT_FREQ,
        help=f"Hit frequency tolerance (default: {DEFAULT_TOLERANCE_HIT_FREQ})",
    )
    parser.add_argument(
        "--tolerance-bonus-rate",
        type=float,
        default=DEFAULT_TOLERANCE_BONUS_RATE,
        help=f"Bonus entry rate tolerance (default: {DEFAULT_TOLERANCE_BONUS_RATE})",
    )
    parser.add_argument(
        "--tolerance-tail-rate",
        type=float,
        default=DEFAULT_TOLERANCE_TAIL_RATE,
        help=f"Tail rate tolerance (1000x+, 10000x+, capped) (default: {DEFAULT_TOLERANCE_TAIL_RATE})",
    )
    parser.add_argument(
        "--tolerance-quantiles",
        type=float,
        default=DEFAULT_TOLERANCE_QUANTILES,
        help=f"Quantile tolerance (p95, p99, max_win_x) (default: {DEFAULT_TOLERANCE_QUANTILES})",
    )

    args = parser.parse_args()

    # Handle --compare-to mode
    if args.compare_to:
        # Validate args combination
        if args.use_reference_params:
            # --use-reference-params: mode/rounds/seed come from reference
            if args.mode is not None:
                print("WARNING: --mode ignored when --use-reference-params is set")
        else:
            # Strict mode: --mode is required
            if args.mode is None:
                print("ERROR: --mode is required when using --compare-to without --use-reference-params")
                return 1

        tolerances = {
            "rtp": args.tolerance_rtp,
            "hit_freq": args.tolerance_hit_freq,
            "bonus_rate": args.tolerance_bonus_rate,
            "tail_rate": args.tolerance_tail_rate,
            "quantiles": args.tolerance_quantiles,
        }

        return run_compare_to_mode(
            compare_to_path=Path(args.compare_to),
            cli_mode=args.mode,
            cli_rounds=args.rounds,
            cli_seed=args.seed,
            use_reference_params=args.use_reference_params,
            verbose=args.verbose,
            tolerances=tolerances,
        )

    # Resolve output directory relative to script location
    script_dir = Path(__file__).parent
    outdir = (script_dir / args.outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    config_hash = get_config_hash()
    print(f"=== DIFF AUDIT ===")
    print(f"Rounds: {args.rounds}")
    print(f"Seed: {args.seed}")
    print(f"Output dir: {outdir}")
    print(f"Config hash: {config_hash}")
    print()

    results: dict[str, dict[str, Any]] = {}
    comparisons: dict[str, tuple[bool, list[str]]] = {}

    # Run simulations for each mode
    for mode in MODES:
        print(f"\n--- Mode: {mode} ---")

        # Run A: "gate-like" simulation
        print(f"Running gate-like simulation ({args.rounds} rounds)...")
        stats_a = run_simulation(
            mode=mode,
            rounds=args.rounds,
            seed_str=args.seed,
            verbose=args.verbose,
        )
        out_path_a = outdir / f"diff_{mode}_gate.csv"
        generate_csv(
            mode=mode,
            rounds=args.rounds,
            seed_str=args.seed,
            stats=stats_a,
            output_path=str(out_path_a),
        )
        row_a = load_csv_row(out_path_a)
        if row_a is None:
            print(f"ERROR: Failed to load {out_path_a}")
            return 1
        results[f"{mode}_gate-like"] = row_a

        # Run B: "long-like" simulation (same parameters)
        print(f"Running long-like simulation ({args.rounds} rounds)...")
        stats_b = run_simulation(
            mode=mode,
            rounds=args.rounds,
            seed_str=args.seed,
            verbose=args.verbose,
        )
        out_path_b = outdir / f"diff_{mode}_long.csv"
        generate_csv(
            mode=mode,
            rounds=args.rounds,
            seed_str=args.seed,
            stats=stats_b,
            output_path=str(out_path_b),
        )
        row_b = load_csv_row(out_path_b)
        if row_b is None:
            print(f"ERROR: Failed to load {out_path_b}")
            return 1
        results[f"{mode}_long-like"] = row_b

        # Compare results
        is_identical, differences = compare_results(row_a, row_b, mode)
        comparisons[mode] = (is_identical, differences)

        # Fail fast on config_hash mismatch
        if row_a.get("config_hash") != row_b.get("config_hash"):
            print(f"FAIL FAST: config_hash mismatch for {mode}")
            print(f"  gate-like: {row_a.get('config_hash')}")
            print(f"  long-like: {row_b.get('config_hash')}")
            return 1

    # Print comparison table
    print_comparison_table(results)

    # Print diff summary
    all_passed = print_diff_summary(results, comparisons)

    print(f"\nOutput files written to: {outdir}")
    print("  " + "\n  ".join(str(f) for f in sorted(outdir.glob("diff_*.csv"))))

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
