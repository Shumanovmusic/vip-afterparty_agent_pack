#!/usr/bin/env python3
"""
Laws sync checker per CLAUDE.md contract.

Validates that CONFIG.md values match implementation constants.
Creates ISSUE.md and exits 1 on mismatch.

Usage:
    python -m scripts.check_laws_sync
"""
import re
import sys
from pathlib import Path
from typing import Any


# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def parse_config_md() -> dict[str, Any]:
    """Parse CONFIG.md and extract key=value pairs."""
    config_path = Path(__file__).parent.parent.parent / "CONFIG.md"
    if not config_path.exists():
        raise FileNotFoundError(f"CONFIG.md not found at {config_path}")

    content = config_path.read_text()
    config: dict[str, Any] = {}

    # Match patterns like KEY=VALUE (ignore inline comments)
    pattern = re.compile(r"^([A-Z][A-Z0-9_]+)=([^\s#]+)", re.MULTILINE)

    for match in pattern.finditer(content):
        key = match.group(1)
        value_str = match.group(2).strip()

        # Parse value type
        if value_str == "ON":
            config[key] = True
        elif value_str == "OFF":
            config[key] = False
        elif "." in value_str:
            try:
                config[key] = float(value_str)
            except ValueError:
                config[key] = value_str
        else:
            try:
                config[key] = int(value_str)
            except ValueError:
                config[key] = value_str

    return config


def get_code_values() -> dict[str, Any]:
    """Get current values from code."""
    from app.config import settings
    from app.logic.engine import (
        MAX_WIN_TOTAL_X,
        HYPE_MODE_COST_INCREASE,
        HYPE_MODE_BONUS_CHANCE_MULTIPLIER,
        ENABLE_AFTERPARTY_METER,
        AFTERPARTY_METER_MAX,
        AFTERPARTY_RAGE_SPINS,
        AFTERPARTY_RAGE_MULTIPLIER,
        AFTERPARTY_METER_INC_ON_ANY_WIN,
        AFTERPARTY_METER_INC_ON_WILD_PRESENT,
        AFTERPARTY_METER_INC_ON_TWO_SCATTERS,
        AFTERPARTY_RAGE_COOLDOWN_SPINS,
        BOOST_TRIGGER_SMALLWINS,
        EXPLOSIVE_TRIGGER_WIN_X,
        BOOST_SPINS,
        EXPLOSIVE_SPINS,
        EVENT_MAX_RATE_PER_100_SPINS,
        BOOST_MAX_RATE_PER_100_SPINS,
        EXPLOSIVE_MAX_RATE_PER_100_SPINS,
        ENABLE_SPOTLIGHT_WILDS,
        SPOTLIGHT_WILDS_FREQUENCY,
    )

    return {
        # Settings-based
        "MAX_WIN_TOTAL_X": settings.max_win_total_x,
        "BUY_FEATURE_COST_MULTIPLIER": settings.buy_feature_cost_multiplier,
        "ENABLE_HYPE_MODE_ANTE_BET": settings.enable_hype_mode_ante_bet,
        "HYPE_MODE_COST_INCREASE": settings.hype_mode_cost_increase,
        # Engine constants (verify they match settings/CONFIG.md)
        "MAX_WIN_TOTAL_X_ENGINE": MAX_WIN_TOTAL_X,
        "HYPE_MODE_COST_INCREASE_ENGINE": HYPE_MODE_COST_INCREASE,
        "HYPE_MODE_BONUS_CHANCE_MULTIPLIER": HYPE_MODE_BONUS_CHANCE_MULTIPLIER,
        # Afterparty
        "ENABLE_AFTERPARTY_METER": ENABLE_AFTERPARTY_METER,
        "AFTERPARTY_METER_MAX": AFTERPARTY_METER_MAX,
        "AFTERPARTY_RAGE_SPINS": AFTERPARTY_RAGE_SPINS,
        "AFTERPARTY_RAGE_MULTIPLIER": AFTERPARTY_RAGE_MULTIPLIER,
        "AFTERPARTY_METER_INC_ON_ANY_WIN": AFTERPARTY_METER_INC_ON_ANY_WIN,
        "AFTERPARTY_METER_INC_ON_WILD_PRESENT": AFTERPARTY_METER_INC_ON_WILD_PRESENT,
        "AFTERPARTY_METER_INC_ON_TWO_SCATTERS": AFTERPARTY_METER_INC_ON_TWO_SCATTERS,
        "AFTERPARTY_RAGE_COOLDOWN_SPINS": AFTERPARTY_RAGE_COOLDOWN_SPINS,
        # Boost/Explosive
        "BOOST_TRIGGER_SMALLWINS": BOOST_TRIGGER_SMALLWINS,
        "EXPLOSIVE_TRIGGER_WIN_X": EXPLOSIVE_TRIGGER_WIN_X,
        "BOOST_SPINS": BOOST_SPINS,
        "EXPLOSIVE_SPINS": EXPLOSIVE_SPINS,
        "EVENT_MAX_RATE_PER_100_SPINS": EVENT_MAX_RATE_PER_100_SPINS,
        "BOOST_MAX_RATE_PER_100_SPINS": BOOST_MAX_RATE_PER_100_SPINS,
        "EXPLOSIVE_MAX_RATE_PER_100_SPINS": EXPLOSIVE_MAX_RATE_PER_100_SPINS,
        # Spotlight
        "ENABLE_SPOTLIGHT_WILDS": ENABLE_SPOTLIGHT_WILDS,
        "SPOTLIGHT_WILDS_FREQUENCY": SPOTLIGHT_WILDS_FREQUENCY,
    }


def check_sync() -> list[tuple[str, Any, Any]]:
    """
    Check if CONFIG.md values match code.

    Returns list of (key, config_value, code_value) mismatches.
    """
    config = parse_config_md()
    code = get_code_values()
    mismatches: list[tuple[str, Any, Any]] = []

    # Key mappings: CONFIG.md key -> code key(s)
    checks = [
        ("MAX_WIN_TOTAL_X", "MAX_WIN_TOTAL_X"),
        ("MAX_WIN_TOTAL_X", "MAX_WIN_TOTAL_X_ENGINE"),  # Also check engine
        ("BUY_FEATURE_COST_MULTIPLIER", "BUY_FEATURE_COST_MULTIPLIER"),
        ("ENABLE_HYPE_MODE_ANTE_BET", "ENABLE_HYPE_MODE_ANTE_BET"),
        ("HYPE_MODE_COST_INCREASE", "HYPE_MODE_COST_INCREASE"),
        ("HYPE_MODE_COST_INCREASE", "HYPE_MODE_COST_INCREASE_ENGINE"),
        ("HYPE_MODE_BONUS_CHANCE_MULTIPLIER", "HYPE_MODE_BONUS_CHANCE_MULTIPLIER"),
        ("ENABLE_AFTERPARTY_METER", "ENABLE_AFTERPARTY_METER"),
        ("AFTERPARTY_METER_MAX", "AFTERPARTY_METER_MAX"),
        ("AFTERPARTY_RAGE_SPINS", "AFTERPARTY_RAGE_SPINS"),
        ("AFTERPARTY_RAGE_MULTIPLIER", "AFTERPARTY_RAGE_MULTIPLIER"),
        ("AFTERPARTY_METER_INC_ON_ANY_WIN", "AFTERPARTY_METER_INC_ON_ANY_WIN"),
        ("AFTERPARTY_METER_INC_ON_WILD_PRESENT", "AFTERPARTY_METER_INC_ON_WILD_PRESENT"),
        ("AFTERPARTY_METER_INC_ON_TWO_SCATTERS", "AFTERPARTY_METER_INC_ON_TWO_SCATTERS"),
        ("AFTERPARTY_RAGE_COOLDOWN_SPINS", "AFTERPARTY_RAGE_COOLDOWN_SPINS"),
        ("BOOST_TRIGGER_SMALLWINS", "BOOST_TRIGGER_SMALLWINS"),
        ("EXPLOSIVE_TRIGGER_WIN_X", "EXPLOSIVE_TRIGGER_WIN_X"),
        ("BOOST_SPINS", "BOOST_SPINS"),
        ("EXPLOSIVE_SPINS", "EXPLOSIVE_SPINS"),
        ("EVENT_MAX_RATE_PER_100_SPINS", "EVENT_MAX_RATE_PER_100_SPINS"),
        ("BOOST_MAX_RATE_PER_100_SPINS", "BOOST_MAX_RATE_PER_100_SPINS"),
        ("EXPLOSIVE_MAX_RATE_PER_100_SPINS", "EXPLOSIVE_MAX_RATE_PER_100_SPINS"),
        ("ENABLE_SPOTLIGHT_WILDS", "ENABLE_SPOTLIGHT_WILDS"),
        ("SPOTLIGHT_WILDS_FREQUENCY", "SPOTLIGHT_WILDS_FREQUENCY"),
    ]

    for config_key, code_key in checks:
        if config_key not in config:
            # Skip if not in CONFIG.md (optional config)
            continue
        if code_key not in code:
            mismatches.append((f"{config_key} -> {code_key}", config[config_key], "NOT FOUND"))
            continue

        config_val = config[config_key]
        code_val = code[code_key]

        # Float comparison with tolerance
        if isinstance(config_val, float) and isinstance(code_val, float):
            if abs(config_val - code_val) > 0.0001:
                mismatches.append((config_key, config_val, code_val))
        elif config_val != code_val:
            mismatches.append((f"{config_key} ({code_key})", config_val, code_val))

    return mismatches


def create_issue_md(mismatches: list[tuple[str, Any, Any]]) -> None:
    """Create ISSUE.md with mismatch details."""
    issue_path = Path(__file__).parent.parent.parent / "ISSUE.md"

    content = "# Laws Sync Issue\n\n"
    content += "CONFIG.md values do not match implementation.\n\n"
    content += "## Mismatches\n\n"
    content += "| Key | CONFIG.md | Code |\n"
    content += "|-----|-----------|------|\n"

    for key, config_val, code_val in mismatches:
        content += f"| {key} | {config_val} | {code_val} |\n"

    content += "\n## Action Required\n\n"
    content += "Update code to match CONFIG.md or update CONFIG.md if intentional.\n"
    content += "Then re-run `make check-laws` to verify.\n"

    issue_path.write_text(content)
    print(f"ISSUE.md created at: {issue_path}")


def main() -> int:
    """Main entry point."""
    print("Checking laws sync (CONFIG.md vs implementation)...")

    try:
        mismatches = check_sync()
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        return 1
    except ImportError as e:
        print(f"ERROR: Import failed - {e}")
        print("Make sure you're running from backend directory with venv activated")
        return 1

    if mismatches:
        print(f"\nFAIL: {len(mismatches)} mismatch(es) found:\n")
        for key, config_val, code_val in mismatches:
            print(f"  {key}: CONFIG.md={config_val}, code={code_val}")
        create_issue_md(mismatches)
        return 1

    print("PASS: All laws in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
