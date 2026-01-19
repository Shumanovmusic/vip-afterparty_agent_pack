"""Config hash computation per TELEMETRY.md and RNG_POLICY.md.

This module provides a shared config_hash function used by:
- audit_sim.py (CSV audit)
- telemetry.py (spin_processed event)

The hash MUST be computed identically in both locations.
"""
import hashlib
import json

from app.config import settings


def get_config_hash() -> str:
    """
    Generate hash of current configuration per RNG_POLICY.md.

    Returns 16-char hex hash of config snapshot.
    Used for:
    - audit CSV config_hash column
    - spin_processed telemetry event config_hash field
    """
    config_snapshot = {
        "max_win_total_x": settings.max_win_total_x,
        "allowed_bets": list(settings.allowed_bets),
        "enable_buy_feature": settings.enable_buy_feature,
        "enable_hype_mode_ante_bet": settings.enable_hype_mode_ante_bet,
    }
    canonical = json.dumps(config_snapshot, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]
