# Generated files: where each came from

Most of the repo is written by hand. This page lists everything that is **not**: files made by a tool, binary files made by a script, and one-off values. For each: the command, what that command literally does from start to finish, and whether you should ever edit the result.

**Rule of thumb:** if a file is in the "generated" column, change its *source* and run the command again. Never hand-edit the output.

| File(s) | Made by | Edit by hand? |
|---|---|---|
| `frontend/package-lock.json` | `npm install` | No |
| `frontend/package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `app/layout.tsx` (start) | `create-next-app`, then edited | Yes (we changed them) |
| `frontend/.next/`, `next-env.d.ts`, `node_modules/`, `test-results/` | `next dev/build`, `npm install`, Playwright | No, and git ignores them |
| `backend/.venv/` | `python3 -m venv` + `pip install` | No, git ignores it |
| `backend/requirements.txt` | written from `pip freeze` | Yes (it is the source) |
| `backend/media/*.mp3` | `make audio` | No |
| `docs/media/*.png` | `make screenshots` | No |
| `frontend/app/icon.svg` | hand-written SVG | Yes |
| `backend/app/seed_data.py` | hand-written sample content | Yes |
| Colour values in `app/globals.css` | measured once from screenshots | Yes |
| `/docs` (Swagger page) | FastAPI, at run time | n/a, not a file |

---

## 1. The Next.js project skeleton

### The command

```bash
npx --yes create-next-app@latest frontend --ts --app --no-tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```

### What it does, step by step

1. **`npx`** looks for a local package named `create-next-app`; finding none, it downloads the latest version from the npm registry into a cache and runs its command-line program. `--yes` answers "ok to install?" for you.
2. `create-next-app` normally asks questions. Each flag answers one:
   - `--ts` use TypeScript, `--app` use the App Router (the `app/` folder routing), `--no-tailwind` no Tailwind CSS, `--eslint` set up ESLint, `--no-src-dir` put `app/` at the top (not in `src/`), `--import-alias "@/*"` let code write `@/lib/api` instead of `../../lib/api`, `--use-npm` use npm, `--no-turbopack` do not ask about the bundler, and `--yes` accept defaults for anything left.
3. It **copies a template** into `frontend/`: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, a favicon, a few demo SVGs in `public/`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `package.json`, a README, a `.gitignore`, and an `AGENTS.md`.
4. It writes your choices into those files. For example the import alias becomes `"paths": { "@/*": ["./*"] }` in `tsconfig.json`.
5. It runs **`npm install`** (see section 2), which creates `node_modules/` and `package-lock.json`.

### What we changed afterwards

- **Deleted** the demo SVGs, the default favicon, the template page and its CSS, and `AGENTS.md` (it is re-created by `next dev`, so it is git-ignored).
- **`app/layout.tsx`**: replaced the template (fonts, metadata, theme script, providers).
- **`next.config.ts`**: the template turned on `cacheComponents`; we removed it (the app fetches in the browser, so the standard model is simpler) and added `devIndicators: false`.
- **`package.json`**: added the `test`, `test:watch`, `test:e2e` scripts and the extra packages (next section).
- **`tsconfig.json` and `eslint.config.mjs`** are unchanged from the template. `tsconfig.json` is what `npx tsc --noEmit` reads: `strict` turns on all strict type checks, `noEmit` means "check only, write nothing", and `paths` is the `@/` alias.

### `next-env.d.ts`
Written by `next dev` / `next build`. It tells TypeScript about Next's own types (image imports and similar). It is git-ignored.

---

## 2. `package.json`, `package-lock.json` and `node_modules`

### Commands we ran to add packages

```bash
npm install lucide-react                 # an icon set the app imports
npm install -D vitest@^3 @vitejs/plugin-react@^4 vite@^6 jsdom@^26 \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event   # unit-test tools
npm install -D @playwright/test          # browser tests
```

(`-D` means "development only": needed to build and test, not to run the app.)

### What `npm install <name>` does, end to end

1. Reads `package.json`.
2. Asks the registry (`registry.npmjs.org`) which version of the package satisfies the range, and the same for **its** dependencies, recursively. This produces a full dependency tree (here 567 packages).
3. Downloads each package as a `.tgz` archive and checks its **SHA-512 hash** against the one the registry publishes.
4. Unpacks them into `node_modules/`.
5. Writes two files: your `package.json` gets the new line (for example `"lucide-react": "^1.52.0"`, meaning "1.52.0 or any later 1.x"), and **`package-lock.json`** records the exact result.

### What `package-lock.json` contains

For every one of the 567 packages: the exact `version`, the `resolved` download URL, the `integrity` hash, and which packages it depends on. Example:

```json
"node_modules/lucide-react": {
  "version": "1.52.0",
  "resolved": "https://registry.npmjs.org/lucide-react/-/lucide-react-1.52.0.tgz",
  "integrity": "sha512-TUgPtl5ZI9WgxOcbu4ckaC5B3l1qxPQrCMgb6OfUB9owx/OvSJfcf93SMgUWAxRw5/1XDfh9uI5F5iNGXCcGDQ=="
}
```

**Why commit it:** `package.json` says "1.x"; the lock says "exactly 1.52.0, with this hash". Everyone, and the Vercel build, installs the identical tree.

### `npm ci`
Meant for clean installs (I used it to verify a fresh clone builds). It **deletes `node_modules`** and installs exactly what the lockfile says, failing if `package.json` and the lock disagree. It never modifies the lock.

### Why Vitest is pinned to 3.x
The newest Vitest and Vite releases need a newer Node than 20.13 (the version on the development machine), and installing them failed on a peer-dependency conflict. Pinning to Vitest 3 / Vite 6 fixed it; the pins are in `package.json`.

---

## 3. The Python environment

```bash
python3 -m venv backend/.venv                      # 1
backend/.venv/bin/pip install -r backend/requirements-dev.txt   # 2
```

1. **`python3 -m venv backend/.venv`** creates a folder containing a link to the Python interpreter, a `pyvenv.cfg` file, a `bin/` with `python`, `pip` and `activate`, and an empty `lib/.../site-packages`. Packages installed with *that* `pip` go only there, so the project never touches your system Python.
2. **`pip install -r requirements-dev.txt`**: `-r` means "read the list from this file". The dev file says `-r requirements.txt` (include the runtime list) plus `pytest`. pip downloads each pinned package (and what *they* need) as a wheel from PyPI and unpacks it into `site-packages`.

### Where `requirements.txt` came from
After installing, `pip freeze` prints **every installed package as `name==version`**. From that list I kept the packages the app imports directly and wrote them into `requirements.txt` with exact versions. Packages they depend on (starlette, pydantic and so on) are installed by pip automatically, at whatever versions are compatible. So the **top level is pinned, the layers underneath are not**. A lock tool (`pip-compile`, `uv`) would pin those too; that would be the next step for a real deployment.

---

## 4. The sample recordings: `backend/media/*.mp3`

### The command

```bash
make audio        # runs: cd backend && python -m scripts.make_sample_audio
```
Needs **macOS** (the `say` program) and **ffmpeg**. Output files are committed, so nobody else has to run it.

### What `scripts/make_sample_audio.py` does, line group by line group

For each of the six meetings in `app/seed_data.py`:

1. **`layout(...)`** (from `seed.py`) gives the start and end second of every line. The same function is used when seeding the database, which is why audio and transcript timestamps agree.
2. For each line, **`speak()`** runs `say -v <voice> -r <words per minute> -o clip.aiff "<text>"`. `say` is macOS's built-in speech synthesiser; `-v` picks a voice (one per person, so Maya always sounds like Maya), `-o` writes an **AIFF** audio file instead of speaking aloud. It then measures the clip with `ffprobe`; if it is longer than its time slot it raises the speaking rate and tries again (up to 4 times), so lines never overlap.
3. **`to_wav()`** runs `ffmpeg -i clip.aiff -ac 1 -ar 22050 clip.wav`: convert to **mono** (`-ac 1`), **22,050 samples per second** (`-ar 22050`), as a WAV file. Python's `wave` module then reads the raw samples.
4. The script builds the whole meeting as one long byte string. **Silence** is the byte pair `b"\0\0"` (one 16-bit sample of value zero) repeated until the line's start time, then the clip's samples are appended. After the last line it pads with silence to the exact stored duration.
5. It writes that to `full.wav` with `wave`, then runs `ffmpeg -i full.wav -b:a 32k out.mp3`: **encode as MP3 at 32 kbit/s**. A 100-second meeting is about 400 KB.
6. It prints a warning if any line still runs past its slot.

(An earlier version mixed clips with ffmpeg's `adelay`/`amix` filters, but the ffmpeg on this machine (4.2.2) lacks options they need, so the timeline is assembled in Python instead. That also makes the output independent of the ffmpeg version.)

**How it is served:** FastAPI's `StaticFiles` mounted at `/media` (`app/main.py`). It supports **HTTP Range requests**: the browser asks for `bytes=0-` and gets `206 Partial Content` with a `Content-Range` header. Safari needs this to seek.

---

## 5. The README screenshots: `docs/media/*.png`

```bash
make run             # terminal 1: API on :8000
make run-frontend    # terminal 2: app on :3000
make screenshots     # runs: cd frontend && node scripts/readme-screenshots.mjs ../docs/media
```

What `scripts/readme-screenshots.mjs` does:

1. **Playwright** starts a headless **Chromium** (a real browser engine with no window).
2. For each picture it creates a **fresh browser context** (a clean profile, so nothing leaks between pictures), sets a 1440×900 viewport and a light or dark colour scheme.
3. `addInitScript` writes `localStorage.theme` before the page loads, which is the key the app reads to choose a theme.
4. It navigates, performs the clicks a person would, waits 700 ms for things to settle, and calls `page.screenshot`, which writes the visible viewport as a **PNG** (lossless pixels).
5. It closes the browser.

The text inside the pictures (times like "Today · 2:14 AM") reflects when they were taken, because the sample meetings are timestamped relative to "now".

---

## 6. Colours: where the hex values in `app/globals.css` came from

These were **measured once** from screenshots of the reference product, not guessed. A short Python script opened each screenshot, cut out a region (for example the sidebar), and counted pixel colours; the most common colour in the region is the region's background:

```python
from PIL import Image
from collections import Counter
img = Image.open("screenshot.png").convert("RGB")
region = img.crop((left, top, right, bottom))
Counter(region.getdata()).most_common(2)   # e.g. [((98, 58, 230), 79%), ...] -> #623ae6
```

Results used: primary `#623ae6`, light background `#ffffff`, sidebar `#fcfcfd`, ink `#121827`; dark background `#131314`, panels `#19191a` and `#1e1e1f`. They are plain CSS variables at the top of `globals.css`, so changing the look means editing those lines. (The screenshots themselves are not in the repo: they show personal data.)

---

## 7. The API documentation page (`/docs`)

Not a file. FastAPI reads the route functions and the Pydantic models in `schemas.py` **at start-up** and builds an **OpenAPI** description (a JSON document at `/openapi.json`), then serves **Swagger UI** at `/docs` to display it. Types and docstrings in the code become the documentation, so it cannot drift.

---

## 8. What each `make` / tool command literally does

| Command | What happens |
|---|---|
| `make install` | creates the venv, `pip install`s the dev requirements, runs `npm install`, then `npx playwright install chromium` (downloads a pinned Chromium build, about 94 MB, into `~/Library/Caches/ms-playwright`) |
| `make run` | `cd backend && uvicorn app.main:app --reload` (see below) |
| `make run-frontend` | `cd frontend && npm run dev` which runs `next dev` |
| `make test` | `cd backend && python -m pytest -q` |
| `make test-frontend` | `cd frontend && npm test` which runs `vitest run` |
| `make test-e2e` | `cd frontend && npx playwright test` |
| `make test-all` | the three above in order; stops at the first failure |

**`uvicorn app.main:app`**: uvicorn is the web server. `app.main:app` means "import the Python module `app.main` and use the object named `app` in it". That object is the FastAPI application, which follows the **ASGI** standard (the interface between Python web servers and apps). uvicorn opens a socket on port 8000, parses each HTTP request, calls the app, and writes the response. On start-up it triggers the app's **lifespan** function (`main.py`): create all tables, create the search index and its triggers, and insert the sample data if the database is empty. `--reload` restarts it when code changes (development only).

**`next dev` / `next build` / `next start`**: `dev` compiles pages on demand with hot reload. `build` compiles everything for production with the Turbopack bundler, type-checks the whole project (including the tests, which is why a type error in a test fails the build), and writes the result to `.next/`. `start` serves that output.

**`vitest run`**: Vitest uses Vite to turn TypeScript and JSX into JavaScript on the fly, runs every `tests/unit/**/*.test.ts(x)` file in a simulated browser (**jsdom**), and exits non-zero if any test fails. `tests/setup.ts` runs first: it fixes the timezone, adds the DOM matchers, and mocks the parts of the browser jsdom lacks.

**`pytest`**: reads `backend/pytest.ini` (look in `tests/`), imports `tests/conftest.py` first (which points `DATABASE_URL` at a throwaway file **before** the app is imported, so tests never touch real data), then runs every `test_*` function. Fixtures (`db`, `client`) build a fresh database per test.

**`playwright test`**: reads `playwright.config.ts`, which lists two **web servers**: it runs the backend command (deleting the old test database first) and a production build of the frontend on ports 8100 and 3100, waits until their URLs answer, launches Chromium, runs every spec in `tests/e2e/` one after another (`workers: 1`, because they share one database), then shuts the servers down.

---

## 9. Hand-written content that looks generated

- **`backend/app/seed_data.py`**: the six sample meetings (dialogue, notes, tasks, tags) were written for this project with AI assistance. They are original text. The code that turns them into rows is `seed.py`.
- **Tests**: written by hand alongside the code. Several were checked by breaking the code on purpose and confirming the test failed (see EXPLAINED.md, section 8).
- **Mermaid diagrams** in the README are text, rendered by GitHub.
- **Fonts and icons**: Inter is downloaded by `next/font/google` at build time and self-hosted by Next (open licence); the icons come from the `lucide-react` package (ISC licence).
