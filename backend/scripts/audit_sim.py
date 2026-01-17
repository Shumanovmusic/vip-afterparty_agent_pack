#!/usr/bin/env python3
"""
Audit simulation script per RNG_POLICY.md and GAME_RULES.md.

Generates headless simulation CSV for regulatory audit.

Usage:
    python -m scripts.audit_sim --mode base --rounds 100000 --seed AUDIT_2025 --out out/audit_base.csv
    python -m scripts.audit_sim --mode buy --rounds 50000 --seed AUDIT_2025 --out out/audit_buy.csv
"""
import argparse
import csv
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.logic.engine import GameEngine, MAX_WIN_TOTAL_X
from app.logic.models import GameMode, GameState
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


@dataclass
class SimulationStats:
    """Statistics accumulated during simulation."""
    total_wagered: float = 0.0
    total_won: float = 0.0
    rounds: int = 0
    wins: int = 0
    capped_count: int = 0
    bonus_entries: int = 0
    win_x_values: list[float] = field(default_factory=list)
    max_win_x_observed: float = 0.0


def get_config_hash() -> str:
    """Generate hash of current configuration per RNG_POLICY.md."""
    config_snapshot = {
        "max_win_total_x": settings.max_win_total_x,
        "allowed_bets": list(settings.allowed_bets),
        "enable_buy_feature": settings.enable_buy_feature,
        "enable_hype_mode_ante_bet": settings.enable_hype_mode_ante_bet,
    }
    canonical = json.dumps(config_snapshot, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def seed_to_int(seed_str: str) -> int:
    """Convert string seed to integer deterministically."""
    return int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**31)


def run_simulation(
    mode: str,
    rounds: int,
    seed_str: str,
    verbose: bool = False,
) -> SimulationStats:
    """
    Run headless simulation.

    Args:
        mode: 'base' or 'buy'
        rounds: Number of rounds to simulate
        seed_str: Seed string for reproducibility
        verbose: Print progress

    Returns:
        SimulationStats with aggregated results
    """
    seed_int = seed_to_int(seed_str)
    rng = SeededRNG(seed=seed_int)
    engine = GameEngine(rng=rng)

    spin_mode = SpinMode.BUY_FEATURE if mode == "buy" else SpinMode.NORMAL
    bet_amount = 1.0  # Standard bet for simulation

    stats = SimulationStats()
    state: GameState | None = None

    progress_interval = max(1, rounds // 100)

    for i in range(rounds):
        if verbose and i % progress_interval == 0:
            pct = (i / rounds) * 100
            print(f"\rProgress: {pct:.1f}%", end="", flush=True)

        result = engine.spin(
            bet_amount=bet_amount,
            mode=spin_mode,
            hype_mode=False,
            state=state,
        )

        # Update state for next spin (stateful simulation)
        state = result.next_state

        # Track statistics
        stats.total_wagered += bet_amount
        stats.total_won += result.total_win
        stats.rounds += 1

        if result.total_win > 0:
            stats.wins += 1

        if result.is_capped:
            stats.capped_count += 1

        # Track bonus entries
        for event in result.events:
            if event.get("type") == "enterFreeSpins":
                stats.bonus_entries += 1

        # Track win_x values for percentile calculation
        stats.win_x_values.append(result.total_win_x)

        # Track max observed
        if result.total_win_x > stats.max_win_x_observed:
            stats.max_win_x_observed = result.total_win_x

    if verbose:
        print("\rProgress: 100.0%")

    return stats


def calculate_percentile(values: list[float], percentile: float) -> float:
    """Calculate percentile from sorted list."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * percentile / 100)
    idx = min(idx, len(sorted_vals) - 1)
    return sorted_vals[idx]


def generate_csv(
    mode: str,
    rounds: int,
    seed_str: str,
    stats: SimulationStats,
    output_path: str,
) -> None:
    """Generate audit CSV file per GAME_RULES.md requirements."""
    config_hash = get_config_hash()

    rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0
    hit_freq = (stats.wins / stats.rounds * 100) if stats.rounds > 0 else 0
    bonus_entry_rate = (stats.bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0
    capped_rate = (stats.capped_count / stats.rounds * 100) if stats.rounds > 0 else 0

    p95_win_x = calculate_percentile(stats.win_x_values, 95)
    p99_win_x = calculate_percentile(stats.win_x_values, 99)

    row = {
        "mode": mode,
        "rounds": rounds,
        "seed": seed_str,
        "rtp": f"{rtp:.4f}",
        "hit_freq": f"{hit_freq:.4f}",
        "bonus_entry_rate": f"{bonus_entry_rate:.4f}",
        "p95_win_x": f"{p95_win_x:.2f}",
        "p99_win_x": f"{p99_win_x:.2f}",
        "max_win_x": f"{stats.max_win_x_observed:.2f}",
        "capped_rate": f"{capped_rate:.6f}",
        "config_hash": config_hash,
    }

    # Ensure output directory exists
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())
        writer.writeheader()
        writer.writerow(row)

    print(f"CSV written to: {output_path}")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Audit simulation per RNG_POLICY.md")
    parser.add_argument(
        "--mode",
        choices=["base", "buy"],
        required=True,
        help="Simulation mode: 'base' or 'buy'",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        required=True,
        help="Number of rounds to simulate",
    )
    parser.add_argument(
        "--seed",
        type=str,
        required=True,
        help="Seed string for reproducibility",
    )
    parser.add_argument(
        "--out",
        type=str,
        required=True,
        help="Output CSV path",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress",
    )

    args = parser.parse_args()

    print(f"Running simulation: mode={args.mode}, rounds={args.rounds}, seed={args.seed}")
    print(f"MAX_WIN_TOTAL_X (config): {MAX_WIN_TOTAL_X}")
    print(f"Config hash: {get_config_hash()}")

    # Run simulation
    stats = run_simulation(
        mode=args.mode,
        rounds=args.rounds,
        seed_str=args.seed,
        verbose=args.verbose,
    )

    # Generate CSV
    generate_csv(
        mode=args.mode,
        rounds=args.rounds,
        seed_str=args.seed,
        stats=stats,
        output_path=args.out,
    )

    # ASSERTION: max_win_x must not exceed MAX_WIN_TOTAL_X
    if stats.max_win_x_observed > MAX_WIN_TOTAL_X:
        print(f"ASSERTION FAILED: max_win_x_observed ({stats.max_win_x_observed}) > MAX_WIN_TOTAL_X ({MAX_WIN_TOTAL_X})")
        return 1

    print(f"\nSummary:")
    print(f"  Rounds: {stats.rounds}")
    print(f"  Total wagered: {stats.total_wagered:.2f}")
    print(f"  Total won: {stats.total_won:.2f}")
    print(f"  RTP: {(stats.total_won / stats.total_wagered * 100):.4f}%")
    print(f"  Hit frequency: {(stats.wins / stats.rounds * 100):.4f}%")
    print(f"  Bonus entries: {stats.bonus_entries} ({(stats.bonus_entries / stats.rounds * 100):.4f}%)")
    print(f"  Max win_x observed: {stats.max_win_x_observed:.2f}x")
    print(f"  Capped count: {stats.capped_count} ({(stats.capped_count / stats.rounds * 100):.6f}%)")
    print(f"\nASSERTION PASSED: max_win_x ({stats.max_win_x_observed}) <= MAX_WIN_TOTAL_X ({MAX_WIN_TOTAL_X})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
