# Sidenote, explained

The design decisions in plain words, with the file to open for each. Written to be read before explaining the project to someone else.

## The one-minute version

A meeting is a **transcript** (timed lines with speakers) plus things built on top of it: notes, tasks, comments, clips. The backend stores that in SQLite and serves it as JSON. The frontend shows it and keeps a single clock, the player's `time`, that everything follows. AI is optional and swappable; without it a small built-in routine does the work.

## 1. The database

`backend/app/models.py` (every table, with a one-line comment each).

**The main idea: people are global, seats are per meeting.**

- `people` is one row per human. `meeting_participants` is that person's *seat* in one meeting (colour, host or not).
- Transcript lines (`segments`) and tasks point at the **seat**, not the person. So "Maya in the Weekly Sync" is a precise thing, and "everything Maya said anywhere" is one join.
- Removing someone from a meeting deletes their seat. Their lines survive with no speaker (`ON DELETE SET NULL`), so no transcript is lost.

**Notes are rows, not a text blob.** `summaries` (overview and keywords) plus `note_sections` and `note_bullets`, each bullet with a `timestamp_sec`. That is what makes every bullet individually editable and clickable.

**Nothing is stored that can be calculated.** Talk time, words per minute, sentiment split, the "questions / numbers / dates" counts are computed from `segments` when asked (`services/insights.py`). They can never disagree with the transcript.

**Cascades.** Deleting a meeting removes everything under it (foreign keys with `ON DELETE CASCADE`, which SQLite only honours after `PRAGMA foreign_keys=ON`, set in `db.py`). `ai_runs` keeps its rows (`SET NULL`) because it is a log. After a delete, people who are in no meeting are removed (`prune_orphan_people`), except you.

**Why SQLite?** It is a file, it needs no setup, and a reviewer can read the whole database. Limits: one writer, and the free hosting tier forgets the file on restart, so the seed runs at startup when the database is empty.

## 2. Click a line, hear it; hear it, see the line

`frontend/lib/usePlayer.ts` · `lib/transcript.ts` · `components/TranscriptPanel.tsx`

- `usePlayer` returns `{ time, playing, seek, ... }`. With a recording it drives an `Audio` element; without one it runs a timer. Nothing else knows the difference.
- The current line is `activeIndex(lines, time)`: a binary search for the last line that has started (tested against a brute-force scan).
- Clicking a line calls `seek(start_sec)`. The line being spoken scrolls into view while playing; if you scroll yourself it stops following and offers "Jump to current".
- A soundbite uses `playRange(start, end)`, which stops by itself at the end.
- The sample audio supports HTTP byte ranges (`206 Partial Content`). Safari will not seek without them.

## 3. Search

`backend/app/db.py` (index and triggers) · `services/search.py`

- Transcript text is indexed with **SQLite FTS5** (`segments_fts`), with stemming (`launching` finds `launch`) and prefix matching on the last word (search as you type).
- **Three triggers** (insert, update, delete) keep the index in step with `segments`. No application code has to remember. A test deletes the last line and inserts a new one to prove a reused row id does not inherit the old words.
- User text is turned into quoted words (`fts_query`) so `AND`, quotes, `*`, `-` are plain text and can never cause a syntax error.
- Titles and names use `LIKE` with escaping, so typing `%` searches for a percent sign.
- In-meeting search flags the matching lines (`match: true`); global search groups hits per meeting.

## 4. Getting a transcript in

`services/parser.py`

One small function per format (WebVTT, JSON, plain text), then one shared step that fills in missing start and end times from the word count. A text line that merely starts with `[00:01]` is not mistaken for JSON (a test caught that). Bad input raises `ValueError` with a readable message, which the endpoint turns into a 400 shown inside the upload dialog.

## 5. The AI layer

`backend/app/services/llm/` · `services/ai.py` · `services/ai_mock.py`

- **One interface**: `LLMProvider.complete(system, prompt, model)`. One file per provider, plain `httpx`, no vendor SDKs.
- **A registry** decides which providers exist and which are configured. A provider is available only when its key is set. A typo in `LLM_PROVIDER` is skipped with a warning instead of breaking the app.
- **Never leave a meeting without notes.** If a real provider fails for any reason (network, bad key, bad JSON), the built-in routine answers and the call is logged with status `fallback`.
- **Tolerant parsing.** Models wrap JSON in fences or chatter, so `parse_summary` pulls the object out, checks the shape, and nulls line numbers that do not exist.
- **Every call is logged** in `ai_runs` (provider, model, latency, outcome), shown under Settings → AI Settings.
- Uploads get their notes in a background task: the meeting is `processing`, then `ready`.
- Ask Sidenote sends the whole transcript for one meeting, and only the lines most relevant to the question (SQLite `bm25`) when asking across all meetings.

## 6. The API

`backend/app/routers/` (thin) and `backend/app/services/` (logic)

- Plain REST: nouns in the path, the right status codes (`201` created, `204` deleted, `400` bad input, `404` missing, `422` invalid shape).
- Validation lives in Pydantic models (`schemas.py`), e.g. a blank title is a `422`, not a database error.
- **Times**: the database keeps naive UTC. Filters take exact UTC times (`after`, `before`), so the browser decides what "today" means in its own timezone. (An earlier version used calendar dates and hid meetings from people east of UTC.)
- **Errors**: any unexpected error becomes `{"detail": "Something went wrong on the server"}` with a 500 *and CORS headers*. Without that, the browser reports it as "cannot reach the server" and hides the real problem.
- Uploads accept a pasted string or a file, with a 2 MB cap.

## 7. The frontend

`frontend/` · see its `README.md`

- **Next.js App Router, TypeScript, plain CSS** with variables (`app/globals.css`). No UI library, so every style is findable. The colours were sampled from reference screenshots of the product being recreated; the dark theme is a second set of the same variables.
- **One API client** (`lib/api.ts`): turns FastAPI error bodies into one readable sentence and a network failure into "Cannot reach the server".
- **`useFetch`** keeps the previous answer on screen (dimmed) while the next loads, ignores answers that arrive late, and exposes `reload()`. That is all the data layer there is; no state library.
- **Optimistic ticks** (`useTicks`): ticking a task shows at once and is saved in the background. A tick belongs to the exact list it was made on, so any reload makes the server's answer win and a stale tick can never come back.
- **Dialogs** use the native `<dialog>` element (focus trap and Escape for free). Forms live inside the dialog, so closing forgets them.
- **Dates**: the server sends UTC without a `Z`; `parseServerDate` adds it, otherwise browsers read it as local time.
- **CSS Modules gotcha**: a global class such as `.card` inside a module selector silently does nothing. A test (`css-modules.test.ts`) scans for it.

## 8. How it is tested

- **Backend unit**: logic with an in-memory database (parser, search sanitiser, insights, providers, export, CORS settings).
- **Backend integration**: the real API on a seeded temporary database, every endpoint including bad input and 404s.
- **Frontend unit**: components and hooks with a mocked `fetch` (`tests/unit/helpers/fixtures.ts`).
- **Browser end to end**: Playwright starts the real backend and a production build on spare ports and clicks through the product, with real audio and real file downloads. Tests that change data clean up after themselves.
- Typical flaws these found: a timezone bug in date filters, a stale search-index entry after a delete, a soundbite form that never closed, ghost people on the People page, and errors that looked like network failures.

## 9. Not built, on purpose

Real speech-to-text, a live meeting bot, login, teams and sharing, integrations, analytics, notifications as a service, DOCX export, database migrations. Each is labelled "coming soon" in the UI where it appears.

## 10. What I would do next

- Real audio upload with transcription (Whisper or a hosted API) behind the same `process_meeting` step.
- Postgres and migrations (Alembic) for a real deployment.
- Streaming answers in Ask Sidenote.
- A real notification model, and share links with permissions.
