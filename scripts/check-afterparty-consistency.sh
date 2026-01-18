#!/usr/bin/env bash
# Check Afterparty Meter naming and value consistency.
# Fails if deprecated RAGE_* naming or old placeholder values are found.
# Part of the pre-commit / make gate pipeline.

set -euo pipefail

ERRORS=0

echo "=== Afterparty Consistency Check ==="

# 1) Check for deprecated RAGE_* naming (without AFTERPARTY_ prefix)
# Using word boundaries to avoid matching AFTERPARTY_RAGE_*
echo "Checking for deprecated RAGE_* variable names..."
# These patterns are deprecated - should be AFTERPARTY_* instead
RAGE_HITS=$(rg -n "\bRAGE_METER_MAX\b|\bRAGE_METER_INC\b|\bRAGE_SPINS_COUNT\b|\bRAGE_TRIGGER_COOLDOWN\b|\bENABLE_RAGE_MODE\b" \
    --glob '!.git' --glob '!scripts/check-afterparty-consistency.sh' \
    --glob '!*.pyc' --glob '!__pycache__' . 2>/dev/null || true)

if [ -n "$RAGE_HITS" ]; then
    echo "ERROR: Found deprecated RAGE_* variable names:"
    echo "$RAGE_HITS"
    echo "These should be renamed to AFTERPARTY_* per CONFIG.md"
    ERRORS=$((ERRORS + 1))
fi

# Also check for RAGE_MULTIPLIER/RAGE_SPINS without AFTERPARTY_ prefix
RAGE_UNPREFIXED=$(rg -n "(?<!AFTERPARTY_)RAGE_MULTIPLIER|(?<!AFTERPARTY_)RAGE_SPINS(?!_LEFT)" \
    --glob '!.git' --glob '!scripts/check-afterparty-consistency.sh' \
    --glob '!*.pyc' --glob '!__pycache__' --pcre2 . 2>/dev/null || true)

if [ -n "$RAGE_UNPREFIXED" ]; then
    echo "ERROR: Found RAGE_MULTIPLIER/RAGE_SPINS without AFTERPARTY_ prefix:"
    echo "$RAGE_UNPREFIXED"
    echo "Use AFTERPARTY_RAGE_MULTIPLIER and AFTERPARTY_RAGE_SPINS instead"
    ERRORS=$((ERRORS + 1))
fi

# 2) Check for old placeholder increment values (+10/+15/+20) in meter/increment context
# These were the old values before tuning; correct values are 3/5/8
echo "Checking for old placeholder meter increment values..."
OLD_VALUES=$(rg -n "(METER.*INC.*=\s*(10|15|20)\b|INC.*METER.*=\s*(10|15|20)\b|\+10.*win|\+15.*wild|\+20.*scatter)" \
    --glob '!.git' --glob '!scripts/check-afterparty-consistency.sh' \
    --glob '*.md' --glob '*.py' . 2>/dev/null || true)

if [ -n "$OLD_VALUES" ]; then
    echo "ERROR: Found old placeholder increment values (10/15/20):"
    echo "$OLD_VALUES"
    echo "Correct values are 3/5/8 per CONFIG.md"
    ERRORS=$((ERRORS + 1))
fi

# 3) Check for old cooldown value (10) in rage/cooldown context
echo "Checking for old cooldown value (10)..."
OLD_COOLDOWN=$(rg -n "(COOLDOWN.*=\s*10\b|cooldown.*10\s*spin)" \
    --glob '!.git' --glob '!scripts/check-afterparty-consistency.sh' \
    --glob '*.md' --glob '*.py' . 2>/dev/null || true)

if [ -n "$OLD_COOLDOWN" ]; then
    echo "ERROR: Found old cooldown value (10):"
    echo "$OLD_COOLDOWN"
    echo "Correct value is 15 per CONFIG.md"
    ERRORS=$((ERRORS + 1))
fi

# 4) Verify CONFIG.md has the canonical values (sanity check)
echo "Verifying CONFIG.md has canonical AFTERPARTY_* keys..."
REQUIRED_KEYS=(
    "AFTERPARTY_METER_INC_ON_ANY_WIN=3"
    "AFTERPARTY_METER_INC_ON_WILD_PRESENT=5"
    "AFTERPARTY_METER_INC_ON_TWO_SCATTERS=8"
    "AFTERPARTY_RAGE_COOLDOWN_SPINS=15"
)

for KEY in "${REQUIRED_KEYS[@]}"; do
    if ! grep -q "$KEY" CONFIG.md 2>/dev/null; then
        echo "ERROR: Missing or incorrect in CONFIG.md: $KEY"
        ERRORS=$((ERRORS + 1))
    fi
done

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== Afterparty Consistency Check PASSED ==="
    exit 0
else
    echo "=== Afterparty Consistency Check FAILED ($ERRORS errors) ==="
    exit 1
fi
