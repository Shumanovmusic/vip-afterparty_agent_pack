#!/usr/bin/env bash
#
# check-restorestate-freeze.sh
#
# Verifies that Redis state TTL is config-driven (not hardcoded) and
# key prefixes are frozen to prevent accidental breaking changes.
#
# Exit codes:
#   0 - All checks passed
#   1 - Freeze violation detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

REDIS_SERVICE="$PROJECT_ROOT/backend/app/redis_service.py"
CONFIG_MD="$PROJECT_ROOT/CONFIG.md"
CONFIG_PY="$PROJECT_ROOT/backend/app/config.py"

echo "=== RestoreState Freeze Gate (fail-fast) ==="

# Check 1: STATE_PREFIX must be "state:player:"
EXPECTED_PREFIX='STATE_PREFIX = "state:player:"'
if ! grep -q "$EXPECTED_PREFIX" "$REDIS_SERVICE"; then
    echo "FAIL: STATE_PREFIX changed or missing!"
    echo "Expected: $EXPECTED_PREFIX"
    echo "This would break existing player state in Redis."
    exit 1
fi
echo "[OK] STATE_PREFIX = 'state:player:' (frozen)"

# Check 2: STATE_TTL must NOT be hardcoded (must use settings)
if grep -qE '^\s*STATE_TTL\s*=\s*[0-9]+' "$REDIS_SERVICE"; then
    echo "FAIL: STATE_TTL is hardcoded!"
    echo "Must use: STATE_TTL = settings.player_state_ttl_seconds"
    exit 1
fi
echo "[OK] STATE_TTL is not hardcoded"

# Check 3: STATE_TTL must reference settings.player_state_ttl_seconds
EXPECTED_TTL='STATE_TTL = settings.player_state_ttl_seconds'
if ! grep -q "$EXPECTED_TTL" "$REDIS_SERVICE"; then
    echo "FAIL: STATE_TTL must use settings.player_state_ttl_seconds"
    echo "Expected: $EXPECTED_TTL"
    exit 1
fi
echo "[OK] STATE_TTL = settings.player_state_ttl_seconds"

# Check 4: CONFIG.md must have PLAYER_STATE_TTL_SECONDS=86400
if ! grep -q "PLAYER_STATE_TTL_SECONDS=86400" "$CONFIG_MD"; then
    echo "FAIL: CONFIG.md missing PLAYER_STATE_TTL_SECONDS=86400"
    echo "If you intentionally changed TTL, update CONFIG.md first."
    exit 1
fi
echo "[OK] CONFIG.md has PLAYER_STATE_TTL_SECONDS=86400"

# Check 5: Settings class must have player_state_ttl_seconds
if ! grep -q "player_state_ttl_seconds" "$CONFIG_PY"; then
    echo "FAIL: Settings missing player_state_ttl_seconds"
    exit 1
fi
echo "[OK] Settings has player_state_ttl_seconds"

echo ""
echo "=== RestoreState Freeze Gate PASSED ==="
