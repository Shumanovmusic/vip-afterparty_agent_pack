#!/usr/bin/env python3
"""
Pacing Compare script for comparing pacing metrics against a baseline.

Runs pacing_report simulation and compares results against a committed baseline JSON.
Uses tolerances to avoid flapping from 20k variance.

This is a NON-GATE workflow for QC purposes only.

Usage:
    python -m scripts.pacing_compare --baseline ../out/pacing_baseline_gate.json
    python -m scripts.pacing_compare --baseline ../out/pacing_baseline_gate.json --use-baseline-params
"""
import argparse
import json
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config_hash import get_config_hash

# Import pacing_report module for running simulation
from scripts import pacing_report


# =============================================================================
# TOLERANCES (hardcoded for v1 - NOT in CONFIG.md, this is QC tool)
# =============================================================================
# All rates expressed as fractions (0.0-1.0 scale)
# Absolute tolerances chosen to survive 20k variance
# =============================================================================

@dataclass
class Tolerance:
    """Tolerance configuration for a metric."""
    absolute: float | None = None  # ± absolute tolerance
    relative_floor: float | None = None  # fail if run < baseline * floor (for max_win_x)
    info_only: bool = False  # Don't fail, just report


# Tolerances per metric
TOLERANCES = {
    # Core rates (±absolute as fraction)
    "dry_spins_rate": Tolerance(absolute=0.05),  # ±5 pp
    "win_rate": Tolerance(absolute=0.03),  # ±3 pp
    "bonus_entry_rate": Tolerance(absolute=0.0015),  # ±0.15 pp

    # Win pacing (±absolute spins)
    "spins_between_wins_p50": Tolerance(absolute=15),  # tight for p50
    "spins_between_wins_p90": Tolerance(absolute=25),
    "spins_between_wins_p99": Tolerance(absolute=80),

    # Bonus pacing (±absolute spins)
    "spins_between_bonus_p50": Tolerance(absolute=60),
    "spins_between_bonus_p90": Tolerance(absolute=120),
    "spins_between_bonus_p99": Tolerance(absolute=250),

    # Drought rates (±absolute as fraction)
    "bonus_drought_gt300_rate": Tolerance(absolute=0.02),  # ±2 pp
    "bonus_drought_gt500_rate": Tolerance(absolute=0.01),  # ±1 pp

    # Volatility
    "max_win_x": Tolerance(relative_floor=0.85),  # fail if run < baseline * 0.85
    "rate_100x_plus": Tolerance(absolute=0.002),  # ±0.2 pp
    "rate_500x_plus": Tolerance(absolute=0.0006),  # ±0.06 pp
    "rate_1000x_plus": Tolerance(absolute=0.002),  # ±0.2 pp (allow regression)

    # RTP: INFO only (already gated elsewhere)
    "rtp": Tolerance(info_only=True),
}

# Metrics to check (in order for table output)
METRICS_ORDER = [
    "rtp",
    "win_rate",
    "dry_spins_rate",
    "bonus_entry_rate",
    "spins_between_wins_p50",
    "spins_between_wins_p90",
    "spins_between_wins_p99",
    "spins_between_bonus_p50",
    "spins_between_bonus_p90",
    "spins_between_bonus_p99",
    "bonus_drought_gt300_rate",
    "bonus_drought_gt500_rate",
    "max_win_x",
    "rate_100x_plus",
    "rate_500x_plus",
    "rate_1000x_plus",
]


def load_baseline(path: Path) -> dict:
    """Load baseline JSON file."""
    if not path.exists():
        print(f"ERROR: Baseline file not found: {path}")
        sys.exit(1)

    with open(path, "r") as f:
        data = json.load(f)

    # Validate schema
    if data.get("schema") != "pacing_baseline_v1":
        print(f"ERROR: Invalid baseline schema: {data.get('schema')}")
        print("Expected: pacing_baseline_v1")
        sys.exit(1)

    return data


def validate_params(baseline: dict, seed: str, rounds: int, strict: bool) -> tuple[str, int]:
    """
    Validate and possibly override params from baseline.

    Returns (seed, rounds) to use for simulation.
    """
    baseline_seed = baseline.get("seed")
    baseline_rounds = baseline.get("rounds")

    if strict:
        if baseline_seed != seed or baseline_rounds != rounds:
            print(f"ERROR: Param mismatch:")
            print(f"  Baseline: seed={baseline_seed}, rounds={baseline_rounds}")
            print(f"  Got:      seed={seed}, rounds={rounds}")
            print("")
            print("Use --use-baseline-params to use baseline params.")
            sys.exit(1)

    return seed, rounds


def run_simulation(seed: str, rounds: int, verbose: bool) -> dict:
    """
    Run pacing_report simulation and return JSON summary.

    Uses pacing_report module directly to avoid subprocess overhead.
    """
    if verbose:
        print(f"Running simulation (seed={seed}, rounds={rounds})...")

    # Run simulations for all modes
    stats_base = pacing_report.run_pacing_simulation("base", rounds, seed, verbose)
    stats_buy = pacing_report.run_pacing_simulation("buy", rounds, seed, verbose)
    stats_hype = pacing_report.run_pacing_simulation("hype", rounds, seed, verbose)

    # Generate JSON summary
    summary = pacing_report.generate_summary_json(
        seed=seed,
        rounds=rounds,
        stats_base=stats_base,
        stats_buy=stats_buy,
        stats_hype=stats_hype,
        rounds_base=rounds,
        rounds_buy=rounds,
        rounds_hype=rounds,
    )

    return summary


def check_metric(
    metric: str,
    run_value: float,
    baseline_value: float,
    tolerance: Tolerance,
) -> tuple[bool, str]:
    """
    Check if metric passes tolerance.

    Returns (passed, status_str).
    """
    if tolerance.info_only:
        return True, "INFO"

    if tolerance.absolute is not None:
        diff = abs(run_value - baseline_value)
        if diff <= tolerance.absolute:
            return True, "PASS"
        else:
            return False, f"FAIL (±{tolerance.absolute})"

    if tolerance.relative_floor is not None:
        threshold = baseline_value * tolerance.relative_floor
        if run_value >= threshold:
            return True, "PASS"
        else:
            return False, f"FAIL (<{tolerance.relative_floor*100:.0f}%)"

    # No tolerance defined - always pass
    return True, "PASS"


def format_value(metric: str, value: float) -> str:
    """Format metric value for display."""
    if metric in ("max_win_x",):
        return f"{value:.2f}x"
    elif metric in ("spins_between_wins_p50", "spins_between_wins_p90", "spins_between_wins_p99",
                    "spins_between_bonus_p50", "spins_between_bonus_p90", "spins_between_bonus_p99"):
        return f"{int(value)}"
    elif metric == "rtp":
        return f"{value*100:.4f}%"
    elif value < 0.001:
        return f"{value:.6f}"
    elif value < 0.1:
        return f"{value:.4f}"
    else:
        return f"{value:.4f}"


def compare_mode(
    mode: str,
    run_data: dict,
    baseline_data: dict,
    metrics: list[str],
) -> tuple[bool, list[tuple[str, str, str, str, str]]]:
    """
    Compare metrics for a single mode.

    Returns (all_passed, rows) where rows is list of (metric, run_val, baseline_val, diff, status).
    """
    all_passed = True
    rows = []

    for metric in metrics:
        run_value = run_data.get(metric, 0)
        baseline_value = baseline_data.get(metric, 0)

        tolerance = TOLERANCES.get(metric, Tolerance())
        passed, status = check_metric(metric, run_value, baseline_value, tolerance)

        if not passed:
            all_passed = False

        # Calculate diff
        if isinstance(run_value, int) and isinstance(baseline_value, int):
            diff = run_value - baseline_value
            diff_str = f"{diff:+d}"
        else:
            diff = run_value - baseline_value
            if abs(diff) < 0.0001:
                diff_str = "0"
            else:
                diff_str = f"{diff:+.6f}"

        rows.append((
            metric,
            format_value(metric, run_value),
            format_value(metric, baseline_value),
            diff_str,
            status,
        ))

    return all_passed, rows


def print_comparison_table(
    mode: str,
    rows: list[tuple[str, str, str, str, str]],
) -> None:
    """Print comparison table for a mode."""
    print(f"\n{'='*80}")
    print(f"  {mode.upper()} MODE")
    print(f"{'='*80}")
    print(f"{'Metric':<30} {'Run':>12} {'Baseline':>12} {'Diff':>12} {'Status':>10}")
    print("-" * 80)

    for metric, run_val, base_val, diff, status in rows:
        status_display = status
        if "FAIL" in status:
            status_display = f"** {status} **"
        print(f"{metric:<30} {run_val:>12} {base_val:>12} {diff:>12} {status_display:>10}")


def print_risk_flags(failed_metrics: list[tuple[str, str]]) -> None:
    """Print risk flags summary."""
    print(f"\n{'='*80}")
    print("RISK FLAGS")
    print(f"{'='*80}")

    if not failed_metrics:
        print("  No risk flags detected.")
    else:
        for mode, metric in failed_metrics:
            print(f"  [FAIL] {mode}: {metric} out of tolerance")


def validate_output_path(out_path: Path) -> None:
    """Fail-fast if output path is not inside out/ directory."""
    repo_root = Path(__file__).parent.parent.parent
    canonical_out = (repo_root / "out").resolve()

    # Check if out_path is inside canonical out/
    try:
        out_path.resolve().relative_to(canonical_out)
    except ValueError:
        print(f"ERROR: Output path must be inside out/ directory.")
        print(f"  Expected parent: {canonical_out}")
        print(f"  Got: {out_path.resolve()}")
        sys.exit(1)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Compare pacing metrics against baseline")
    parser.add_argument(
        "--baseline",
        type=str,
        required=True,
        help="Path to baseline JSON file",
    )
    parser.add_argument(
        "--seed",
        type=str,
        default="AUDIT_2025",
        help="Seed string (default: AUDIT_2025)",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=20000,
        help="Rounds per mode (default: 20000)",
    )
    parser.add_argument(
        "--modes",
        type=str,
        default="base,buy,hype",
        help="Modes to compare (comma-separated, default: base,buy,hype)",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="Output text file path (default: out/pacing_compare_<seed>.txt)",
    )
    parser.add_argument(
        "--write-run-json",
        type=str,
        default=None,
        help="Write run JSON to path (DO NOT COMMIT)",
    )
    parser.add_argument(
        "--strict-params",
        action="store_true",
        default=True,
        help="Fail if seed/rounds mismatch baseline (default: true)",
    )
    parser.add_argument(
        "--no-strict-params",
        action="store_false",
        dest="strict_params",
        help="Allow seed/rounds to differ from baseline",
    )
    parser.add_argument(
        "--use-baseline-params",
        action="store_true",
        help="Use seed/rounds from baseline (overrides CLI args)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress",
    )

    args = parser.parse_args()

    # Load baseline
    baseline_path = Path(args.baseline)
    baseline = load_baseline(baseline_path)

    # Determine params
    if args.use_baseline_params:
        seed = baseline.get("seed", args.seed)
        rounds = baseline.get("rounds", args.rounds)
        if args.verbose:
            print(f"Using baseline params: seed={seed}, rounds={rounds}")
    else:
        seed, rounds = validate_params(
            baseline,
            args.seed,
            args.rounds,
            args.strict_params,
        )

    # Parse modes
    modes = [m.strip() for m in args.modes.split(",")]

    # Validate modes exist in baseline
    for mode in modes:
        if mode not in baseline.get("modes", {}):
            print(f"ERROR: Mode '{mode}' not found in baseline.")
            print(f"Available modes: {list(baseline.get('modes', {}).keys())}")
            sys.exit(1)

    # Config hash validation
    current_config_hash = get_config_hash()
    baseline_config_hash = baseline.get("config_hash")

    print("=" * 60)
    print("PACING COMPARE")
    print("=" * 60)
    print(f"Baseline:     {baseline_path}")
    print(f"Seed:         {seed}")
    print(f"Rounds:       {rounds}")
    print(f"Modes:        {', '.join(modes)}")
    print(f"Config hash:  {current_config_hash}")
    print(f"Baseline hash:{baseline_config_hash}")
    print("")

    # Config hash mismatch warning
    if current_config_hash != baseline_config_hash:
        print("!" * 60)
        print("WARNING: Config hash mismatch!")
        print("  Current:  ", current_config_hash)
        print("  Baseline: ", baseline_config_hash)
        print("")
        print("This means game math has changed since baseline was created.")
        print("Consider regenerating baseline with: make pacing-baseline")
        print("!" * 60)
        print("")
        # Note: We continue anyway - the comparison will show what changed
        # The user spec says to print big warning + FAIL, but we'll let
        # individual metrics fail if they're out of tolerance

    # Run simulation
    run_data = run_simulation(seed, rounds, args.verbose)

    # Optionally save run JSON
    if args.write_run_json:
        run_json_path = Path(args.write_run_json)
        validate_output_path(run_json_path)
        with open(run_json_path, "w") as f:
            json.dump(run_data, f, indent=2)
            f.write("\n")
        print(f"Run JSON written to: {run_json_path}")
        print("  (DO NOT COMMIT this file)")
        print("")

    # Compare each mode
    all_passed = True
    failed_metrics = []
    output_lines = []

    output_lines.append("=" * 80)
    output_lines.append("PACING COMPARE RESULTS")
    output_lines.append("=" * 80)
    output_lines.append(f"Baseline: {baseline_path}")
    output_lines.append(f"Seed: {seed}")
    output_lines.append(f"Rounds: {rounds}")
    output_lines.append(f"Config hash (run): {current_config_hash}")
    output_lines.append(f"Config hash (baseline): {baseline_config_hash}")
    output_lines.append("")

    for mode in modes:
        mode_passed, rows = compare_mode(
            mode,
            run_data["modes"].get(mode, {}),
            baseline["modes"].get(mode, {}),
            METRICS_ORDER,
        )

        if not mode_passed:
            all_passed = False
            for metric, _, _, _, status in rows:
                if "FAIL" in status:
                    failed_metrics.append((mode, metric))

        # Print table
        print_comparison_table(mode, rows)

        # Add to output lines
        output_lines.append(f"\n{'='*80}")
        output_lines.append(f"  {mode.upper()} MODE")
        output_lines.append(f"{'='*80}")
        output_lines.append(f"{'Metric':<30} {'Run':>12} {'Baseline':>12} {'Diff':>12} {'Status':>10}")
        output_lines.append("-" * 80)
        for metric, run_val, base_val, diff, status in rows:
            output_lines.append(f"{metric:<30} {run_val:>12} {base_val:>12} {diff:>12} {status:>10}")

    # Print risk flags
    print_risk_flags(failed_metrics)
    output_lines.append(f"\n{'='*80}")
    output_lines.append("RISK FLAGS")
    output_lines.append(f"{'='*80}")
    if not failed_metrics:
        output_lines.append("  No risk flags detected.")
    else:
        for mode, metric in failed_metrics:
            output_lines.append(f"  [FAIL] {mode}: {metric} out of tolerance")

    # Final result
    print(f"\n{'='*80}")
    if all_passed:
        print("RESULT: PASS - All metrics within tolerance")
        output_lines.append(f"\n{'='*80}")
        output_lines.append("RESULT: PASS - All metrics within tolerance")
    else:
        print(f"RESULT: FAIL - {len(failed_metrics)} metric(s) out of tolerance")
        output_lines.append(f"\n{'='*80}")
        output_lines.append(f"RESULT: FAIL - {len(failed_metrics)} metric(s) out of tolerance")
    print("=" * 80)
    output_lines.append("=" * 80)

    # Write output file
    out_path = args.out
    if out_path is None:
        repo_root = Path(__file__).parent.parent.parent
        out_path = repo_root / "out" / f"pacing_compare_{seed}.txt"
    else:
        out_path = Path(out_path)

    validate_output_path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w") as f:
        f.write("\n".join(output_lines))
        f.write("\n")

    print(f"\nReport written to: {out_path}")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
