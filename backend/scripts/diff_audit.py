#!/usr/bin/env python3
"""
Diff audit script to diagnose RTP differences between gate tests and audit-long.

Runs audit simulations twice with identical parameters and compares results
to verify reproducibility. If results differ, that indicates a bug or
non-determinism in the simulation.

Usage:
    python -m scripts.diff_audit --rounds 20000 --seed DIFF_AUDIT_2026 --verbose
    python -m scripts.diff_audit --outdir ../out/diff --verbose
"""
import argparse
import csv
import sys
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.audit_sim import (
    generate_csv,
    get_config_hash,
    run_simulation,
)

# Default parameters
DEFAULT_ROUNDS = 20000
DEFAULT_SEED = "DIFF_AUDIT_2026"
DEFAULT_OUTDIR = "../out/diff"

# Modes to compare
MODES = ["base", "buy", "hype"]

# Comparison thresholds
RTP_EPSILON = 0.0001  # RTP must match within 0.0001%


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

    args = parser.parse_args()

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
