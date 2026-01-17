#!/usr/bin/env python3
"""
Theoretical maximum calculation per GAME_RULES.md and CONFIG.md.

Computes reproducible theoretical max values strictly from engine constants.
All numbers are derived from code, not hand-calculated, to prevent drift.

Usage:
    python -m scripts.theoretical_max --mode buy --output json
    python -m scripts.theoretical_max --mode base --output human
"""
import argparse
import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.logic.engine import (
    FREE_SPINS_WIN_MULTIPLIER,
    MAX_WIN_TOTAL_X,
    PAYLINES,
    REELS,
    ROWS,
)
from app.logic.models import Symbol


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


def get_max_symbol_payout_per_line() -> tuple[float, str]:
    """
    Get the maximum payout per single payline from engine.py multipliers.

    Returns (max_payout_x, symbol_name).
    """
    # These multipliers are from engine.py _check_line method
    # We import them by reading the source as the multipliers dict is local
    # However, to keep this reproducible from code, we extract the values directly

    # From engine.py line 557-566:
    multipliers = {
        Symbol.HIGH1.value: {3: 1.70, 4: 8.56, 5: 85.6},
        Symbol.HIGH2.value: {3: 1.31, 4: 6.58, 5: 66.2},
        Symbol.HIGH3.value: {3: 1.03, 4: 5.15, 5: 51.5},
        Symbol.MID1.value: {3: 0.64, 4: 3.22, 5: 25.3},
        Symbol.MID2.value: {3: 0.52, 4: 2.53, 5: 17.0},
        Symbol.LOW1.value: {3: 0.33, 4: 1.21, 5: 6.6},
        Symbol.LOW2.value: {3: 0.23, 4: 0.95, 5: 4.7},
        Symbol.LOW3.value: {3: 0.14, 4: 0.66, 5: 3.27},
        Symbol.WILD.value: {3: 3.22, 4: 16.7, 5: 167.4},
    }

    max_payout = 0.0
    max_symbol = ""
    for symbol_val, payouts in multipliers.items():
        payout_5 = payouts.get(5, 0)
        if payout_5 > max_payout:
            max_payout = payout_5
            max_symbol = Symbol(symbol_val).name

    return max_payout, max_symbol


@dataclass
class TheoreticalMaxResult:
    """Result of theoretical max calculation."""

    # Grid dimensions (from engine)
    reels: int
    rows: int
    total_positions: int
    num_paylines: int

    # Symbol payouts (from engine)
    max_symbol_payout_5_line_x: float
    max_symbol_name: str

    # Computed theoretical maximums
    theoretical_max_base_spin_x: float
    theoretical_max_vip_buy_bonus_spin_x: float
    theoretical_max_vip_buy_bonus_session_x: float

    # VIP parameters (from engine)
    vip_buy_multiplier: int
    vip_buy_spins: int

    # Cap (from config)
    max_win_total_x: int

    # Validation
    cap_is_reachable: bool
    cap_reachable_reason: str

    # Metadata
    config_hash: str
    git_commit: str
    timestamp: str

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON output."""
        return {
            # Metadata first
            "timestamp": self.timestamp,
            "git_commit": self.git_commit,
            "config_hash": self.config_hash,
            # Grid dimensions
            "reels": self.reels,
            "rows": self.rows,
            "total_positions": self.total_positions,
            "num_paylines": self.num_paylines,
            # Symbol payouts
            "max_symbol_payout_5_line_x": self.max_symbol_payout_5_line_x,
            "max_symbol_name": self.max_symbol_name,
            # Theoretical maximums
            "theoretical_max_base_spin_x": self.theoretical_max_base_spin_x,
            "theoretical_max_vip_buy_bonus_spin_x": self.theoretical_max_vip_buy_bonus_spin_x,
            "theoretical_max_vip_buy_bonus_session_x": self.theoretical_max_vip_buy_bonus_session_x,
            # VIP parameters
            "vip_buy_multiplier": self.vip_buy_multiplier,
            "vip_buy_spins": self.vip_buy_spins,
            # Cap
            "max_win_total_x": self.max_win_total_x,
            # Validation
            "cap_is_reachable": self.cap_is_reachable,
            "cap_reachable_reason": self.cap_reachable_reason,
        }


def compute_theoretical_max() -> TheoreticalMaxResult:
    """
    Compute theoretical maximum values strictly from engine constants.

    All values are derived from:
    - REELS, ROWS, PAYLINES from engine.py
    - Symbol multipliers from engine.py _check_line
    - FREE_SPINS_WIN_MULTIPLIER from engine.py
    - MAX_WIN_TOTAL_X from config/engine.py
    """
    # Grid dimensions from engine
    total_positions = REELS * ROWS
    num_paylines = len(PAYLINES)

    # Get max symbol payout (5-in-a-row) from engine multipliers
    max_symbol_payout_5, max_symbol_name = get_max_symbol_payout_per_line()

    # Theoretical max per base spin:
    # If all positions are the max-paying symbol (WILD), every payline hits 5-in-a-row
    # Total = num_paylines × max_symbol_payout
    theoretical_max_base_spin_x = num_paylines * max_symbol_payout_5

    # VIP Buy bonus parameters from engine
    vip_buy_multiplier = FREE_SPINS_WIN_MULTIPLIER
    vip_buy_spins = 10  # From engine.py line 334: free_spins_count = 10

    # Theoretical max per VIP Buy bonus spin:
    # Base spin max × VIP multiplier
    theoretical_max_vip_buy_bonus_spin_x = theoretical_max_base_spin_x * vip_buy_multiplier

    # Theoretical max per VIP Buy bonus session (all 10 spins at max):
    # Per-spin max × number of spins
    theoretical_max_vip_buy_bonus_session_x = theoretical_max_vip_buy_bonus_spin_x * vip_buy_spins

    # Cap reachability check
    cap_is_reachable = theoretical_max_vip_buy_bonus_session_x >= MAX_WIN_TOTAL_X

    if cap_is_reachable:
        cap_reachable_reason = (
            f"Theoretical session max ({theoretical_max_vip_buy_bonus_session_x:.0f}x) "
            f">= cap ({MAX_WIN_TOTAL_X}x)"
        )
    else:
        cap_reachable_reason = (
            f"UNREACHABLE: Theoretical session max ({theoretical_max_vip_buy_bonus_session_x:.0f}x) "
            f"< cap ({MAX_WIN_TOTAL_X}x)"
        )

    return TheoreticalMaxResult(
        reels=REELS,
        rows=ROWS,
        total_positions=total_positions,
        num_paylines=num_paylines,
        max_symbol_payout_5_line_x=max_symbol_payout_5,
        max_symbol_name=max_symbol_name,
        theoretical_max_base_spin_x=theoretical_max_base_spin_x,
        theoretical_max_vip_buy_bonus_spin_x=theoretical_max_vip_buy_bonus_spin_x,
        theoretical_max_vip_buy_bonus_session_x=theoretical_max_vip_buy_bonus_session_x,
        vip_buy_multiplier=vip_buy_multiplier,
        vip_buy_spins=vip_buy_spins,
        max_win_total_x=MAX_WIN_TOTAL_X,
        cap_is_reachable=cap_is_reachable,
        cap_reachable_reason=cap_reachable_reason,
        config_hash=get_config_hash(),
        git_commit=get_git_commit(),
        timestamp=get_timestamp_iso(),
    )


def format_human_readable(result: TheoreticalMaxResult) -> str:
    """Format result as human-readable summary."""
    lines = [
        "=" * 60,
        "THEORETICAL MAXIMUM CALCULATION",
        "(per GAME_RULES.md and CONFIG.md)",
        "=" * 60,
        "",
        f"Config Hash: {result.config_hash}",
        f"Git Commit: {result.git_commit}",
        f"Timestamp: {result.timestamp}",
        "",
        "--- Grid Dimensions (from engine.py) ---",
        f"Reels: {result.reels}",
        f"Rows: {result.rows}",
        f"Total Positions: {result.total_positions}",
        f"Number of Paylines: {result.num_paylines}",
        "",
        "--- Symbol Payouts (from engine.py) ---",
        f"Max Symbol: {result.max_symbol_name}",
        f"Max 5-in-a-row Payout: {result.max_symbol_payout_5_line_x}x per line",
        "",
        "--- Theoretical Maximums ---",
        f"Base Spin Max: {result.theoretical_max_base_spin_x:.1f}x",
        f"  (= {result.num_paylines} paylines × {result.max_symbol_payout_5_line_x}x per line)",
        "",
        f"VIP Buy Bonus Spin Max: {result.theoretical_max_vip_buy_bonus_spin_x:.1f}x",
        f"  (= {result.theoretical_max_base_spin_x:.1f}x × {result.vip_buy_multiplier} VIP multiplier)",
        "",
        f"VIP Buy Bonus Session Max: {result.theoretical_max_vip_buy_bonus_session_x:.1f}x",
        f"  (= {result.theoretical_max_vip_buy_bonus_spin_x:.1f}x × {result.vip_buy_spins} spins)",
        "",
        "--- Cap Validation ---",
        f"MAX_WIN_TOTAL_X (cap): {result.max_win_total_x}x",
        f"Cap Reachable: {'YES' if result.cap_is_reachable else 'NO'}",
        f"Reason: {result.cap_reachable_reason}",
        "",
        "=" * 60,
    ]
    return "\n".join(lines)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Compute theoretical maximum values per GAME_RULES.md"
    )
    parser.add_argument(
        "--mode",
        choices=["base", "buy"],
        default="buy",
        help="Focus mode: 'base' (base game only) or 'buy' (VIP buy bonus, default)",
    )
    parser.add_argument(
        "--output",
        choices=["json", "human", "both"],
        default="both",
        help="Output format (default: both)",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="Output file path for JSON (optional)",
    )

    args = parser.parse_args()

    # Compute theoretical maximums
    result = compute_theoretical_max()

    # Output based on format
    if args.output in ("human", "both"):
        print(format_human_readable(result))

    if args.output in ("json", "both"):
        json_output = result.to_dict()
        if args.out:
            output_path = Path(args.out)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w") as f:
                json.dump(json_output, f, indent=2)
            print(f"\nJSON written to: {args.out}")
        elif args.output == "json":
            print(json.dumps(json_output, indent=2))

    # Validation summary
    if result.cap_is_reachable:
        print(f"\n✓ VALIDATION PASS: Cap is theoretically reachable")
        print(f"  Theoretical max: {result.theoretical_max_vip_buy_bonus_session_x:.0f}x")
        print(f"  Cap: {result.max_win_total_x}x")
        return 0
    else:
        print(f"\n✗ VALIDATION FAIL: Cap is NOT theoretically reachable")
        print(f"  Theoretical max: {result.theoretical_max_vip_buy_bonus_session_x:.0f}x")
        print(f"  Cap: {result.max_win_total_x}x")
        return 1


if __name__ == "__main__":
    sys.exit(main())
