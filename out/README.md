# Audit Output Directory

This directory contains simulation output files produced by `audit_sim.py`.

## Long-Run Audit (`make audit-long`)

The **long-run audit** is a stability check workflow for deep statistical analysis. It is **NOT** part of `make gate` or CI pipelines — run it manually when you need high-precision RTP measurements.

### Purpose

- Verify RTP convergence over large sample sizes
- Detect rare tail events (1000x+, 10000x+, capped wins)
- Validate wallet correctness over extended runs
- Ensure math stability before major releases

### Commands

```bash
# Run the full long-run audit (takes several minutes)
make audit-long
```

### Output Files

| File | Mode | Rounds | Description |
|------|------|--------|-------------|
| `audit_base_1m.csv` | base | 1,000,000 | Base game RTP with high precision (±1% tolerance at 1M rounds) |
| `audit_buy_200k.csv` | buy | 200,000 | Buy feature mode with extended tail observation |
| `audit_hype_200k.csv` | hype | 200,000 | Hype mode (ante bet) wager-based RTP |

### Key CSV Fields

| Field | Description |
|-------|-------------|
| `config_hash` | SHA256 hash of game config. Same hash = same math. Use for reproducibility verification. |
| `rtp` | Return to Player percentage: `total_won / total_wagered * 100` |
| `debit_multiplier` | Cost multiplier: 1.0 (base), 100.0 (buy), 1.25 (hype) |
| `avg_debit` | Average bet per round (wagered) |
| `avg_credit` | Average win per round (returned) |
| `rate_1000x_plus` | Percentage of rounds with >=1000x win (tail distribution) |
| `rate_10000x_plus` | Percentage of rounds with >=10000x win (dream wins) |
| `capped_rate` | Percentage of rounds hitting MAX_WIN_TOTAL_X cap (25000x) |
| `bonus_entry_rate` | Percentage of rounds triggering bonus/free spins |

### Interpreting Results

**RTP Targets (from CONFIG.md):**
- Base: ~98.0% (±1.0% at 1M rounds)
- Buy: ~98.0% (±2.5% at 100K rounds)
- Hype: ~78.4% wager-based (players trade EV for higher bonus entry rate)

**Tail Distribution:**
- `rate_1000x_plus > 0` indicates tail is reachable
- `rate_10000x_plus` may be 0 even in 200K rounds (very rare)
- `capped_rate > 0` indicates cap (25000x) was hit

**Wallet Correctness:**
- `avg_debit * rounds == total_wagered`
- `avg_credit * rounds == total_won`
- `rtp == avg_credit / avg_debit * 100`

### Reproducibility

All long-run audits use deterministic seeding:

```
Seed: AUDIT_LONG_2026
```

Two runs with the same `seed` and `config_hash` will produce **identical** results. If results differ, check that:
1. `config_hash` matches (game math unchanged)
2. No engine changes between runs
3. Same Python version and dependencies

### Example Usage

```bash
# Run audit
make audit-long

# View results
cat out/audit_base_1m.csv

# Compare RTP across modes
head -2 out/audit_base_1m.csv out/audit_buy_200k.csv out/audit_hype_200k.csv
```

### Notes

- Long-run audit is **not cached** — it always runs fresh simulations
- Expect runtime of 5-15 minutes depending on hardware
- Results are written to `out/` directory (gitignored)
- To share results, copy the CSV files or paste the data rows

---

## Diff Audit (`make diff-audit`)

The **diff audit** is a diagnostic tool for verifying simulation determinism. It runs the same simulation twice with identical parameters and compares results to ensure reproducibility.

### Purpose

- Verify simulation reproducibility (same seed → same results)
- Diagnose RTP differences between gate tests and audit-long
- Detect non-determinism in the game engine
- Validate config_hash consistency across runs

### Commands

```bash
# Run diff audit (default: 20000 rounds)
make diff-audit

# Run with custom parameters
cd backend && .venv/bin/python -m scripts.diff_audit --rounds 50000 --seed CUSTOM_SEED --verbose
```

### Output Files

Files are written to `out/diff/`:

| File | Description |
|------|-------------|
| `diff_base_gate.csv` | Base mode "gate-like" run |
| `diff_base_long.csv` | Base mode "long-like" run |
| `diff_buy_gate.csv` | Buy mode "gate-like" run |
| `diff_buy_long.csv` | Buy mode "long-like" run |
| `diff_hype_gate.csv` | Hype mode "gate-like" run |
| `diff_hype_long.csv` | Hype mode "long-like" run |

### Interpreting Results

**PASS**: Both runs produce identical results — simulation is deterministic.

**FAIL**: Results differ — indicates:
- Non-determinism in the game engine
- RNG seeding issue
- Config hash mismatch (different game math)

### Comparison Table

The script outputs a comparison table showing:

```
================================================================================
DIFF AUDIT COMPARISON TABLE
================================================================================
Mode     | Run          |        RTP |    Hit% |   Bonus% |    Max Win
--------------------------------------------------------------------------------
base     | gate-like    |    98.0000 |  28.74  |    0.27  |     213.06
base     | long-like    |    98.0000 |  28.74  |    0.27  |     213.06
--------------------------------------------------------------------------------
...
```

### Exit Codes

- `0`: All modes passed (deterministic)
- `1`: At least one mode failed or config_hash mismatch

### Default Parameters

Defaults match **Step 5c (RTP Targets Gate)** exactly:

```
Rounds: 20000
Seed: AUDIT_2025
Output dir: out/diff/
```

---

## Diff Audit Compare Mode (`--compare-to`)

The **compare-to mode** runs a fresh simulation and compares results against an existing reference CSV. This verifies **determinism**: with the same params and config, results must be identical.

### Strict by Default

By default, `--compare-to` is **STRICT** — CLI params (mode/rounds/seed) must exactly match the reference CSV params. This prevents accidental statistical comparisons between runs with different sample sizes.

**If params don't match, the tool exits immediately with an error:**

```
ERROR: Param mismatch: reference rounds=100000 seed=AUDIT_2025 mode=base, got rounds=20000 seed=AUDIT_2025 mode=base.
Use --use-reference-params or pass matching params.
```

### Use `--use-reference-params` for 1:1 Comparison

The recommended way to compare is with `--use-reference-params`, which automatically uses params from the reference CSV:

```bash
# Recommended: auto-use params from reference
cd backend && .venv/bin/python -m scripts.diff_audit \
    --compare-to ../out/audit_base.csv \
    --use-reference-params \
    --verbose
```

Or use the Makefile targets:

```bash
make diff-audit-compare-base   # Compare to out/audit_base.csv
make diff-audit-compare-buy    # Compare to out/audit_buy.csv
make diff-audit-compare-hype   # Compare to out/audit_hype.csv
```

### Strict Mode (Manual Params)

If you need to specify params explicitly, they must match the reference exactly:

```bash
# Strict mode: params must match reference
cd backend && .venv/bin/python -m scripts.diff_audit \
    --compare-to ../out/audit_base.csv \
    --mode base \
    --rounds 100000 \
    --seed AUDIT_2025 \
    --verbose
```

### Config Validation

The tool also validates:

1. **config_hash** — Must match. Different config_hash means game math changed.
2. **debit_multiplier** — Must match. Different multiplier means wrong mode cost.

If either mismatches, the tool exits with an error before running simulation.

### Why Not Allow Different Rounds?

Comparing runs with different sample sizes is **not determinism testing** — it's statistical analysis, which naturally produces different results. This tool focuses on verifying that the same inputs produce the same outputs.

If you need to compare statistical convergence across sample sizes, use the long-run audit (`make audit-long`) instead.

### Required Reference CSV Fields

The reference CSV must contain these fields:

```
config_hash, mode, rounds, seed, debit_multiplier, rtp, hit_freq,
bonus_entry_rate, p95_win_x, p99_win_x, max_win_x, rate_1000x_plus,
rate_10000x_plus, capped_rate, scatter_chance_base, scatter_chance_effective,
scatter_chance_multiplier
```

### Default Tolerances

Even with identical params, floating-point precision may cause tiny differences. Tolerances are applied:

| Field Group | Tolerance | Description |
|-------------|-----------|-------------|
| `rtp` | 0.02 | Percentage points |
| `hit_freq` | 0.02 | Percentage points |
| `bonus_entry_rate` | 0.0002 | Percentage points |
| `p95_win_x`, `p99_win_x`, `max_win_x` | 0.01 | Absolute multiplier |
| `rate_1000x_plus`, `rate_10000x_plus`, `capped_rate` | 0.0002 | Percentage points |
| `scatter_chance_*` | exact | String equality (no tolerance) |

### Example Output (Success with --use-reference-params)

```
=== DIFF AUDIT: COMPARE-TO MODE (--use-reference-params) ===
Using reference params: mode=base, seed=AUDIT_2025, rounds=100000
Reference: ../out/audit_base.csv
Mode: base
Rounds: 100000
Seed: AUDIT_2025
Config hash: 6b282b3256cf6b4e

Running simulation (100000 rounds)...

================================================================================
COMPARISON RESULTS
================================================================================
Field                     |             Run |       Reference | Status
--------------------------------------------------------------------------------
rtp                       |         98.0954 |         98.0954 | PASS
hit_freq                  |         28.7140 |         28.7140 | PASS
bonus_entry_rate          |          0.2690 |          0.2690 | PASS
max_win_x                 |        270.8000 |        270.8000 | PASS
rate_1000x_plus           |        0.000000 |        0.000000 | PASS
--------------------------------------------------------------------------------

================================================================================
RESULT: PASSED - Run matches reference (deterministic)
================================================================================
```

### Exit Codes

- `0`: Comparison passed (deterministic)
- `1`: Comparison failed, param mismatch, or config validation error
