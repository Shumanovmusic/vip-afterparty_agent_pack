.PHONY: up down test test-quick test-full dev install clean install-hooks gate check-laws check-laws-freeze check-restorestate-freeze check-redis-atomicity check-crash-safety check-lock-ttl check-observability-gate check-telemetry-delivery-gate smoke-docker test-contract check-afterparty test-e2e test-e2e-harden frontend-install frontend-test frontend-build frontend-typecheck frontend-lint audit-long pacing-report pacing-baseline pacing-compare diff-audit diff-audit-compare-base diff-audit-compare-buy diff-audit-compare-hype tail-baseline tail-progression audit-gate-snapshots check-baseline-changed

up:
	docker compose up -d

down:
	docker compose down

test:
	cd backend && .venv/bin/python -m pytest -q

test-quick:
	@echo "Running fast unit tests (skipping slow/e2e)..."
	cd backend && .venv/bin/python -m pytest -q -m "not slow and not e2e" --tb=short

test-full:
	@echo "Running ALL tests including slow simulations..."
	cd backend && .venv/bin/python -m pytest -q --tb=short

dev:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

install:
	cd backend && pip install -e ".[dev]"

clean:
	docker compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

install-hooks:
	@echo "Installing pre-commit hooks..."
	@cp scripts/pre-commit.sh .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Pre-commit hook installed: 5000x cap + Afterparty consistency checks"

check-laws:
	cd backend && .venv/bin/python -m scripts.check_laws_sync

check-afterparty:
	@./scripts/check-afterparty-consistency.sh

smoke-docker:
	@echo "Starting Docker..."
	docker compose up -d
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		if curl -sf http://localhost:8000/health | grep -q '"ok":true\|"status":"ok"'; then \
			echo "Health OK"; break; \
		fi; \
		sleep 2; \
	done
	@curl -sf http://localhost:8000/health | grep -q '"ok":true\|"status":"ok"' || (docker compose down; exit 1)
	docker compose down

test-contract:
	cd backend && .venv/bin/python -m pytest -q tests/test_contract_init.py tests/test_contract_spin.py -v

test-e2e:
	@echo "Running E2E smoke tests (requires docker services to be up)..."
	cd backend && .venv/bin/python -m pytest tests/test_e2e_smoke_docker.py -v

test-e2e-harden:
	@echo "Running E2E Harden Pack tests (requires docker services)..."
	cd backend && .venv/bin/python -m pytest tests/test_e2e_harden_docker.py -v

# Frontend targets
frontend-install:
	cd frontend && npm install

frontend-test:
	cd frontend && npm run test

frontend-build:
	cd frontend && npm run build

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-lint:
	cd frontend && npm run lint

check-laws-freeze:
	@echo "Running Laws Freeze Gate (Gate A)..."
	cd backend && .venv/bin/python -m pytest -q tests/test_laws_freeze_gate.py

check-restorestate-freeze:
	@echo "Running RestoreState Freeze Gate (fail-fast)..."
	@./scripts/check-restorestate-freeze.sh

check-redis-atomicity:
	@echo "Running Redis Atomicity Gate..."
	cd backend && .venv/bin/python -m pytest -q tests/test_redis_atomicity_gate.py

check-crash-safety:
	@echo "Running Crash-Safety Gate..."
	cd backend && .venv/bin/python -m pytest -q tests/test_crash_safety_gate.py

check-lock-ttl:
	@echo "Running Lock TTL Gate..."
	cd backend && .venv/bin/python -m pytest -q tests/test_lock_ttl_gate.py

check-observability-gate:
	@echo "Running Observability Gate..."
	cd backend && .venv/bin/python -m pytest -q tests/test_observability_gate.py

check-telemetry-delivery-gate:
	@echo "Running Telemetry Delivery Gate..."
	cd backend && .venv/bin/python -m pytest -q tests/test_telemetry_delivery_gate.py

gate:
	@echo "=== GATE PACK v9 ==="
	@echo "Step 0a: Laws sync check (fail-fast)..."
	$(MAKE) check-laws
	@echo ""
	@echo "Step 0b: Afterparty consistency check (fail-fast)..."
	$(MAKE) check-afterparty
	@echo ""
	@echo "Step 0c: Laws Freeze Gate (Gate A - fail-fast)..."
	$(MAKE) check-laws-freeze || exit 1
	@echo ""
	@echo "Step 0d: Frontend typecheck + lint + tests (fail-fast)..."
	$(MAKE) frontend-typecheck || exit 1
	$(MAKE) frontend-lint || exit 1
	$(MAKE) frontend-test || exit 1
	@echo ""
	@echo "Step 0e: Baseline Update Policy check (fail-fast)..."
	@./scripts/check-baseline-changed.sh --all || exit 1
	@echo ""
	@echo "Step 0f: RestoreState Freeze Gate (fail-fast)..."
	@./scripts/check-restorestate-freeze.sh || exit 1
	@echo ""
	@echo "Step 0g: Redis Atomicity Gate (fail-fast)..."
	$(MAKE) check-redis-atomicity || exit 1
	@echo ""
	@echo "Step 0h: Crash-Safety Gate (fail-fast)..."
	$(MAKE) check-crash-safety || exit 1
	@echo ""
	@echo "Step 0i: Lock TTL Gate (fail-fast)..."
	$(MAKE) check-lock-ttl || exit 1
	@echo ""
	@echo "Step 0j: Observability Gate (fail-fast)..."
	$(MAKE) check-observability-gate || exit 1
	@echo ""
	@echo "Step 0k: Telemetry Delivery Gate (fail-fast)..."
	$(MAKE) check-telemetry-delivery-gate || exit 1
	@echo ""
	@echo "Step 1: Starting Docker services..."
	$(MAKE) up
	@echo "Waiting for backend to be ready..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		if curl -sf http://localhost:8000/health | grep -q '"ok":true\|"status":"ok"'; then \
			echo "Backend is ready"; break; \
		fi; \
		sleep 2; \
	done
	@curl -sf http://localhost:8000/health | grep -q '"ok":true\|"status":"ok"' || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 2: Running make test..."
	$(MAKE) test || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 3: Running E2E smoke tests..."
	$(MAKE) test-e2e || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 3b: Running E2E Harden Pack..."
	$(MAKE) test-e2e-harden || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 4: Running audit_sim --mode base (with caching)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode base --rounds 100000 --seed AUDIT_2025 --out ../out/audit_base.csv --verbose --skip-if-cached || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 5: Running audit_sim --mode buy (with caching)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 50000 --seed AUDIT_2025 --out ../out/audit_buy.csv --verbose --skip-if-cached || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 5b: Running audit_sim --mode hype (with caching)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode hype --rounds 100000 --seed AUDIT_2025 --out ../out/audit_hype.csv --verbose --skip-if-cached || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 5c: Running Tail Progression Gate (buy mode)..."
	cd backend && .venv/bin/python -m scripts.tail_progression --compare-to ../out/tail_baseline_buy_gate.csv --verbose || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 5d: Running RTP Targets Gate tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_rtp_targets_gate.py || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 6: Running seed_hunt (1000x+ tail, with caching)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 1000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds.json --verbose --skip-if-cached || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 7: Running tail gate and VIP snapshot tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_tail_gate.py tests/test_rng_vip_snapshots.py || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 8: GATE 4 - Cap Reachability (10000x+ tail, with caching)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 10000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds_10k.json --verbose --skip-if-cached || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 9: Running cap reachability gate tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_cap_reachability_gate.py || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 10: GATE 4 - Theoretical max verification..."
	cd backend && .venv/bin/python -m scripts.theoretical_max --mode buy --output human || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 11: Running theoretical max proof tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_theoretical_max_proof.py || (cd .. && $(MAKE) down; exit 1)
	@echo ""
	@echo "Step 12: Stopping Docker services..."
	$(MAKE) down
	@echo ""
	@echo "=== GATE PACK v9 COMPLETE ==="

# =============================================================================
# LONG-RUN AUDIT (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Use for stability checks and deep statistical analysis.
# Run manually: make audit-long
# Outputs: out/audit_base_1m.csv, out/audit_buy_200k.csv, out/audit_hype_200k.csv
# =============================================================================
audit-long:
	@echo "=== LONG-RUN AUDIT (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@mkdir -p out
	@echo "Step 1/3: Running base mode (1,000,000 rounds)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode base --rounds 1000000 --seed AUDIT_LONG_2026 --out ../out/audit_base_1m.csv --verbose
	@echo ""
	@echo "Step 2/3: Running buy mode (200,000 rounds)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 200000 --seed AUDIT_LONG_2026 --out ../out/audit_buy_200k.csv --verbose
	@echo ""
	@echo "Step 3/3: Running hype mode (200,000 rounds)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode hype --rounds 200000 --seed AUDIT_LONG_2026 --out ../out/audit_hype_200k.csv --verbose
	@echo ""
	@echo "=== LONG-RUN AUDIT COMPLETE ==="
	@echo ""
	@echo "Output files:"
	@ls -la out/audit_base_1m.csv out/audit_buy_200k.csv out/audit_hype_200k.csv
	@echo ""
	@echo "CSV Headers:"
	@echo "--- audit_base_1m.csv ---"
	@head -1 out/audit_base_1m.csv
	@echo "--- audit_buy_200k.csv ---"
	@head -1 out/audit_buy_200k.csv
	@echo "--- audit_hype_200k.csv ---"
	@head -1 out/audit_hype_200k.csv

# =============================================================================
# PACING REPORT (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Diagnostic tool for analyzing win pacing, bonus pacing, and volatility.
# Run manually: make pacing-report
# Outputs: out/pacing_report_<seed>.txt
# Optionally: pass --save-csv to also write CSV files
# =============================================================================
pacing-report:
	@echo "=== PACING REPORT (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@mkdir -p out
	cd backend && .venv/bin/python -m scripts.pacing_report --verbose

# =============================================================================
# PACING BASELINE (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Generates committed baseline JSON for pacing-compare.
# Uses gate-like params: seed=AUDIT_2025, rounds=20000.
# Run manually: make pacing-baseline
# Output: out/pacing_baseline_gate.json (COMMIT THIS FILE)
# Regenerate when: config_hash changes or intentional rebaseline.
# =============================================================================
pacing-baseline:
	@echo "=== PACING BASELINE GENERATION ==="
	@echo "This creates/updates the committed baseline file."
	@echo "Only regenerate when config_hash changes or intentional rebaseline."
	@echo ""
	@mkdir -p out
	cd backend && .venv/bin/python -m scripts.pacing_report --seed AUDIT_2025 --rounds-base 20000 --rounds-buy 20000 --rounds-hype 20000 --save-summary-json ../out/pacing_baseline_gate.json --verbose
	@echo ""
	@echo "Baseline written to: out/pacing_baseline_gate.json"
	@echo "IMPORTANT: Commit this file to the repo after verification."
	@echo ""
	@echo "First 3 lines of baseline:"
	@head -3 out/pacing_baseline_gate.json

# =============================================================================
# PACING COMPARE (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Compares current pacing metrics against committed baseline.
# Uses baseline params (seed/rounds) automatically.
# Run manually: make pacing-compare
# Output: out/pacing_compare_<seed>.txt (DO NOT COMMIT)
# Requires: out/pacing_baseline_gate.json (created by make pacing-baseline)
# =============================================================================
pacing-compare:
	@echo "=== PACING COMPARE (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@if [ ! -f out/pacing_baseline_gate.json ]; then \
		echo "ERROR: Baseline file not found: out/pacing_baseline_gate.json"; \
		echo ""; \
		echo "Generate baseline first with:"; \
		echo "  make pacing-baseline"; \
		echo ""; \
		echo "Then commit the baseline to the repo."; \
		exit 1; \
	fi
	cd backend && .venv/bin/python -m scripts.pacing_compare --baseline ../out/pacing_baseline_gate.json --use-baseline-params --verbose

# =============================================================================
# DIFF AUDIT (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Diagnostic tool to compare RTP results between runs.
# Verifies simulation determinism by running same parameters twice.
# Run manually: make diff-audit
# Outputs: out/diff/diff_*.csv
# =============================================================================
diff-audit:
	@echo "=== DIFF AUDIT (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@mkdir -p out/diff
	cd backend && .venv/bin/python -m scripts.diff_audit --rounds 20000 --seed AUDIT_2025 --outdir ../out/diff --verbose

# =============================================================================
# DIFF AUDIT COMPARE (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Compare fresh simulation runs against canonical gate snapshots.
# Uses --use-reference-params to take params (mode/rounds/seed) from reference CSV.
# Useful for verifying determinism after code changes.
#
# Run manually:
#   make diff-audit-compare-base   # Compare to out/audit_base_gate.csv
#   make diff-audit-compare-buy    # Compare to out/audit_buy_gate.csv
#   make diff-audit-compare-hype   # Compare to out/audit_hype_gate.csv
#
# Reference files are created by 'make audit-gate-snapshots'.
# =============================================================================
diff-audit-compare-base:
	@echo "=== DIFF AUDIT COMPARE: BASE (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@if [ ! -f out/audit_base_gate.csv ]; then \
		echo "ERROR: Reference file not found: out/audit_base_gate.csv"; \
		echo ""; \
		echo "Create it first with:"; \
		echo "  make audit-gate-snapshots"; \
		exit 1; \
	fi
	cd backend && .venv/bin/python -m scripts.diff_audit --compare-to ../out/audit_base_gate.csv --use-reference-params --verbose

diff-audit-compare-buy:
	@echo "=== DIFF AUDIT COMPARE: BUY (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@if [ ! -f out/audit_buy_gate.csv ]; then \
		echo "ERROR: Reference file not found: out/audit_buy_gate.csv"; \
		echo ""; \
		echo "Create it first with:"; \
		echo "  make audit-gate-snapshots"; \
		exit 1; \
	fi
	cd backend && .venv/bin/python -m scripts.diff_audit --compare-to ../out/audit_buy_gate.csv --use-reference-params --verbose

diff-audit-compare-hype:
	@echo "=== DIFF AUDIT COMPARE: HYPE (non-blocking) ==="
	@echo "This is NOT part of make gate or CI."
	@echo ""
	@if [ ! -f out/audit_hype_gate.csv ]; then \
		echo "ERROR: Reference file not found: out/audit_hype_gate.csv"; \
		echo ""; \
		echo "Create it first with:"; \
		echo "  make audit-gate-snapshots"; \
		exit 1; \
	fi
	cd backend && .venv/bin/python -m scripts.diff_audit --compare-to ../out/audit_hype_gate.csv --use-reference-params --verbose

# =============================================================================
# TAIL PROGRESSION GATE (Blocking in gate, regenerate baseline manually)
# =============================================================================
# Verifies tail distribution metrics do not regress from committed baseline.
# Baseline: out/tail_baseline_buy_gate.csv (COMMITTED to repo)
# Run in gate: make tail-progression
# Regenerate baseline: make tail-baseline (NOT in gate - intentional action)
# =============================================================================
tail-baseline:
	@echo "=== TAIL BASELINE REGENERATION ==="
	@echo "This creates/updates the committed baseline file."
	@echo "Only regenerate when config_hash changes or intentional rebaseline."
	@echo ""
	@mkdir -p out
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 20000 --seed AUDIT_2025 --out ../out/tail_baseline_buy_gate.csv --verbose
	@echo ""
	@echo "Baseline written to: out/tail_baseline_buy_gate.csv"
	@echo "IMPORTANT: Commit this file to the repo after verification."

tail-progression:
	@echo "=== TAIL PROGRESSION GATE ==="
	@echo ""
	@if [ ! -f out/tail_baseline_buy_gate.csv ]; then \
		echo "ERROR: Baseline file not found: out/tail_baseline_buy_gate.csv"; \
		echo ""; \
		echo "Generate baseline first with:"; \
		echo "  make tail-baseline"; \
		echo ""; \
		echo "Then commit the baseline to the repo."; \
		exit 1; \
	fi
	cd backend && .venv/bin/python -m scripts.tail_progression --compare-to ../out/tail_baseline_buy_gate.csv --verbose

# =============================================================================
# GATE CANONICAL SNAPSHOTS (Non-blocking, NOT part of gate/CI)
# =============================================================================
# Deterministic baseline for diff-audit comparisons and quick regression checks.
# Uses gate-like params: seed=AUDIT_2025, rounds=20000.
# Run manually: make audit-gate-snapshots
# Outputs: out/audit_base_gate.csv, out/audit_buy_gate.csv, out/audit_hype_gate.csv
# Regenerate when: laws/math changes intentionally; diff failures indicate drift.
# =============================================================================
audit-gate-snapshots:
	@echo "=== GATE CANONICAL SNAPSHOTS ==="
	@echo "Generating canonical snapshots (seed=AUDIT_2025, rounds=20000)..."
	@echo ""
	@mkdir -p out
	@echo "Step 1/3: Generating base mode snapshot..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode base --rounds 20000 --seed AUDIT_2025 --out ../out/audit_base_gate.csv --verbose
	@echo ""
	@echo "Step 2/3: Generating buy mode snapshot..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 20000 --seed AUDIT_2025 --out ../out/audit_buy_gate.csv --verbose
	@echo ""
	@echo "Step 3/3: Generating hype mode snapshot..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode hype --rounds 20000 --seed AUDIT_2025 --out ../out/audit_hype_gate.csv --verbose
	@echo ""
	@echo "=== GATE CANONICAL SNAPSHOTS COMPLETE ==="
	@echo ""
	@echo "Output files:"
	@ls -la out/audit_base_gate.csv out/audit_buy_gate.csv out/audit_hype_gate.csv
	@echo ""
	@echo "CSV Headers:"
	@echo "--- audit_base_gate.csv ---"
	@head -1 out/audit_base_gate.csv
	@echo "--- audit_buy_gate.csv ---"
	@head -1 out/audit_buy_gate.csv
	@echo "--- audit_hype_gate.csv ---"
	@head -1 out/audit_hype_gate.csv

# =============================================================================
# BASELINE UPDATE POLICY CHECK (Can be added to gate/CI)
# =============================================================================
# Enforces BASELINE_POLICY.md: baseline changes require accompanying code changes.
# Run manually: make check-baseline-changed
# Add to CI: make check-baseline-changed-ci BASE_BRANCH=main
# =============================================================================
check-baseline-changed:
	@echo "=== Baseline Update Policy Check (staged changes) ==="
	@./scripts/check-baseline-changed.sh

check-baseline-changed-all:
	@echo "=== Baseline Update Policy Check (all uncommitted) ==="
	@./scripts/check-baseline-changed.sh --all

check-baseline-changed-ci:
	@echo "=== Baseline Update Policy Check (vs $(BASE_BRANCH)) ==="
	@./scripts/check-baseline-changed.sh --branch $(BASE_BRANCH)
# test
