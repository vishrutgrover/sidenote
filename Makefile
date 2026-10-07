.PHONY: test test-unit test-integration test-frontend test-e2e test-all run run-frontend

PY = backend/.venv/bin

# ---- tests ----
test:                ## backend: unit + integration
	cd backend && ../$(PY)/python -m pytest -q

test-unit:           ## backend: unit only (fast, in-memory database)
	cd backend && ../$(PY)/python -m pytest tests/unit -q

test-integration:    ## backend: API tests on a seeded temporary database
	cd backend && ../$(PY)/python -m pytest tests/integration -q

test-frontend:       ## frontend: unit and component tests (Vitest)
	cd frontend && npm test --silent

test-e2e:            ## browser tests (Playwright): starts both servers itself
	cd frontend && npx playwright test

test-all: test test-frontend test-e2e

# ---- run ----
run:                 ## backend on :8000 (uses backend/.env if it exists)
	cd backend && ../$(PY)/uvicorn app.main:app --reload $(if $(wildcard backend/.env),--env-file .env)

run-frontend:        ## frontend on :3000
	cd frontend && npm run dev
