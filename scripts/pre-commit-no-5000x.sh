#!/usr/bin/env bash
#
# Pre-commit hook: Block reintroduction of 5000/5000x cap values
# Source of truth: CONFIG.md -> MAX_WIN_TOTAL_X=25000
#
# This hook prevents staging files that contain old 5000x cap values.
# False positives (e.g., "range(5000)" or "batching_size = 50000") are acceptable
# patterns and should be excluded from the check.

set -euo pipefail

# Patterns to block (cap-related only)
BLOCKED_PATTERNS=(
    'MAX_WIN.*=.*5000[^0-9]'     # MAX_WIN_X = 5000, MAX_WIN_TOTAL_X=5000
    'max_win.*=.*5000[^0-9]'     # max_win_x = 5000 (lowercase)
    '[^0-9]5000x'                # "5000x" win multiplier
    '[^0-9]5,000x'               # "5,000x" formatted
    'cap.*5000'                  # "cap at 5000", "capped to 5000"
    '5000.*cap'                  # "5000 cap", "5000 is the cap"
)

# Files to check (only staged files, excluding binary and vendor)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(py|md|ts|tsx|js|jsx|json|yaml|yml)$' || true)

if [[ -z "$STAGED_FILES" ]]; then
    exit 0
fi

FOUND_ISSUES=0

for pattern in "${BLOCKED_PATTERNS[@]}"; do
    # Search staged content for pattern
    MATCHES=$(git diff --cached -U0 | grep -iE "^\+.*${pattern}" || true)

    if [[ -n "$MATCHES" ]]; then
        echo "ERROR: Blocked pattern found in staged changes: $pattern"
        echo "$MATCHES"
        echo ""
        FOUND_ISSUES=1
    fi
done

if [[ $FOUND_ISSUES -eq 1 ]]; then
    echo "=========================================="
    echo "BLOCKED: 5000x cap values detected!"
    echo ""
    echo "Source of truth: CONFIG.md -> MAX_WIN_TOTAL_X=25000"
    echo ""
    echo "If this is a false positive, you can bypass with:"
    echo "  git commit --no-verify"
    echo ""
    echo "But only do this if you're certain the value is not cap-related."
    echo "=========================================="
    exit 1
fi

exit 0
