# Assignment checklist

Every requirement from the brief, where it lives, and which test proves it. The last column is for answering "show me".

**Test paths:** `unit/test_*.py` and `integration/` are under `backend/tests/`. `unit/*.test.ts(x)` and `e2e/` are under `frontend/tests/`.

## Core features

| Requirement | Where | Proved by |
|---|---|---|
| **1. Meetings library** | | |
| List with title, date, duration, participants | `frontend/app/(app)/meetings/page.tsx`, `components/MeetingCard.tsx` · `GET /api/meetings` | `e2e/library.spec.ts`, `integration/test_meetings_api.py` |
| Search and filter (title, date, participant) | `lib/meetingFilters.ts`, `components/FilterPopover.tsx` · `routers/meetings.py` (`list_meetings`) | `unit/meetingFilters.test.ts`, `integration/test_meetings_api.py`, `e2e/library.spec.ts` |
| Sort by recency | `sort=recent\|oldest` | `e2e/library.spec.ts` ("sort oldest first") |
| Navbar with profile and settings | `components/Sidebar.tsx`, `Topbar.tsx`, `app/settings/` | `e2e/shell.spec.ts`, `e2e/pages.spec.ts` |
| **2. Meeting / transcript view** | | |
| Interactive transcript with speakers and timestamps | `components/TranscriptPanel.tsx` · `GET /meetings/{id}/transcript` | `e2e/meeting.spec.ts` |
| Media player with seek bar | `components/PlayerBar.tsx`, `lib/usePlayer.ts`, `backend/media/*.mp3` | `unit/usePlayer.test.tsx`, `e2e/meeting.spec.ts` (real audio) |
| Click a line to seek, and the reverse | `TranscriptPanel` (`player.seek`) and `activeIndex` in `lib/transcript.ts` | `e2e/meeting.spec.ts` ("clicking a line jumps…", "playing really plays…") |
| Search inside the transcript, highlighted | `TranscriptPanel` find bar · `services/search.py` | `unit/test_search.py`, `unit/player-ui.test.tsx`, `e2e/meeting.spec.ts` |
| **3. AI summary and notes** | | |
| Summary | `components/NotesPanel.tsx` · `services/ai.py` | `integration/test_ai_api.py` |
| Action items | `components/ActionItems.tsx` · `routers/action_items.py` | `e2e/notes.spec.ts` |
| Key topics, outline, chapters | note sections, keywords, tags (`SmartSearch`) | `integration/test_notes_api.py` |
| Seeded, mocked or LLM | all three: `seed_data.py`, `services/ai_mock.py`, `services/llm/` | `unit/test_ai.py`, `unit/test_llm_*.py` |
| **4. CRUD** | | |
| Create (upload, paste, form) | `NewMeetingModal.tsx` · `POST /api/meetings` | `e2e/crud.spec.ts`, `unit/test_parser.py` |
| Edit title and participants | `EditMeetingModal.tsx` · `PATCH /api/meetings/{id}` | `e2e/crud.spec.ts` |
| Delete a meeting | `ConfirmDelete.tsx` · `DELETE /api/meetings/{id}` (cascades) | `unit/test_models.py`, `e2e/crud.spec.ts` |
| Add, edit, complete action items | `ActionItems.tsx`, `app/(app)/tasks/page.tsx` | `e2e/notes.spec.ts`, `e2e/pages.spec.ts` |
| Everything persists | SQLite file; seeded on first start | every integration test |
| **5. Fireflies-like experience** | | |
| Navigation and layout (library + detail) | sidebar, 3-column meeting page | `e2e/shell.spec.ts` |
| Transcript and summary panels | `TranscriptPanel`, `NotesPanel`, `SmartSearch` | `e2e/meeting.spec.ts`, `e2e/notes.spec.ts` |
| Forms, modals, search, filters | `Modal.tsx` (native `<dialog>`), `FilterPopover`, `CommandPalette` | `e2e/crud.spec.ts`, `e2e/search.spec.ts` |
| Notifications and toasts | `Toast.tsx`, `NotificationsMenu.tsx` | `unit/shell.test.tsx`, `e2e/pages.spec.ts` |
| Settings placeholders | `app/settings/`, `lib/settingsSections.ts` | `e2e/pages.spec.ts` |

## Placeholders ("Coming soon" is enough)

| Item | How it appears |
|---|---|
| Live-call bot, speech-to-text | Capture menu: "Add to live meeting", "Start recording" show a toast |
| Integrations | `/integrations` page, `ComingSoon` |
| Team and sharing | Share dialog says so; Settings "Team" tab is disabled |
| Real authentication | none: one default user (`GET /api/me`) |

## Bonus features (all implemented)

| Bonus | Where | Proved by |
|---|---|---|
| Comments, highlights, soundbites | `panels/CommentsPanel.tsx`, `SoundbitesPanel.tsx`, `BookmarksPanel.tsx` · `routers/collab.py` | `e2e/collab.spec.ts`, `integration/test_collab_api.py` |
| Export PDF, Markdown, TXT | `ExportModal.tsx` · `services/exporter.py` (also JSON, SRT, CSV) | `unit/test_exporter.py`, `e2e/collab.spec.ts` (real downloads) |
| Global search across all meetings | `CommandPalette.tsx` (Cmd+K) · `GET /api/search` | `e2e/search.spec.ts`, `integration/test_search_api.py` |
| Tags and filtering by them | `SmartSearch` (add/remove) · `FilterPopover` (filter) · `routers/topics.py` | `e2e/notes.spec.ts`, `integration/test_notes_api.py` |
| LLM "ask a question about this meeting" | `AskPanel.tsx` · `services/chat.py`, `services/llm/` | `e2e/ask.spec.ts`, `unit/test_chat.py` |
| Dark mode | `ThemeProvider.tsx`, `globals.css` variables, Settings | `e2e/shell.spec.ts`, `e2e/pages.spec.ts` |

## Extras beyond the brief

People page with talk time (`routers/people.py`, `app/(app)/people/`), a pluggable multi-provider AI layer with a call log (`ai_runs`), real sample audio, `?t=` deep links into a moment, and a test suite of 963 tests.

## Deliverables

| Deliverable | Where |
|---|---|
| Public GitHub repo with `frontend/` and `backend/` | github.com/vishrutgrover/sidenote (private until you publish it) |
| README: setup, stack, architecture, schema, API, assumptions | `README.md`, with deeper notes in `docs/` |
| Seeded data, several meetings with transcripts, summaries, tasks | `backend/app/seed_data.py` (6 meetings) |
| Database design (evaluated) | `backend/app/models.py`; diagram in the README; reasoning in `docs/EXPLAINED.md` section 1 |
| Hosted demo | https://sidenote-kappa.vercel.app |

## Assumptions and limits (say these first, before they ask)

- One logged-in user, no authentication (the brief allows it).
- Meetings are transcripts, not audio: real speech-to-text is out of scope. The sample audio is synthetic.
- **People are identified by name.** Two different humans with the same name in two meetings would be treated as one person. (Uploaded transcripts carry no email, so there is nothing better to match on.)
- SQLite, so one writer; the free hosting forgets the database on restart and re-seeds.
- Tables are created at start-up; there are no migrations.
- The AI providers other than the built-in one were tested against fake responses, not live APIs.
- `npm audit` reports advisories in **development-only** tools (the test runner and the linter). The production dependencies of both the frontend and the backend audit clean (`npm audit --omit=dev`, `pip-audit`). The test runner is held at an older major version because the newer one needs a newer Node than the development machine has; upgrading Node and Vitest together is the fix.
