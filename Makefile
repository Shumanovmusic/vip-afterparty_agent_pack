.PHONY: up down test dev install clean

up:
	docker compose up -d

down:
	docker compose down

test:
	cd backend && python -m pytest -q

dev:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

install:
	cd backend && pip install -e ".[dev]"

clean:
	docker compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
