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


# Buy Feature cost multiplier per GAME_RULES.md
BUY_FEATURE_COST_MULTIPLIER = 100


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
    # Tail distribution tracking
    wins_1000x_plus: int = 0
    wins_10000x_plus: int = 0
    # Wallet metrics
    debit_multiplier: float = 1.0  # 1x for base, 100x for buy
    # VIP Bonus variant tracking per GAME_RULES.md
    bonus_variant: str = "standard"  # standard or vip_buy
    vip_buy_bonus_entries: int = 0
    standard_bonus_entries: int = 0


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

    bet_amount = 1.0  # Standard bet for simulation
    is_buy_mode = mode == "buy"

    # Debit multiplier for reporting
    debit_multiplier = BUY_FEATURE_COST_MULTIPLIER if is_buy_mode else 1.0

    stats = SimulationStats()
    stats.debit_multiplier = debit_multiplier
    state: GameState | None = None

    progress_interval = max(1, rounds // 100)
    round_count = 0

    while round_count < rounds:
        if verbose and round_count % progress_interval == 0:
            pct = (round_count / rounds) * 100
            print(f"\rProgress: {pct:.1f}%", end="", flush=True)

        if is_buy_mode:
            # Buy Feature: pay 100x, get entire bonus session as ONE round
            # This is VIP Enhanced Bonus per GAME_RULES.md
            cost_per_round = bet_amount * BUY_FEATURE_COST_MULTIPLIER
            round_total_win = 0.0
            round_max_win_x = 0.0
            bonus_entered = False
            bonus_variant = "vip_buy"  # Buy feature always uses VIP variant

            # First spin triggers Buy Feature
            result = engine.spin(
                bet_amount=bet_amount,
                mode=SpinMode.BUY_FEATURE,
                hype_mode=False,
                state=state,
            )
            state = result.next_state
            round_total_win += result.total_win
            round_max_win_x = max(round_max_win_x, result.total_win_x)

            for event in result.events:
                if event.get("type") == "enterFreeSpins":
                    bonus_entered = True
                    # Verify bonus variant from event
                    bonus_variant = event.get("bonusVariant", "vip_buy")

            if result.is_capped:
                stats.capped_count += 1

            # Continue spinning until bonus ends (back to BASE mode)
            while state and state.mode == GameMode.FREE_SPINS:
                result = engine.spin(
                    bet_amount=bet_amount,
                    mode=SpinMode.NORMAL,  # Free spins use normal mode
                    hype_mode=False,
                    state=state,
                )
                state = result.next_state
                round_total_win += result.total_win
                round_max_win_x = max(round_max_win_x, result.total_win_x)

                if result.is_capped:
                    stats.capped_count += 1

            # Track round stats
            stats.total_wagered += cost_per_round
            stats.total_won += round_total_win
            stats.rounds += 1

            if round_total_win > 0:
                stats.wins += 1
            if bonus_entered:
                stats.bonus_entries += 1
                stats.vip_buy_bonus_entries += 1  # Track VIP buy bonuses

            # Track win_x relative to cost (for buy mode, the effective multiplier)
            round_win_x = round_total_win / bet_amount if bet_amount > 0 else 0
            stats.win_x_values.append(round_win_x)

            if round_win_x > stats.max_win_x_observed:
                stats.max_win_x_observed = round_win_x

            if round_win_x >= 1000:
                stats.wins_1000x_plus += 1
            if round_win_x >= 10000:
                stats.wins_10000x_plus += 1

        else:
            # Base mode: each spin is one round
            result = engine.spin(
                bet_amount=bet_amount,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )
            state = result.next_state

            stats.total_wagered += bet_amount
            stats.total_won += result.total_win
            stats.rounds += 1

            if result.total_win > 0:
                stats.wins += 1

            if result.is_capped:
                stats.capped_count += 1

            for event in result.events:
                if event.get("type") == "enterFreeSpins":
                    stats.bonus_entries += 1
                    stats.standard_bonus_entries += 1  # Base mode = standard variant

            stats.win_x_values.append(result.total_win_x)

            if result.total_win_x > stats.max_win_x_observed:
                stats.max_win_x_observed = result.total_win_x

            if result.total_win_x >= 1000:
                stats.wins_1000x_plus += 1
            if result.total_win_x >= 10000:
                stats.wins_10000x_plus += 1

        round_count += 1

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

    # Tail distribution rates
    rate_1000x = (stats.wins_1000x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
    rate_10000x = (stats.wins_10000x_plus / stats.rounds * 100) if stats.rounds > 0 else 0

    # Wallet metrics
    avg_debit = stats.total_wagered / stats.rounds if stats.rounds > 0 else 0
    avg_credit = stats.total_won / stats.rounds if stats.rounds > 0 else 0

    # Bonus variant rates per GAME_RULES.md
    vip_buy_bonus_rate = (stats.vip_buy_bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0
    standard_bonus_rate = (stats.standard_bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0

    row = {
        "mode": mode,
        "rounds": rounds,
        "seed": seed_str,
        "debit_multiplier": f"{stats.debit_multiplier:.0f}",
        "rtp": f"{rtp:.4f}",
        "hit_freq": f"{hit_freq:.4f}",
        "bonus_entry_rate": f"{bonus_entry_rate:.4f}",
        "vip_buy_bonus_rate": f"{vip_buy_bonus_rate:.6f}",
        "standard_bonus_rate": f"{standard_bonus_rate:.6f}",
        "avg_debit": f"{avg_debit:.4f}",
        "avg_credit": f"{avg_credit:.4f}",
        "p95_win_x": f"{p95_win_x:.2f}",
        "p99_win_x": f"{p99_win_x:.2f}",
        "max_win_x": f"{stats.max_win_x_observed:.2f}",
        "rate_1000x_plus": f"{rate_1000x:.6f}",
        "rate_10000x_plus": f"{rate_10000x:.6f}",
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

    rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0
    print(f"\nSummary:")
    print(f"  Rounds: {stats.rounds}")
    print(f"  Debit multiplier: {stats.debit_multiplier:.0f}x")
    print(f"  Total wagered: {stats.total_wagered:.2f}")
    print(f"  Total won: {stats.total_won:.2f}")
    print(f"  RTP: {rtp:.4f}%")
    print(f"  Hit frequency: {(stats.wins / stats.rounds * 100):.4f}%")
    print(f"  Bonus entries: {stats.bonus_entries} ({(stats.bonus_entries / stats.rounds * 100):.4f}%)")
    print(f"  Max win_x observed: {stats.max_win_x_observed:.2f}x")
    print(f"  Wins 1000x+: {stats.wins_1000x_plus} ({(stats.wins_1000x_plus / stats.rounds * 100):.6f}%)")
    print(f"  Wins 10000x+: {stats.wins_10000x_plus} ({(stats.wins_10000x_plus / stats.rounds * 100):.6f}%)")
    print(f"  Capped count: {stats.capped_count} ({(stats.capped_count / stats.rounds * 100):.6f}%)")
    print(f"\nASSERTION PASSED: max_win_x ({stats.max_win_x_observed}) <= MAX_WIN_TOTAL_X ({MAX_WIN_TOTAL_X})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
