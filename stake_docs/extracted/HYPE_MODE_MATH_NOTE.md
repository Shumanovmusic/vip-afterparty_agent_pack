# Hype Mode Math Note

**Reference:** GAME_RULES.md section "Feature: Hype Mode (Ante Bet)"

## Per-Cell Scatter Multiplier

`HYPE_MODE_BONUS_CHANCE_MULTIPLIER` (CONFIG.md) applies to **per-cell scatter probability**, not bonus entry rate.

| Mode | Per-cell p | Formula |
|------|------------|---------|
| Base | 0.02 (2%) | `BASE_SCATTER_CHANCE` |
| Hype | 0.04 (4%) | `BASE_SCATTER_CHANCE * HYPE_MODE_BONUS_CHANCE_MULTIPLIER` |

## Non-Linear Bonus Rate Increase

Bonus triggers on 3+ scatters in 15 cells. This follows a **binomial distribution**:
- P(bonus) = P(X >= 3) where X ~ Binomial(n=15, p)

Due to binomial tail behavior, doubling per-cell p does NOT double P(X >= 3):

| Mode | Per-cell p | P(X >= 3) | Approx Rate |
|------|------------|-----------|-------------|
| Base | 0.02 | ~0.3% | ~1 in 300 spins |
| Hype | 0.04 | ~2.0% | ~1 in 50 spins |

**Result:** 2x per-cell multiplier yields ~5-7x bonus entry rate increase.

## Why This is Correct

This is mathematically expected behavior, not a bug. The exponential relationship
between per-cell probability and multi-success probability is a fundamental
property of binomial distributions.

Documented in: GAME_RULES.md, CONFIG.md, TELEMETRY.md (scatter_chance_effective)
