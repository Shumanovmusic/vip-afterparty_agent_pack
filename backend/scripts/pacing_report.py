#!/usr/bin/env python3
"""
Pacing Report script for diagnosing player experience metrics.

Generates a 1-page text report with win pacing, bonus pacing, and volatility sanity
metrics for base/buy/hype modes.

This is a NON-GATE workflow for diagnostic purposes only.

Usage:
    python -m scripts.pacing_report --seed PACING_2026
    python -m scripts.pacing_report --seed PACING_2026 --save-csv
    python -m scripts.pacing_report --save-summary-json ../out/pacing_baseline_gate.json
"""
import argparse
import csv
import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.config_hash import get_config_hash
from app.logic.engine import BASE_SCATTER_CHANCE, GameEngine, MAX_WIN_TOTAL_X
from app.logic.models import GameMode, GameState
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


# Default parameters (gate-like for consistency)
DEFAULT_SEED = "AUDIT_2025"
DEFAULT_ROUNDS_BASE = 20_000
DEFAULT_ROUNDS_BUY = 20_000
DEFAULT_ROUNDS_HYPE = 20_000

# Buy Feature cost multiplier
BUY_FEATURE_COST_MULTIPLIER = settings.buy_feature_cost_multiplier


@dataclass
class PacingStats:
    """Extended statistics for pacing report."""
    # Basic metrics (same as audit_sim)
    total_wagered: float = 0.0
    total_won: float = 0.0
    rounds: int = 0
    wins: int = 0
    bonus_entries: int = 0
    win_x_values: list[float] = field(default_factory=list)
    max_win_x_observed: float = 0.0
    wins_100x_plus: int = 0
    wins_500x_plus: int = 0
    wins_1000x_plus: int = 0

    # Pacing-specific tracking
    bonus_entry_rounds: list[int] = field(default_factory=list)  # Track when bonuses happen
    debit_multiplier: float = 1.0


def get_git_commit() -> str:
    """Get current git commit hash (short)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent.parent,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return "unknown"


def get_timestamp_iso() -> str:
    """Get ISO 8601 UTC timestamp."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_to_int(seed_str: str) -> int:
    """Convert string seed to integer deterministically."""
    return int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**31)


def calculate_percentile(values: list[float], percentile: float) -> float:
    """Calculate percentile from list."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * percentile / 100)
    idx = min(idx, len(sorted_vals) - 1)
    return sorted_vals[idx]


def calculate_intervals(event_rounds: list[int], total_rounds: int) -> list[int]:
    """Calculate intervals (spins between events)."""
    if not event_rounds:
        return []
    intervals = []
    prev = 0
    for r in sorted(event_rounds):
        intervals.append(r - prev)
        prev = r
    # Add final interval if not at end
    if event_rounds and event_rounds[-1] < total_rounds:
        intervals.append(total_rounds - event_rounds[-1])
    return intervals


def run_pacing_simulation(
    mode: str,
    rounds: int,
    seed_str: str,
    verbose: bool = False,
) -> PacingStats:
    """
    Run simulation with extended pacing tracking.

    Args:
        mode: 'base', 'buy', or 'hype'
        rounds: Number of rounds to simulate
        seed_str: Seed string for reproducibility
        verbose: Print progress

    Returns:
        PacingStats with pacing metrics
    """
    seed_int = seed_to_int(seed_str)
    rng = SeededRNG(seed=seed_int)
    engine = GameEngine(rng=rng)

    bet_amount = 1.0
    is_buy_mode = mode == "buy"
    is_hype_mode = mode == "hype"

    # Debit multiplier
    if is_buy_mode:
        debit_multiplier = BUY_FEATURE_COST_MULTIPLIER
    elif is_hype_mode:
        debit_multiplier = 1.0 + settings.hype_mode_cost_increase
    else:
        debit_multiplier = 1.0

    stats = PacingStats()
    stats.debit_multiplier = debit_multiplier
    state: GameState | None = None

    progress_interval = max(1, rounds // 100)
    round_count = 0

    while round_count < rounds:
        if verbose and round_count % progress_interval == 0:
            pct = (round_count / rounds) * 100
            print(f"\r  {mode}: {pct:.1f}%", end="", flush=True)

        if is_buy_mode:
            # Buy mode: entire bonus session is ONE round
            cost_per_round = bet_amount * BUY_FEATURE_COST_MULTIPLIER
            round_total_win = 0.0
            bonus_entered = False

            # First spin triggers Buy Feature
            result = engine.spin(
                bet_amount=bet_amount,
                mode=SpinMode.BUY_FEATURE,
                hype_mode=False,
                state=state,
            )
            state = result.next_state
            round_total_win += result.total_win

            for event in result.events:
                if event.get("type") == "enterFreeSpins":
                    bonus_entered = True

            # Continue until bonus ends
            while state and state.mode == GameMode.FREE_SPINS:
                result = engine.spin(
                    bet_amount=bet_amount,
                    mode=SpinMode.NORMAL,
                    hype_mode=False,
                    state=state,
                )
                state = result.next_state
                round_total_win += result.total_win

            # Track stats
            stats.total_wagered += cost_per_round
            stats.total_won += round_total_win
            stats.rounds += 1

            if round_total_win > 0:
                stats.wins += 1
            if bonus_entered:
                stats.bonus_entries += 1
                stats.bonus_entry_rounds.append(round_count)

            # Track win_x relative to base bet
            round_win_x = round_total_win / bet_amount if bet_amount > 0 else 0
            stats.win_x_values.append(round_win_x)

            if round_win_x > stats.max_win_x_observed:
                stats.max_win_x_observed = round_win_x

            if round_win_x >= 100:
                stats.wins_100x_plus += 1
            if round_win_x >= 500:
                stats.wins_500x_plus += 1
            if round_win_x >= 1000:
                stats.wins_1000x_plus += 1

        else:
            # Base mode or Hype mode: each spin is one round
            result = engine.spin(
                bet_amount=bet_amount,
                mode=SpinMode.NORMAL,
                hype_mode=is_hype_mode,
                state=state,
            )
            state = result.next_state

            spin_debit = bet_amount * debit_multiplier
            stats.total_wagered += spin_debit
            stats.total_won += result.total_win
            stats.rounds += 1

            if result.total_win > 0:
                stats.wins += 1

            for event in result.events:
                if event.get("type") == "enterFreeSpins":
                    stats.bonus_entries += 1
                    stats.bonus_entry_rounds.append(round_count)

            stats.win_x_values.append(result.total_win_x)

            if result.total_win_x > stats.max_win_x_observed:
                stats.max_win_x_observed = result.total_win_x

            if result.total_win_x >= 100:
                stats.wins_100x_plus += 1
            if result.total_win_x >= 500:
                stats.wins_500x_plus += 1
            if result.total_win_x >= 1000:
                stats.wins_1000x_plus += 1

        round_count += 1

    if verbose:
        print(f"\r  {mode}: 100.0%")

    return stats


def compute_spins_between_wins(win_x_values: list[float]) -> list[int]:
    """Compute intervals between winning spins."""
    intervals = []
    last_win_idx = -1
    for i, wx in enumerate(win_x_values):
        if wx > 0:
            if last_win_idx >= 0:
                intervals.append(i - last_win_idx)
            last_win_idx = i
    return intervals


def generate_report(
    seed: str,
    rounds_base: int,
    rounds_buy: int,
    rounds_hype: int,
    stats_base: PacingStats,
    stats_buy: PacingStats,
    stats_hype: PacingStats,
) -> str:
    """Generate the pacing report text."""
    timestamp = get_timestamp_iso()
    git_commit = get_git_commit()
    config_hash = get_config_hash()

    lines = []
    lines.append("=" * 80)
    lines.append("PACING REPORT")
    lines.append("=" * 80)
    lines.append("")
    lines.append(f"Timestamp:    {timestamp}")
    lines.append(f"Git commit:   {git_commit}")
    lines.append(f"Config hash:  {config_hash}")
    lines.append(f"Seed:         {seed}")
    lines.append(f"Rounds:       base={rounds_base:,}, buy={rounds_buy:,}, hype={rounds_hype:,}")
    lines.append("")

    for mode, stats, rounds in [
        ("BASE", stats_base, rounds_base),
        ("BUY", stats_buy, rounds_buy),
        ("HYPE", stats_hype, rounds_hype),
    ]:
        lines.append("-" * 80)
        lines.append(f"  {mode} MODE")
        lines.append("-" * 80)

        # Basic metrics
        rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0
        win_rate = (stats.wins / stats.rounds * 100) if stats.rounds > 0 else 0
        dry_spins_rate = 100 - win_rate
        bonus_entry_rate = (stats.bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0

        lines.append("")
        lines.append("  CORE METRICS")
        lines.append(f"    RTP:               {rtp:.4f}%")
        lines.append(f"    Win rate:          {win_rate:.4f}%")
        lines.append(f"    Dry spins rate:    {dry_spins_rate:.4f}%")
        lines.append(f"    Bonus entry rate:  {bonus_entry_rate:.4f}%")

        # Win pacing
        lines.append("")
        lines.append("  WIN PACING")
        spins_between_wins = compute_spins_between_wins(stats.win_x_values)
        if spins_between_wins:
            p50 = calculate_percentile(spins_between_wins, 50)
            p90 = calculate_percentile(spins_between_wins, 90)
            p99 = calculate_percentile(spins_between_wins, 99)
            lines.append(f"    Spins between wins (p50/p90/p99): {p50:.0f} / {p90:.0f} / {p99:.0f}")
        else:
            lines.append("    Spins between wins: N/A (no winning intervals)")

        # Win multiplier distribution
        avg_win_x = sum(stats.win_x_values) / len(stats.win_x_values) if stats.win_x_values else 0
        p95_win_x = calculate_percentile(stats.win_x_values, 95)
        p99_win_x = calculate_percentile(stats.win_x_values, 99)
        lines.append(f"    Avg win_x:         {avg_win_x:.2f}x")
        lines.append(f"    p95 win_x:         {p95_win_x:.2f}x")
        lines.append(f"    p99 win_x:         {p99_win_x:.2f}x")

        # Bonus pacing (only for base/hype modes)
        lines.append("")
        lines.append("  BONUS PACING")
        if mode == "BUY":
            lines.append("    (Buy mode: every round is a bonus session)")
        else:
            bonus_intervals = calculate_intervals(stats.bonus_entry_rounds, stats.rounds)
            if bonus_intervals:
                p50_bonus = calculate_percentile(bonus_intervals, 50)
                p90_bonus = calculate_percentile(bonus_intervals, 90)
                p99_bonus = calculate_percentile(bonus_intervals, 99)
                lines.append(f"    Spins between bonuses (p50/p90/p99): {p50_bonus:.0f} / {p90_bonus:.0f} / {p99_bonus:.0f}")

                # Long drought rates
                long_300 = sum(1 for i in bonus_intervals if i > 300)
                long_500 = sum(1 for i in bonus_intervals if i > 500)
                rate_300 = (long_300 / len(bonus_intervals) * 100) if bonus_intervals else 0
                rate_500 = (long_500 / len(bonus_intervals) * 100) if bonus_intervals else 0
                lines.append(f"    Drought >300 spins: {rate_300:.2f}% of intervals")
                lines.append(f"    Drought >500 spins: {rate_500:.2f}% of intervals")
            else:
                lines.append("    No bonus entries observed")

        # Volatility sanity
        lines.append("")
        lines.append("  VOLATILITY")
        lines.append(f"    Max win_x:         {stats.max_win_x_observed:.2f}x")
        rate_100x = (stats.wins_100x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
        rate_500x = (stats.wins_500x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
        rate_1000x = (stats.wins_1000x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
        lines.append(f"    Rate 100x+:        {rate_100x:.6f}%")
        lines.append(f"    Rate 500x+:        {rate_500x:.6f}%")
        lines.append(f"    Rate 1000x+:       {rate_1000x:.6f}%")
        lines.append("")

    # Comparison table
    lines.append("=" * 80)
    lines.append("COMPARISON TABLE")
    lines.append("=" * 80)
    lines.append("")
    lines.append(f"{'Metric':<30} {'Base':>12} {'Buy':>12} {'Hype':>12}")
    lines.append("-" * 66)

    def fmt_pct(v: float) -> str:
        return f"{v:.4f}%"

    def fmt_x(v: float) -> str:
        return f"{v:.2f}x"

    # Compute metrics for table
    rtp_base = (stats_base.total_won / stats_base.total_wagered * 100) if stats_base.total_wagered > 0 else 0
    rtp_buy = (stats_buy.total_won / stats_buy.total_wagered * 100) if stats_buy.total_wagered > 0 else 0
    rtp_hype = (stats_hype.total_won / stats_hype.total_wagered * 100) if stats_hype.total_wagered > 0 else 0

    win_rate_base = (stats_base.wins / stats_base.rounds * 100) if stats_base.rounds > 0 else 0
    win_rate_buy = (stats_buy.wins / stats_buy.rounds * 100) if stats_buy.rounds > 0 else 0
    win_rate_hype = (stats_hype.wins / stats_hype.rounds * 100) if stats_hype.rounds > 0 else 0

    bonus_rate_base = (stats_base.bonus_entries / stats_base.rounds * 100) if stats_base.rounds > 0 else 0
    bonus_rate_buy = (stats_buy.bonus_entries / stats_buy.rounds * 100) if stats_buy.rounds > 0 else 0
    bonus_rate_hype = (stats_hype.bonus_entries / stats_hype.rounds * 100) if stats_hype.rounds > 0 else 0

    lines.append(f"{'RTP':<30} {fmt_pct(rtp_base):>12} {fmt_pct(rtp_buy):>12} {fmt_pct(rtp_hype):>12}")
    lines.append(f"{'Win rate':<30} {fmt_pct(win_rate_base):>12} {fmt_pct(win_rate_buy):>12} {fmt_pct(win_rate_hype):>12}")
    lines.append(f"{'Bonus entry rate':<30} {fmt_pct(bonus_rate_base):>12} {fmt_pct(bonus_rate_buy):>12} {fmt_pct(bonus_rate_hype):>12}")
    lines.append(f"{'Max win_x':<30} {fmt_x(stats_base.max_win_x_observed):>12} {fmt_x(stats_buy.max_win_x_observed):>12} {fmt_x(stats_hype.max_win_x_observed):>12}")

    p99_base = calculate_percentile(stats_base.win_x_values, 99)
    p99_buy = calculate_percentile(stats_buy.win_x_values, 99)
    p99_hype = calculate_percentile(stats_hype.win_x_values, 99)
    lines.append(f"{'p99 win_x':<30} {fmt_x(p99_base):>12} {fmt_x(p99_buy):>12} {fmt_x(p99_hype):>12}")

    lines.append("")

    # Risk flags
    lines.append("=" * 80)
    lines.append("RISK FLAGS")
    lines.append("=" * 80)
    lines.append("")

    flags = []

    # Check dry spins rates
    for mode, stats in [("base", stats_base), ("hype", stats_hype)]:
        dry_rate = 100 - (stats.wins / stats.rounds * 100) if stats.rounds > 0 else 0
        if dry_rate > 80:
            flags.append(f"  [WARN] {mode}: dry_spins_rate={dry_rate:.2f}% (>80%)")

    # Check bonus drought p99
    for mode, stats in [("base", stats_base), ("hype", stats_hype)]:
        bonus_intervals = calculate_intervals(stats.bonus_entry_rounds, stats.rounds)
        if bonus_intervals:
            p99_bonus = calculate_percentile(bonus_intervals, 99)
            if p99_bonus > 600:
                flags.append(f"  [WARN] {mode}: bonus drought p99={p99_bonus:.0f} spins (>600)")

    # Check if hype has higher bonus rate than base
    if bonus_rate_hype <= bonus_rate_base:
        flags.append(f"  [WARN] hype bonus_entry_rate ({bonus_rate_hype:.4f}%) <= base ({bonus_rate_base:.4f}%)")

    if not flags:
        lines.append("  No risk flags detected.")
    else:
        lines.extend(flags)

    lines.append("")
    lines.append("=" * 80)
    lines.append("END OF REPORT")
    lines.append("=" * 80)

    return "\n".join(lines)


def save_csv(
    output_path: Path,
    mode: str,
    seed: str,
    rounds: int,
    stats: PacingStats,
) -> None:
    """Save detailed CSV for a mode."""
    timestamp = get_timestamp_iso()
    git_commit = get_git_commit()
    config_hash = get_config_hash()

    rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0
    win_rate = (stats.wins / stats.rounds * 100) if stats.rounds > 0 else 0
    bonus_entry_rate = (stats.bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0

    spins_between_wins = compute_spins_between_wins(stats.win_x_values)
    sbw_p50 = calculate_percentile(spins_between_wins, 50) if spins_between_wins else 0
    sbw_p90 = calculate_percentile(spins_between_wins, 90) if spins_between_wins else 0
    sbw_p99 = calculate_percentile(spins_between_wins, 99) if spins_between_wins else 0

    bonus_intervals = calculate_intervals(stats.bonus_entry_rounds, stats.rounds)
    sbb_p50 = calculate_percentile(bonus_intervals, 50) if bonus_intervals else 0
    sbb_p90 = calculate_percentile(bonus_intervals, 90) if bonus_intervals else 0
    sbb_p99 = calculate_percentile(bonus_intervals, 99) if bonus_intervals else 0

    long_300 = sum(1 for i in bonus_intervals if i > 300) if bonus_intervals else 0
    long_500 = sum(1 for i in bonus_intervals if i > 500) if bonus_intervals else 0
    drought_rate_300 = (long_300 / len(bonus_intervals) * 100) if bonus_intervals else 0
    drought_rate_500 = (long_500 / len(bonus_intervals) * 100) if bonus_intervals else 0

    avg_win_x = sum(stats.win_x_values) / len(stats.win_x_values) if stats.win_x_values else 0
    p95_win_x = calculate_percentile(stats.win_x_values, 95)
    p99_win_x = calculate_percentile(stats.win_x_values, 99)

    rate_100x = (stats.wins_100x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
    rate_500x = (stats.wins_500x_plus / stats.rounds * 100) if stats.rounds > 0 else 0
    rate_1000x = (stats.wins_1000x_plus / stats.rounds * 100) if stats.rounds > 0 else 0

    row = {
        "timestamp": timestamp,
        "git_commit": git_commit,
        "config_hash": config_hash,
        "mode": mode,
        "seed": seed,
        "rounds": rounds,
        "rtp": f"{rtp:.4f}",
        "win_rate": f"{win_rate:.4f}",
        "dry_spins_rate": f"{100 - win_rate:.4f}",
        "bonus_entry_rate": f"{bonus_entry_rate:.4f}",
        "spins_between_wins_p50": f"{sbw_p50:.0f}",
        "spins_between_wins_p90": f"{sbw_p90:.0f}",
        "spins_between_wins_p99": f"{sbw_p99:.0f}",
        "spins_between_bonuses_p50": f"{sbb_p50:.0f}",
        "spins_between_bonuses_p90": f"{sbb_p90:.0f}",
        "spins_between_bonuses_p99": f"{sbb_p99:.0f}",
        "drought_rate_300": f"{drought_rate_300:.4f}",
        "drought_rate_500": f"{drought_rate_500:.4f}",
        "avg_win_x": f"{avg_win_x:.4f}",
        "p95_win_x": f"{p95_win_x:.2f}",
        "p99_win_x": f"{p99_win_x:.2f}",
        "max_win_x": f"{stats.max_win_x_observed:.2f}",
        "rate_100x_plus": f"{rate_100x:.6f}",
        "rate_500x_plus": f"{rate_500x:.6f}",
        "rate_1000x_plus": f"{rate_1000x:.6f}",
    }

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())
        writer.writeheader()
        writer.writerow(row)


def compute_mode_summary(
    mode: str,
    stats: PacingStats,
    rounds: int,
) -> dict:
    """Compute summary metrics for a single mode (as dict for JSON)."""
    # Basic metrics
    rtp = (stats.total_won / stats.total_wagered) if stats.total_wagered > 0 else 0
    win_rate = (stats.wins / stats.rounds) if stats.rounds > 0 else 0
    dry_spins_rate = 1.0 - win_rate
    bonus_entry_rate = (stats.bonus_entries / stats.rounds) if stats.rounds > 0 else 0

    # Spins between wins
    spins_between_wins = compute_spins_between_wins(stats.win_x_values)
    sbw_p50 = int(calculate_percentile(spins_between_wins, 50)) if spins_between_wins else 0
    sbw_p90 = int(calculate_percentile(spins_between_wins, 90)) if spins_between_wins else 0
    sbw_p99 = int(calculate_percentile(spins_between_wins, 99)) if spins_between_wins else 0

    # Spins between bonuses (for base/hype; buy is always 1)
    if mode == "buy":
        sbb_p50 = 1
        sbb_p90 = 1
        sbb_p99 = 1
        drought_gt300_rate = 0.0
        drought_gt500_rate = 0.0
    else:
        bonus_intervals = calculate_intervals(stats.bonus_entry_rounds, stats.rounds)
        sbb_p50 = int(calculate_percentile(bonus_intervals, 50)) if bonus_intervals else 0
        sbb_p90 = int(calculate_percentile(bonus_intervals, 90)) if bonus_intervals else 0
        sbb_p99 = int(calculate_percentile(bonus_intervals, 99)) if bonus_intervals else 0

        # Drought rates
        if bonus_intervals:
            long_300 = sum(1 for i in bonus_intervals if i > 300)
            long_500 = sum(1 for i in bonus_intervals if i > 500)
            drought_gt300_rate = long_300 / len(bonus_intervals)
            drought_gt500_rate = long_500 / len(bonus_intervals)
        else:
            drought_gt300_rate = 0.0
            drought_gt500_rate = 0.0

    # Volatility rates (as fractions, not percentages)
    rate_100x = (stats.wins_100x_plus / stats.rounds) if stats.rounds > 0 else 0
    rate_500x = (stats.wins_500x_plus / stats.rounds) if stats.rounds > 0 else 0
    rate_1000x = (stats.wins_1000x_plus / stats.rounds) if stats.rounds > 0 else 0

    return {
        "rtp": rtp,
        "win_rate": win_rate,
        "dry_spins_rate": dry_spins_rate,
        "bonus_entry_rate": bonus_entry_rate,
        "spins_between_wins_p50": sbw_p50,
        "spins_between_wins_p90": sbw_p90,
        "spins_between_wins_p99": sbw_p99,
        "spins_between_bonus_p50": sbb_p50,
        "spins_between_bonus_p90": sbb_p90,
        "spins_between_bonus_p99": sbb_p99,
        "bonus_drought_gt300_rate": drought_gt300_rate,
        "bonus_drought_gt500_rate": drought_gt500_rate,
        "max_win_x": stats.max_win_x_observed,
        "rate_100x_plus": rate_100x,
        "rate_500x_plus": rate_500x,
        "rate_1000x_plus": rate_1000x,
    }


def generate_summary_json(
    seed: str,
    rounds: int,
    stats_base: PacingStats,
    stats_buy: PacingStats,
    stats_hype: PacingStats,
    rounds_base: int,
    rounds_buy: int,
    rounds_hype: int,
) -> dict:
    """Generate JSON summary for baseline comparison."""
    git_commit = get_git_commit()
    config_hash = get_config_hash()

    return {
        "schema": "pacing_baseline_v1",
        "seed": seed,
        "rounds": rounds,  # canonical rounds (typically all same)
        "config_hash": config_hash,
        "git_commit": git_commit,
        "modes": {
            "base": compute_mode_summary("base", stats_base, rounds_base),
            "buy": compute_mode_summary("buy", stats_buy, rounds_buy),
            "hype": compute_mode_summary("hype", stats_hype, rounds_hype),
        },
    }


def save_summary_json(output_path: Path, summary: dict) -> None:
    """Save JSON summary to file."""
    # Validate output path is inside out/
    validate_output_path(output_path.parent)

    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")  # trailing newline


def validate_output_path(out_dir: Path) -> None:
    """Fail-fast if output path is not the canonical out/ directory."""
    repo_root = Path(__file__).parent.parent.parent
    canonical_out = (repo_root / "out").resolve()
    actual_out = out_dir.resolve()

    if actual_out != canonical_out:
        print(f"ERROR: Output path must be the canonical out/ directory.")
        print(f"  Expected: {canonical_out}")
        print(f"  Got:      {actual_out}")
        print(f"  This prevents accidental writes outside out/.")
        sys.exit(1)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Pacing Report for win/bonus pacing diagnostics")
    parser.add_argument(
        "--seed",
        type=str,
        default=DEFAULT_SEED,
        help=f"Seed string (default: {DEFAULT_SEED})",
    )
    parser.add_argument(
        "--rounds-base",
        type=int,
        default=DEFAULT_ROUNDS_BASE,
        help=f"Rounds for base mode (default: {DEFAULT_ROUNDS_BASE})",
    )
    parser.add_argument(
        "--rounds-buy",
        type=int,
        default=DEFAULT_ROUNDS_BUY,
        help=f"Rounds for buy mode (default: {DEFAULT_ROUNDS_BUY})",
    )
    parser.add_argument(
        "--rounds-hype",
        type=int,
        default=DEFAULT_ROUNDS_HYPE,
        help=f"Rounds for hype mode (default: {DEFAULT_ROUNDS_HYPE})",
    )
    parser.add_argument(
        "--save-csv",
        action="store_true",
        help="Save detailed CSV files for each mode",
    )
    parser.add_argument(
        "--save-summary-json",
        type=str,
        default=None,
        help="Save JSON summary to specified path (for pacing-compare baseline)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress",
    )

    args = parser.parse_args()

    # Ensure output directory is the canonical out/
    out_dir = Path(__file__).parent.parent.parent / "out"
    validate_output_path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("PACING REPORT GENERATOR")
    print("=" * 60)
    print(f"Seed:         {args.seed}")
    print(f"Rounds:       base={args.rounds_base:,}, buy={args.rounds_buy:,}, hype={args.rounds_hype:,}")
    print(f"Config hash:  {get_config_hash()}")
    print(f"Git commit:   {get_git_commit()}")
    print("")

    # Run simulations
    print("Running simulations...")
    stats_base = run_pacing_simulation("base", args.rounds_base, args.seed, args.verbose)
    stats_buy = run_pacing_simulation("buy", args.rounds_buy, args.seed, args.verbose)
    stats_hype = run_pacing_simulation("hype", args.rounds_hype, args.seed, args.verbose)
    print("")

    # Generate report
    report = generate_report(
        seed=args.seed,
        rounds_base=args.rounds_base,
        rounds_buy=args.rounds_buy,
        rounds_hype=args.rounds_hype,
        stats_base=stats_base,
        stats_buy=stats_buy,
        stats_hype=stats_hype,
    )

    # Write report file
    report_path = out_dir / f"pacing_report_{args.seed}.txt"
    with open(report_path, "w") as f:
        f.write(report)
    print(f"Report written to: {report_path}")

    # Optionally save CSVs
    if args.save_csv:
        for mode, stats, rounds in [
            ("base", stats_base, args.rounds_base),
            ("buy", stats_buy, args.rounds_buy),
            ("hype", stats_hype, args.rounds_hype),
        ]:
            csv_path = out_dir / f"pacing_{mode}_{args.seed}.csv"
            save_csv(csv_path, mode, args.seed, rounds, stats)
            print(f"CSV written to: {csv_path}")

    # Optionally save JSON summary for pacing-compare
    if args.save_summary_json:
        json_path = Path(args.save_summary_json)
        # Use canonical rounds (all modes should use same rounds for baseline)
        canonical_rounds = args.rounds_base
        summary = generate_summary_json(
            seed=args.seed,
            rounds=canonical_rounds,
            stats_base=stats_base,
            stats_buy=stats_buy,
            stats_hype=stats_hype,
            rounds_base=args.rounds_base,
            rounds_buy=args.rounds_buy,
            rounds_hype=args.rounds_hype,
        )
        save_summary_json(json_path, summary)
        print(f"JSON summary written to: {json_path}")

    print("")
    print(report)

    return 0


if __name__ == "__main__":
    sys.exit(main())
