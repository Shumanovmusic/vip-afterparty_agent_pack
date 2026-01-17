#!/usr/bin/env python3
"""
Seed hunt script per GAME_RULES.md and RNG_POLICY.md.

Finds deterministic "tail seeds" in debug-seed mode that produce high outcomes and/or cap.

Usage:
    python -m scripts.seed_hunt --mode buy --min_win_x 1000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds.json
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.logic.engine import GameEngine, MAX_WIN_TOTAL_X
from app.logic.models import GameMode, GameState
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


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


def run_single_round(
    seed_str: str,
    mode: str,
    bet_amount: float = 1.0,
) -> dict[str, Any]:
    """
    Run a single round with given seed and return results.

    Returns dict with:
      - seed: str
      - total_win_x: float
      - is_capped: bool
      - cap_reason: str | None
      - bonus_variant: str
    """
    seed_int = seed_to_int(seed_str)
    rng = SeededRNG(seed=seed_int)
    engine = GameEngine(rng=rng)

    is_buy_mode = mode == "buy"
    state: GameState | None = None
    round_total_win = 0.0
    is_capped = False
    cap_reason = None
    bonus_variant = "vip_buy" if is_buy_mode else "standard"

    if is_buy_mode:
        # Buy Feature: full bonus session
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
                bonus_variant = event.get("bonusVariant", "vip_buy")

        if result.is_capped:
            is_capped = True
            cap_reason = result.cap_reason

        # Continue spinning until bonus ends
        while state and state.mode == GameMode.FREE_SPINS:
            result = engine.spin(
                bet_amount=bet_amount,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )
            state = result.next_state
            round_total_win += result.total_win

            if result.is_capped:
                is_capped = True
                cap_reason = result.cap_reason

        round_win_x = round_total_win / bet_amount if bet_amount > 0 else 0
    else:
        # Base mode: single spin
        result = engine.spin(
            bet_amount=bet_amount,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=state,
        )
        round_win_x = result.total_win_x
        is_capped = result.is_capped
        cap_reason = result.cap_reason

        for event in result.events:
            if event.get("type") == "enterFreeSpins":
                bonus_variant = event.get("bonusVariant", "standard")

    return {
        "seed": seed_str,
        "total_win_x": round_win_x,
        "is_capped": is_capped,
        "cap_reason": cap_reason,
        "bonus_variant": bonus_variant,
    }


def hunt_seeds(
    mode: str,
    min_win_x: float,
    target: str,
    max_seeds: int,
    seed_prefix: str,
    verbose: bool = False,
) -> list[dict[str, Any]]:
    """
    Hunt for seeds that meet criteria.

    Args:
        mode: 'base' or 'buy'
        min_win_x: Minimum win_x to consider a "hit"
        target: 'cap' (only capped) or 'high' (>= min_win_x)
        max_seeds: Maximum seeds to test
        seed_prefix: Prefix for generated seed strings
        verbose: Print progress

    Returns:
        List of found seed results
    """
    found: list[dict[str, Any]] = []
    progress_interval = max(1, max_seeds // 100)

    for i in range(max_seeds):
        if verbose and i % progress_interval == 0:
            pct = (i / max_seeds) * 100
            print(f"\rProgress: {pct:.1f}% (found: {len(found)})", end="", flush=True)

        seed_str = f"{seed_prefix}_{i:06d}"
        result = run_single_round(seed_str, mode)

        # Check if this seed meets criteria
        if target == "cap":
            if result["is_capped"]:
                found.append(result)
        else:  # high
            if result["total_win_x"] >= min_win_x:
                found.append(result)

    if verbose:
        print(f"\rProgress: 100.0% (found: {len(found)})")

    return found


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Hunt for tail seeds per RNG_POLICY.md"
    )
    parser.add_argument(
        "--mode",
        choices=["base", "buy"],
        required=True,
        help="Simulation mode: 'base' or 'buy'",
    )
    parser.add_argument(
        "--min_win_x",
        type=float,
        default=1000.0,
        help="Minimum win_x threshold (default: 1000)",
    )
    parser.add_argument(
        "--target",
        choices=["cap", "high"],
        default="high",
        help="Target: 'cap' (only capped) or 'high' (>= min_win_x)",
    )
    parser.add_argument(
        "--max_seeds",
        type=int,
        default=200000,
        help="Maximum seeds to test (default: 200000)",
    )
    parser.add_argument(
        "--seed_prefix",
        type=str,
        default="HUNT",
        help="Prefix for seed strings (default: HUNT)",
    )
    parser.add_argument(
        "--out",
        type=str,
        default="../out/tail_seeds.json",
        help="Output JSON path (default: ../out/tail_seeds.json)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show progress",
    )

    args = parser.parse_args()

    config_hash = get_config_hash()
    print(f"Seed hunt: mode={args.mode}, min_win_x={args.min_win_x}, target={args.target}")
    print(f"MAX_WIN_TOTAL_X (config): {MAX_WIN_TOTAL_X}")
    print(f"Config hash: {config_hash}")
    print(f"Searching up to {args.max_seeds} seeds...")

    # Hunt for seeds
    found = hunt_seeds(
        mode=args.mode,
        min_win_x=args.min_win_x,
        target=args.target,
        max_seeds=args.max_seeds,
        seed_prefix=args.seed_prefix,
        verbose=args.verbose,
    )

    # Build output JSON
    sorted_found = sorted(found, key=lambda x: x["total_win_x"], reverse=True)

    # Calculate summary stats for various thresholds
    count_1000x_plus = sum(1 for r in found if r["total_win_x"] >= 1000)
    count_10000x_plus = sum(1 for r in found if r["total_win_x"] >= 10000)
    count_capped = sum(1 for r in found if r["is_capped"])
    max_found_win_x = sorted_found[0]["total_win_x"] if sorted_found else 0.0

    output = {
        # Metadata first (per plan)
        "timestamp": get_timestamp_iso(),
        "git_commit": get_git_commit(),
        "config_hash": config_hash,
        # Hunt parameters
        "mode": args.mode,
        "max_seeds": args.max_seeds,
        "min_win_x": args.min_win_x,
        "target": args.target,
        "seed_prefix": args.seed_prefix,
        "max_win_total_x": MAX_WIN_TOTAL_X,
        # Results
        "found_count": len(found),
        # Summary stats for GATE 4
        "count_1000x_plus": count_1000x_plus,
        "count_10000x_plus": count_10000x_plus,
        "count_capped": count_capped,
        "max_found_win_x": max_found_win_x,
        "found": sorted_found,
    }

    # Ensure output directory exists
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nJSON written to: {args.out}")
    print(f"Found {len(found)} seeds meeting criteria (>= {args.min_win_x}x)")

    # GATE 4 summary stats
    print(f"\n=== GATE 4 Summary ===")
    print(f"  1000x+ seeds: {count_1000x_plus}")
    print(f"  10000x+ seeds: {count_10000x_plus}")
    print(f"  Capped (25000x) seeds: {count_capped}")
    print(f"  Max found win_x: {max_found_win_x:.2f}")

    if sorted_found:
        top = sorted_found[0]
        print(f"\nTop hit: seed={top['seed']}, win_x={top['total_win_x']:.2f}, capped={top['is_capped']}, variant={top['bonus_variant']}")

    # GATE 4 reachability verdict
    if count_10000x_plus > 0:
        print(f"\n✓ GATE 4 PASS: Found {count_10000x_plus} seeds with 10000x+ (cap reachability via seed)")
    else:
        print(f"\n✗ GATE 4 WARNING: No 10000x+ seeds found in {args.max_seeds} seeds")
        print(f"  → Either increase max_seeds, adjust math, or provide CAP_REACHABILITY.md proof")

    return 0


if __name__ == "__main__":
    sys.exit(main())
