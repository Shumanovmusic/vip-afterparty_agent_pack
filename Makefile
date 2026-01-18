.PHONY: up down test dev install clean install-hooks gate check-laws smoke-docker test-contract check-afterparty test-e2e

up:
	docker compose up -d

down:
	docker compose down

test:
	cd backend && .venv/bin/python -m pytest -q

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

gate:
	@echo "=== GATE PACK v5 ==="
	@echo "Step 0a: Laws sync check (fail-fast)..."
	$(MAKE) check-laws
	@echo ""
	@echo "Step 0b: Afterparty consistency check (fail-fast)..."
	$(MAKE) check-afterparty
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
	@echo "Step 4: Running audit_sim --mode base (with caching)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode base --rounds 100000 --seed AUDIT_2025 --out ../out/audit_base.csv --verbose --skip-if-cached || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 5: Running audit_sim --mode buy (with caching)..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 50000 --seed AUDIT_2025 --out ../out/audit_buy.csv --verbose --skip-if-cached || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 6: Running seed_hunt (1000x+ tail, with caching)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 1000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds.json --verbose --skip-if-cached || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 7: Running tail gate and VIP snapshot tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_tail_gate.py tests/test_rng_vip_snapshots.py || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 8: GATE 4 - Cap Reachability (10000x+ tail, with caching)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 10000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds_10k.json --verbose --skip-if-cached || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 9: Running cap reachability gate tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_cap_reachability_gate.py || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 10: GATE 4 - Theoretical max verification..."
	cd backend && .venv/bin/python -m scripts.theoretical_max --mode buy --output human || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 11: Running theoretical max proof tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_theoretical_max_proof.py || ($(MAKE) down; exit 1)
	@echo ""
	@echo "Step 12: Stopping Docker services..."
	$(MAKE) down
	@echo ""
	@echo "=== GATE PACK v5 COMPLETE ==="
