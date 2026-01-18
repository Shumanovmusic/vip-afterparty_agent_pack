#!/usr/bin/env bash
# Combined pre-commit hook.
# Runs all pre-commit checks:
# 1. Block 5000x cap reintroduction
# 2. Afterparty Meter consistency check

set -e

echo "=== Pre-commit hooks ==="

# Hook 1: No 5000x cap reintroduction
if [ -f scripts/pre-commit-no-5000x.sh ]; then
    echo "[1/2] Checking for 5000x cap..."
    ./scripts/pre-commit-no-5000x.sh
fi

# Hook 2: Afterparty consistency
if [ -f scripts/check-afterparty-consistency.sh ]; then
    echo "[2/2] Checking Afterparty consistency..."
    ./scripts/check-afterparty-consistency.sh
fi

echo "=== Pre-commit hooks PASSED ==="
