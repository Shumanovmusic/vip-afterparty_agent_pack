# Audit Output Directory

This directory contains simulation output files produced by `audit_sim.py`.

---

## Gate Canonical Snapshots (`make audit-gate-snapshots`)

**COMMITTED** deterministic baselines for quick regression checks and diff-audit comparisons.

### Files

| File | Mode | Rounds | Seed | Purpose |
|------|------|--------|------|---------|
| `audit_base_gate.csv` | base | 20,000 | AUDIT_2025 | Base game canonical snapshot |
| `audit_buy_gate.csv` | buy | 20,000 | AUDIT_2025 | Buy feature canonical snapshot |
| `audit_hype_gate.csv` | hype | 20,000 | AUDIT_2025 | Hype mode canonical snapshot |

### Parameters

All gate canonical snapshots use:
- **Seed:** `AUDIT_2025`
- **Rounds:** `20000`
- **Purpose:** Deterministic baseline for diff-audit comparisons

### When to Regenerate

Regenerate canonical snapshots when:
1. **config_hash changes** — game math was intentionally modified
2. **Laws/spec changes** — after verifying new values are acceptable

**See `BASELINE_POLICY.md` for full update policy and PR requirements.**

```bash
# Regenerate all canonical snapshots
make audit-gate-snapshots

# Verify the new values are acceptable
head -2 out/audit_*_gate.csv

# Run baseline policy check (will pass if engine/config also changed)
make check-baseline-changed

# Commit to repo
git add out/audit_*_gate.csv
git commit -m "chore: rebaseline canonical snapshots after <reason>"
```

### Usage with Diff-Audit

```bash
# Compare fresh simulation against canonical snapshot
make diff-audit-compare-base   # Compare to audit_base_gate.csv
make diff-audit-compare-buy    # Compare to audit_buy_gate.csv
make diff-audit-compare-hype   # Compare to audit_hype_gate.csv
```

**PASS:** Results match — simulation is deterministic.
**FAIL:** Results differ — unintended drift detected.

---

## Long-Run Audit (`make audit-long`)

The **long-run audit** is a stability check workflow for deep statistical analysis. It is **NOT** part of `make gate` or CI pipelines — run it manually when you need high-precision RTP measurements.

**NOT COMMITTED to repo** — these are informational outputs, not determinism baselines.

**NOT used by diff-audit-compare-*** — use gate canonical snapshots for comparisons.

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

---

## Tail Progression Gate (`make tail-progression`)

The **tail progression gate** verifies that tail distribution metrics (1000x+, 10000x+, max_win_x) do not regress from a committed baseline. This is a **BLOCKING** step in `make gate`.

**COMMITTED** — `tail_baseline_buy_gate.csv` is tracked in git.

**Uses same canonical parameters as gate snapshots:**
- Mode: `buy`
- Rounds: `20000`
- Seed: `AUDIT_2025`

### Purpose

- Prevent regressions in tail distribution (dream wins)
- Ensure game math changes don't reduce big win frequency
- Catch accidental changes that hurt player experience
- Provide reproducible baseline for tail metrics

### Baseline File

**File:** `out/tail_baseline_buy_gate.csv` (COMMITTED to repo)

This baseline uses the same canonical gate parameters:
- Mode: `buy`
- Rounds: `20000`
- Seed: `AUDIT_2025`

### Commands

```bash
# Run tail progression check (uses baseline params automatically)
make tail-progression

# Regenerate baseline (NOT in gate - do this intentionally)
make tail-baseline
```

### How to Regenerate Baseline

Only regenerate when:
1. **config_hash changes** - game math was intentionally modified
2. **Intentional rebaseline** - after verifying new tail metrics are acceptable

```bash
# Regenerate
make tail-baseline

# Verify the new values are acceptable
cat out/tail_baseline_buy_gate.csv

# Commit to repo
git add out/tail_baseline_buy_gate.csv
git commit -m "chore: rebaseline tail metrics after <reason>"
```

### Checked Fields

| Field | Tolerance | Description |
|-------|-----------|-------------|
| `rate_1000x_plus` | 0.2 pp | Percentage of rounds with >=1000x win |
| `rate_10000x_plus` | 0.01 pp | Percentage of rounds with >=10000x win |
| `max_win_x` | 100.0x | Maximum win multiplier observed |

**pp** = percentage points (absolute tolerance)

### Regression Logic

For each field, the check verifies: `run_value >= baseline_value - tolerance`

This means:
- **Better values always pass** (more big wins is good)
- **Same values pass** (deterministic result)
- **Slightly worse values pass** (within tolerance for variance)
- **Significantly worse values FAIL** (regression detected)

**Special case:** If baseline is 0 (e.g., `rate_10000x_plus=0`), then 0 is allowed (can't regress from 0).

### Config Hash Rule

If `config_hash` changes between baseline and current run:
1. The gate **fails immediately** with clear error
2. You must **regenerate baseline** with `make tail-baseline`
3. **Commit** the new baseline to the repo

This ensures baselines are always intentionally updated when math changes.

### Example Output (Success)

```
=== TAIL PROGRESSION GATE ===
Using baseline params: mode=buy, seed=AUDIT_2025, rounds=20000
Baseline: ../out/tail_baseline_buy_gate.csv
Mode: buy
Rounds: 20000
Seed: AUDIT_2025
Config hash: 6b282b3256cf6b4e

Running simulation (20000 rounds)...

================================================================================
TAIL PROGRESSION RESULTS
================================================================================
Field                     |             Run |        Baseline | Status
--------------------------------------------------------------------------------
rate_1000x_plus           |        0.500000 |        0.500000 | PASS
rate_10000x_plus          |        0.000000 |        0.000000 | PASS
max_win_x                 |         2000.00 |         2000.00 | PASS
capped_rate               |        0.000000 |        0.000000 | PASS
--------------------------------------------------------------------------------

================================================================================
RESULT: PASSED - No tail regression detected
================================================================================
```

### Exit Codes

- `0`: PASS - no regression detected
- `1`: FAIL - regression detected or validation error

---

## Pacing Report (`make pacing-report`)

The **pacing report** is a diagnostic tool for analyzing player experience metrics: win pacing, bonus pacing, and volatility sanity across all game modes.

**NOT COMMITTED to repo** — these are diagnostic outputs.

**NOT part of `make gate` or CI** — run manually when diagnosing pacing issues.

### Purpose

- Diagnose "feels dry/monotonous/too spiky" issues with data
- Measure spins between wins and spins between bonuses
- Identify long drought rates (>300/500 spins without bonus)
- Compare pacing metrics across base/buy/hype modes

### Commands

```bash
# Run pacing report (default params)
make pacing-report

# Run with custom parameters
cd backend && .venv/bin/python -m scripts.pacing_report \
    --seed PACING_2026 \
    --rounds-base 200000 \
    --rounds-buy 200000 \
    --rounds-hype 200000 \
    --verbose

# Also save detailed CSV files
cd backend && .venv/bin/python -m scripts.pacing_report --seed PACING_2026 --save-csv --verbose
```

### Default Parameters (gate-like)

```
Seed: AUDIT_2025
Rounds (base): 20,000
Rounds (buy):  20,000
Rounds (hype): 20,000
```

### Output Files

| File | Description |
|------|-------------|
| `pacing_report_<seed>.txt` | Text report (always generated) |
| `pacing_base_<seed>.csv` | Base mode CSV (only with `--save-csv`) |
| `pacing_buy_<seed>.csv` | Buy mode CSV (only with `--save-csv`) |
| `pacing_hype_<seed>.csv` | Hype mode CSV (only with `--save-csv`) |

### Metrics Explained

**Win Pacing:**
- `win_rate`: Percentage of spins with credit > 0
- `dry_spins_rate`: Percentage of spins with credit == 0
- `spins_between_wins` (p50/p90/p99): Median/90th/99th percentile of gaps between wins
- `avg_win_x`, `p95_win_x`, `p99_win_x`: Win multiplier distribution

**Bonus Pacing:**
- `bonus_entry_rate`: Percentage of spins triggering bonus
- `spins_between_bonuses` (p50/p90/p99): Gaps between bonus entries
- `drought_rate_300`: Percentage of intervals > 300 spins without bonus
- `drought_rate_500`: Percentage of intervals > 500 spins without bonus

**Volatility:**
- `max_win_x`: Maximum observed win multiplier
- `rate_100x_plus`, `rate_500x_plus`, `rate_1000x_plus`: Big win frequencies

### Example Output (Snippet)

```
================================================================================
PACING REPORT
================================================================================

Timestamp:    2026-01-19T12:00:00Z
Git commit:   abc1234
Config hash:  6b282b3256cf6b4e
Seed:         PACING_2026
Rounds:       base=200,000, buy=200,000, hype=200,000

--------------------------------------------------------------------------------
  BASE MODE
--------------------------------------------------------------------------------

  CORE METRICS
    RTP:               98.0954%
    Win rate:          28.7140%
    Dry spins rate:    71.2860%
    Bonus entry rate:  0.2690%

  WIN PACING
    Spins between wins (p50/p90/p99): 2 / 6 / 12
    ...

================================================================================
COMPARISON TABLE
================================================================================

Metric                              Base          Buy         Hype
------------------------------------------------------------------
RTP                            98.0954%     97.5432%     78.4321%
Win rate                       28.7140%    100.0000%     28.9876%
...

================================================================================
RISK FLAGS
================================================================================

  No risk flags detected.
```

### Risk Flags

The report automatically checks for common pacing issues:

| Flag | Condition | Meaning |
|------|-----------|---------|
| High dry rate | `dry_spins_rate > 80%` | Too many losing spins |
| Bonus drought | `bonus p99 > 600 spins` | Some players wait very long for bonus |
| Hype pacing | `hype bonus_rate <= base` | Hype mode should have higher bonus rate |

### Reproducibility

All pacing reports use deterministic seeding. Same seed + config_hash = identical results.

```bash
# Verify reproducibility
make pacing-report  # Run twice, compare outputs
diff out/pacing_report_PACING_2026.txt out/pacing_report_PACING_2026.txt.bak
```

### DO NOT COMMIT (explicit list)

These output files are generated locally and **must NOT be committed**:

```
out/pacing_report_*.txt    # Text reports
out/pacing_base_*.csv      # Base mode CSVs
out/pacing_buy_*.csv       # Buy mode CSVs
out/pacing_hype_*.csv      # Hype mode CSVs
```

Before committing, verify with:
```bash
git status | grep pacing
# Should show nothing, or only untracked files
```

### Notes

- Report output is NOT committed to git
- CSV files are only generated with `--save-csv` flag
- Output is locked to `out/` directory (fail-fast validation)

---

## Pacing Compare v1 (`make pacing-compare`)

The **pacing compare** tool compares current pacing metrics against a committed baseline JSON. It uses tolerances to avoid flapping from 20k variance.

**BASELINE COMMITTED** — `pacing_baseline_gate.json` is tracked in git.

**NOT part of `make gate` or CI** — run manually for QC checks.

### Purpose

- Compare pacing metrics against a stable baseline
- Detect significant regressions in win/bonus pacing
- Validate game math changes don't hurt player experience
- Provide reproducible comparison with tolerance-based PASS/FAIL

### Baseline File

**File:** `out/pacing_baseline_gate.json` (COMMITTED to repo)

This baseline uses canonical gate parameters:
- Seed: `AUDIT_2025`
- Rounds: `20000` (per mode)

### Commands

```bash
# Generate baseline (one-time, or after config_hash changes)
make pacing-baseline

# Compare current simulation against baseline
make pacing-compare
```

### How to Generate Baseline

**One-time setup** or when config_hash changes:

```bash
# Generate baseline
make pacing-baseline

# Verify the values look reasonable
cat out/pacing_baseline_gate.json | head -20

# Commit to repo
git add out/pacing_baseline_gate.json
git commit -m "chore: add/update pacing baseline"
```

### How to Compare

```bash
# Compare against baseline (uses baseline params automatically)
make pacing-compare

# Manual comparison with custom params (NOT recommended - use baseline params)
cd backend && .venv/bin/python -m scripts.pacing_compare \
    --baseline ../out/pacing_baseline_gate.json \
    --seed AUDIT_2025 \
    --rounds 20000 \
    --verbose
```

### What PASS/FAIL Means

**PASS:** All metrics within tolerance — no significant pacing regression.

**FAIL:** At least one metric exceeds tolerance — investigate before shipping.

### Tolerances (v1)

Tolerances are hardcoded to survive 20k variance:

| Metric | Tolerance | Description |
|--------|-----------|-------------|
| `dry_spins_rate` | ±0.05 | 5 percentage points |
| `win_rate` | ±0.03 | 3 percentage points |
| `bonus_entry_rate` | ±0.0015 | 0.15 percentage points |
| `spins_between_wins_p50` | ±15 | Spins (median) |
| `spins_between_wins_p90` | ±25 | Spins (90th percentile) |
| `spins_between_wins_p99` | ±80 | Spins (99th percentile) |
| `spins_between_bonus_p50` | ±60 | Spins (median) |
| `spins_between_bonus_p90` | ±120 | Spins (90th percentile) |
| `spins_between_bonus_p99` | ±250 | Spins (99th percentile) |
| `bonus_drought_gt300_rate` | ±0.02 | 2 percentage points |
| `bonus_drought_gt500_rate` | ±0.01 | 1 percentage point |
| `max_win_x` | ≥85% of baseline | Regression threshold |
| `rate_100x_plus` | ±0.002 | 0.2 percentage points |
| `rate_500x_plus` | ±0.0006 | 0.06 percentage points |
| `rate_1000x_plus` | ±0.002 | 0.2 percentage points |
| `rtp` | INFO only | Not failed (gated elsewhere) |

### Output Files

| File | Description | Commit? |
|------|-------------|---------|
| `pacing_baseline_gate.json` | Baseline JSON | **YES** |
| `pacing_compare_*.txt` | Comparison report | NO |
| `pacing_run_*.json` | Run JSON (if --write-run-json) | NO |

### DO NOT COMMIT (explicit list)

These output files are generated locally and **must NOT be committed**:

```
out/pacing_compare_*.txt     # Comparison reports
out/pacing_run_*.json        # Run JSON summaries
```

### Example Output

```
============================================================
PACING COMPARE
============================================================
Baseline:     ../out/pacing_baseline_gate.json
Seed:         AUDIT_2025
Rounds:       20000
Modes:        base, buy, hype
Config hash:  6b282b3256cf6b4e
Baseline hash:6b282b3256cf6b4e

Running simulation (seed=AUDIT_2025, rounds=20000)...

================================================================================
  BASE MODE
================================================================================
Metric                               Run     Baseline         Diff     Status
--------------------------------------------------------------------------------
rtp                             0.9810       0.9810            0       INFO
win_rate                        0.2870       0.2870            0       PASS
dry_spins_rate                  0.7130       0.7130            0       PASS
...

================================================================================
RISK FLAGS
================================================================================
  No risk flags detected.

================================================================================
RESULT: PASS - All metrics within tolerance
================================================================================
```

### Config Hash Validation

If `config_hash` changes between baseline and current run:
1. A **warning** is printed
2. Comparison continues (metrics may fail)
3. You should **regenerate baseline** with `make pacing-baseline`
4. **Commit** the new baseline to the repo

### Exit Codes

- `0`: PASS - all metrics within tolerance
- `1`: FAIL - at least one metric out of tolerance

### Commit Policy Summary

| File | Commit? | Purpose |
|------|---------|---------|
| `pacing_baseline_gate.json` | **YES** | Canonical baseline (regenerate with `make pacing-baseline`) |
| `pacing_report_*.txt` | **NO** | Diagnostic reports |
| `pacing_*.csv` | **NO** | CSV exports |
| `pacing_current_*.json` / `pacing_run_*.json` | **NO** | Run snapshots |
| `pacing_compare_*.txt` | **NO** | Comparison reports |

The `check-baseline-changed.sh` script will **FAIL** if forbidden pacing files are staged.
