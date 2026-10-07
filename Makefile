.PHONY: install test test-unit test-integration test-frontend test-e2e test-all run run-frontend screenshots audio

PY = backend/.venv/bin

install:             ## backend virtualenv, frontend packages, and the browser the end-to-end tests use
	python3 -m venv backend/.venv
	$(PY)/pip install -q -r backend/requirements-dev.txt
	cd frontend && npm install && npx playwright install chromium

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

# ---- generated files (see docs/GENERATED.md) ----
screenshots:         ## redraw docs/media/*.png from the running app (start both servers first)
	cd frontend && node scripts/readme-screenshots.mjs ../docs/media

audio:               ## rebuild backend/media/*.mp3 from the sample transcripts (macOS + ffmpeg)
	cd backend && ../$(PY)/python -m scripts.make_sample_audio
