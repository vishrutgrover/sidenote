# Fireflies.ai Clone: Plan

## Context
SDE fullstack assignment: clone Fireflies meeting library + transcript detail + AI notes, with CRUD, seeded data, README, public repo, hosted demo. All bonus features required (comments/highlights/soundbites, export, global search, tags, AskFred chat, dark mode). Code must stay simple enough to explain in an interview. Workspace `/Users/vishrutgrover/coding/realprod` has no project yet (greenfield). Node 20, Python 3.11 available.

Decisions (user confirmed): FastAPI + SQLAlchemy, LLM-if-key-else-mock, Vercel (frontend) + Render (backend), user will send screenshots for exact look.

## Research findings (Fireflies, verified from help docs unless noted)
- Left nav: Home, AskFred, Meetings, Tasks, AI Skills, Analytics, Integrations, Settings. Top bar: account menu, global search (Ctrl+K), bell, Invite, Capture.
- Meetings page: secondary sidebar of channels (My Meetings, All Meetings, Uploads, custom). Row = checkbox, title, host, date/time, summary preview, participants. Hover "Details". Filters: host, participants, date presets, duration buckets, "Clear all". Bulk select: move/delete.
- Meeting page ("Notepad"): two panels, summary/notes left, transcript right. Header: title, 3-dot menu, Share. Icon rail: Smart Search, Index, Soundbites, Comments, Bookmarks. Player with speed + skip. Transcript line = speaker + timestamp, click seeks, find bar. AskFred = side panel with suggested questions, copy, thumbs.
- Export: PDF/MD/DOCX/JSON/SRT. Summary key points carry timestamps.
- Inferred only: colors, font, seek-bar speaker segments. Style tokens isolated in one CSS file, filled from user screenshots.

## Architecture
Project lives in `realprod/sidenote/` (short name). It is its own git repo (`git init` inside), initial branch `sidenote`, so folder name = branch name. No push unless asked; no AI attribution in commits (user's CLAUDE.md overrides the harness reminder).
```
realprod/sidenote/
  backend/   FastAPI, SQLAlchemy, SQLite
    app/main.py            app + CORS + router includes + startup seed
    app/db.py              engine, SessionLocal, get_db
    app/models.py          all tables
    app/schemas.py         Pydantic in/out
    app/routers/           meetings.py, transcript.py, notes.py (summary/actions/topics),
                           comments.py, soundbites.py, search.py, ask.py, export.py
    app/services/          parser.py (txt/vtt/json to segments), ai.py (prompts + calls provider), exporter.py
    app/services/llm/      base.py (LLMProvider protocol), registry.py, anthropic.py, openai.py (also Groq/OpenRouter/Ollama via base_url), gemini.py, mock.py
    app/seed.py            6-8 meetings, runs if DB empty
    tests/                 pytest: parser, CRUD, search
  frontend/  Next.js App Router + TypeScript
    app/(app)/layout.tsx   sidebar + topbar shell
    app/(app)/meetings/page.tsx        library
    app/(app)/meetings/[id]/page.tsx   detail
    app/(app)/{home,tasks,settings,analytics,integrations,askfred}/page.tsx  Coming Soon / settings placeholders
    components/            MeetingRow, FilterBar, Player, TranscriptList, SummaryPanel, ActionItems,
                           CommentsPanel, SoundbitesPanel, AskFredPanel, NewMeetingModal, EditMeetingModal,
                           CommandPalette, Toast, ExportMenu, ComingSoon
    lib/api.ts             one typed fetch wrapper
    styles/tokens.css      colors/radii/fonts, light + dark
```
Styling: plain CSS variables + CSS modules (no UI library), easy to explain and to retheme from screenshots. State: React `useState` + fetch; no Redux. Toasts: tiny context provider.

## Database schema (SQLite)
- `users` id, name, email (the one default logged-in user, no auth)
- `people` id, name, email unique (one row per human, shared by all meetings)
- `meetings` id, title, started_at, duration_sec, media_url, source (seed/upload/paste), status (processing/ready/failed), created_by -> users, created_at
- `meeting_participants` id, meeting_id FK, person_id FK, color, is_host; unique(meeting_id, person_id). Transcript lines and tasks point at this seat
- `segments` id, meeting_id FK, speaker_id -> meeting_participants (SET NULL), start_sec, end_sec, text, sentiment (positive/neutral/negative)
- `summaries` id, meeting_id FK unique, overview, keywords (JSON list)
- `note_sections` id, meeting_id FK, title, position; `note_bullets` id, section_id FK, text, timestamp_sec, position
- `action_items` id, meeting_id FK, assignee_id -> meeting_participants (SET NULL), text, timestamp_sec, due_date, is_done
- `topics` id, name unique; `meeting_topics` meeting_id, topic_id (tags, many-to-many)
- `comments` id, meeting_id FK, segment_id FK, user_id FK, body, created_at
- `soundbites` id, meeting_id FK, start_sec, end_sec, title; `bookmarks` id, meeting_id FK, time_sec, note
- `chat_messages` id, meeting_id FK (NULL = global chat), role, content, created_at
- `ai_runs` id, meeting_id (SET NULL), task (summarize/ask), provider, model, latency_ms, status (ok/fallback/error), error, created_at
- `segments_fts` FTS5 virtual table, kept in sync by triggers
Talk time, words per minute, question counts and metrics are computed from `segments` at read time, never stored.
Extra: a People page (per-person meetings, total talk time, open tasks) enabled by the global `people` table. Skipped: notifications feed, decisions section, meeting series.
Delete meeting cascades to all children. Search uses SQLite FTS5 virtual table `segments_fts` for transcript text; title/participant search via LIKE.

## API (REST, JSON, `/api`)
- `GET /meetings?q=&participant=&topic=&date_from=&date_to=&sort=recent` ; `POST /meetings` (form fields or pasted/uploaded .txt/.vtt/.json) ; `GET/PATCH/DELETE /meetings/{id}`
- `GET /meetings/{id}/transcript?q=` ; `PATCH /segments/{id}` (edit text)
- `GET /meetings/{id}/summary` ; `POST /meetings/{id}/summary/regenerate`
- `GET/POST /meetings/{id}/action-items` ; `PATCH/DELETE /action-items/{id}` ; `GET /action-items` (Tasks page)
- `GET/POST /meetings/{id}/comments` ; `DELETE /comments/{id}`
- `GET/POST /meetings/{id}/soundbites` ; `DELETE /soundbites/{id}`
- `PUT/DELETE /meetings/{id}/topics/{name}` ; `GET /topics`
- `GET /search?q=` global: meetings + transcript hits with snippet and timestamp
- `POST /meetings/{id}/ask` AskFred ; `GET /meetings/{id}/chat` ; `GET /llm/models`
- `GET /meetings/{id}/export?format=md|txt|pdf&what=transcript|summary`

## Key behaviors
- **Player**: HTML5 `<audio>` with a bundled short sample file; seed segment times are mapped to the file's length by clamping, so seek bar works for every meeting. Seek bar shows speaker-colored segments from `segments`. Transcript click sets `audio.currentTime`; `timeupdate` highlights and auto-scrolls the active line (the "vice versa"). Speed and skip +/-10s.
- **Parser** (`services/parser.py`): `.vtt` (cue time + "Speaker: text"), `.txt` (`[00:01:23] Name: text` lines or plain paragraphs with synthetic timing), `.json` (list of {speaker,start,text}). One function per format, one test each.
- **Pluggable LLM** (`services/llm/`): one interface, `class LLMProvider: name; models; complete(system, prompt, model) -> str`. Each provider is one small file calling its REST API with `httpx` (no vendor SDKs, no new deps). `registry.py` holds `PROVIDERS = {"anthropic": ..., "openai": ..., "gemini": ..., "mock": ...}`; adding a provider = new file + one registry line. The OpenAI-compatible class takes `base_url`, so Groq, OpenRouter, Together and local Ollama are config, not code.
  - Config via `.env`: `LLM_PROVIDER`, `LLM_MODEL` (defaults), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, optional `OPENAI_BASE_URL`. A provider counts as available only if its key is set; `mock` is always available and is the default when nothing is set.
  - `GET /llm/models` returns available providers with their model lists. `POST /meetings/{id}/ask` and `/summary/regenerate` accept optional `provider` + `model`, else use defaults.
  - Frontend: model picker dropdown in the AskFred panel and a "AI model" default in Settings (stored in localStorage, sent with requests).
- **AI** (`services/ai.py`): `summarize(segments, provider)` and `answer(question, segments, provider)` build prompts (ask for JSON, parse it, fall back to mock on parse/HTTP error and toast a warning). Mock provider: top-frequency keywords, first/last lines as overview, lines matching "will/need to/should/action" as action items, keyword-overlap retrieval for answers. Runs on meeting create so uploaded transcripts get notes.
- **Export**: md/txt built by string join; pdf via `reportlab` (one small function).
- **Dark mode**: `data-theme` attribute on `<html>`, persisted in localStorage, tokens swap.
- **Tags**: chips on meeting rows, topic filter in FilterBar, add/remove on detail page.

## Build phases (each ends with something runnable)
0. Create `realprod/sidenote/`, `git init -b fireflies`, `.gitignore`.
1. Scaffold backend, models, db, seed with 6-8 meetings (sample transcripts written by us, original), pytest for seed.
2. Meetings + transcript + search endpoints with tests.
3. Frontend shell, tokens, library page with search/filter/sort. Apply user screenshots to tokens here.
4. Detail page: player, transcript, find bar, summary panel, action items.
5. CRUD UI: new meeting modal (form/paste/upload), edit, delete confirm, action item add/edit/complete, toasts.
6. Bonus: comments, highlights/soundbites, tags, global search palette (Ctrl+K), export menu, AskFred panel, dark mode.
7. Placeholder pages (Coming Soon, settings tabs), polish, README (setup, stack, architecture, schema diagram, API table, assumptions), deploy.

## Skills to use during execution
superpowers: brainstorming (spec), writing-plans, test-driven-development for parser/API, verification-before-completion before claims, requesting-code-review at end. ponytail: stdlib/native first (FTS5, HTML audio, `<dialog>`, CSS vars) and no extra deps.

## Testing
- Backend: `backend/tests/unit/` (one piece, in-memory DB) and `backend/tests/integration/` (HTTP API on a seeded temp DB). `make test`, `make test-unit`, `make test-integration`.
- Frontend: `frontend/tests/unit/` (Vitest + Testing Library) and `frontend/tests/e2e/` (Playwright against both servers). `npm test`, `npm run test:e2e`.
- Every PR adds or updates tests for what it changes.

## Verification
- `cd backend && pytest` passes; `uvicorn app.main:app` serves `/docs`.
- `cd frontend && npm run build` clean; run both, then drive the app in a browser: filter library, open a meeting, click a line (audio seeks), play (line highlights), find-in-transcript, tick an action item, create meeting by paste and by .vtt upload, edit, delete, add comment, make soundbite, export md/pdf, Ctrl+K search, AskFred with mock, then with each provider whose key is available, switching model in the picker; pytest for registry (unavailable provider hidden, mock fallback on error); toggle dark mode, reload to confirm persistence.
- Deployed URLs load seeded data; Render startup re-seeds an empty DB.

## Open item
User to send Fireflies screenshots (library, meeting page, summary, settings). Needed before phase 3 polish; phases 1-2 do not depend on them.

## Addendum (after reference screenshots in `refimgs/`)
- **Name:** Sidenote (own logo, no Fireflies branding). Chat is "Ask Sidenote". Layout and UX follow the screenshots.
- **Theme:** light and dark both built (Settings > Appearance: Light / Dark / System), default System. Colors sampled from `refimgs/` pixels, stored as CSS variables in `styles/tokens.css`. Primary is indigo/violet, green accent for badges.
- **Skipped on purpose:** trial banner, upgrade/discount badges, free-meetings counter, Slack/Gmail promo. Integrations, Voice Agents, Analytics, AI Skills, Live capture, Team, Share-with-people are "Coming Soon".
- **Shell:** left sidebar (Home, Ask Sidenote | Meetings, Tasks | Analytics, Voice Agents | Integrations, Settings), collapsible to icon rail. Top bar: page title, search with Cmd+K, bell, Capture dropdown (Upload audio or video, Paste transcript; others Coming Soon).
- **Home:** welcome card, Quick Start (Upload File / Paste Transcript / Capture placeholder), Recent / Upcoming / AI Feed tabs.
- **Meetings:** channel sidebar (My Meetings, All Meetings, Uploads), list grouped by date, card = avatar, title, `date · time · N min · host`, hover shows `...` menu (Share, Copy Link, Download, Rename, Delete) and Details. Filters popover: Hosted by, Participants, Date Range, Duration, Tags, Clear All. Right panel: Ask Sidenote with channel tag.
- **Meeting page (3 columns):** left icon rail + panel (Smart Search: AI filters with counts, sentiments, speaker talktime, topic trackers | Soundbites | Comments | Bookmarks); center Notes tab (title, host, date, General Summary, sectioned bullets with `(mm:ss)` timestamps, Action items grouped by person with checkboxes, rating stars, Continue chips); right panel tabs Ask Sidenote / Transcript (speaker, timestamp, Find bar, active-line highlight). Bottom player bar: time, speed, back/forward 10s, play, download, bookmark star, thumbs.
- **Processing state:** new meeting shows "summary is processing" skeleton until notes are generated.
- **Export:** modal with Transcript / Summary tabs. Formats: PDF, MD, TXT, JSON, SRT, CSV (transcript); PDF, MD, JSON (summary). Checkboxes: include timestamps, show speaker names. DOCX and audio download skipped (extra dependency).
- **Global search:** Cmd+K modal, My / All tabs, Title only checkbox, sort Newest/Oldest, Filters.
- **LLM:** pluggable providers (anthropic, openai-compatible, gemini, mock) via httpx, as in the plan above.
- **Execution:** native (single session), one whole-branch review at the end.
