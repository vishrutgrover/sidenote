# Code tour

How to read this project, in the order that makes it make sense. Every file is listed with what it is for; the trickiest pieces are explained line by line; and three real requests are followed from the browser to the database and back.

How big is it? About **2,600 lines of backend** (234 of those are sample dialogue) and **3,600 lines of TypeScript**, plus tests.

## Part 1: the one-page mental model

```
Browser (Next.js)  ──fetch JSON──▶  FastAPI  ──▶  services  ──▶  SQLite
 pages/components                   routers       (logic)         (tables + FTS5 index)
 lib/api.ts is the only             thin: parse   parser, notes,
 place that calls fetch             the request,  search, export,
                                    call a        AI providers
                                    service,
                                    shape the reply
```

- A **router** function does four things only: read the request (types are validated by Pydantic), ask the database or a service, turn the result into a response model, return it. No business logic.
- A **service** is plain Python with no web code in it. That is why most backend tests need no HTTP at all.
- The **frontend** keeps one clock (`player.time`). The transcript highlight, the seek bar, soundbite playback and the Ask panel's citations all read or set that one value.

## Part 2: the backend, in reading order

### Start here (the foundations)

| File | What it is |
|---|---|
| `app/db.py` | Connects to SQLite (`DATABASE_URL`, default `./sidenote.db`), makes the session factory, turns on foreign keys, and creates the full-text search index plus its three triggers. |
| `app/models.py` | **The schema.** One class per table; each column and relationship is one line. Read this before anything else. |
| `app/schemas.py` | The **shapes of requests and responses** (Pydantic). If a field is not here, the API will not send or accept it. Also the validation rules (length limits, UTC conversion). |
| `app/main.py` | Builds the app: start-up (create tables, seed), the crash-to-JSON middleware, CORS, the media mount, and one `include_router` line per router. |
| `app/deps.py` | Two small helpers FastAPI injects into routes: the current user, and "load meeting N or answer 404". |

### The services (the logic)

| File | What it is |
|---|---|
| `services/parser.py` | Turns uploaded text, WebVTT or JSON into timed lines. |
| `services/meetings.py` | Create a meeting from parsed lines; add or find people and tags; remove people who are in no meeting. |
| `services/search.py` | Makes user text safe for SQLite's full-text search, and runs the searches. |
| `services/insights.py` | Talk time, words per minute, sentiment split, and which lines are questions, numbers or dates. Computed on request. |
| `services/ai.py` | Writes the notes: build the prompt, call a provider, read its JSON, save sections, tasks and tags. Falls back to the built-in logic if anything fails, and logs every call. |
| `services/ai_mock.py` | The built-in logic: word counts and phrase patterns. No network. |
| `services/chat.py` | Ask Sidenote: pick the right lines, ask the provider (or the built-in logic), store both messages. |
| `services/exporter.py` | Transcript or notes to PDF, Markdown, TXT, JSON, SRT or CSV. |
| `services/sentiment.py` | A keyword guess for positive, neutral, negative. |
| `services/llm/*.py` | The pluggable AI layer: `base.py` (interface and the one network function), `anthropic.py`, `openai.py` (also Groq, OpenRouter, Ollama), `gemini.py`, `mock.py`, `registry.py` (which providers are configured). |

### The routers (the HTTP surface, 44 operations)

| File | Routes |
|---|---|
| `routers/meetings.py` | list with filters, create from text or file, read, rename and edit people, delete |
| `routers/transcript.py` | the transcript (with search flags), edit one line |
| `routers/search.py` | global search |
| `routers/notes.py` | summary, edit it, regenerate it, edit a bullet, insights |
| `routers/action_items.py` | tasks across meetings and per meeting; create, update, delete |
| `routers/topics.py` | tags |
| `routers/collab.py` | comments, soundbites, bookmarks |
| `routers/export.py` | the download |
| `routers/chat.py` | Ask Sidenote, per meeting and for all meetings |
| `routers/llm.py` | which AI models are configured; the AI call log |
| `routers/people.py` | people list and profile |
| `routers/me.py` | who is logged in |

### Data and scripts

| File | What it is |
|---|---|
| `app/seed_data.py` | The six sample meetings as plain data (dialogue, notes, tasks, tags). |
| `app/seed.py` | Turns that data into rows, once, if the database is empty. Also `layout()`, which gives every line its start and end second, and is reused by the audio script. |
| `scripts/make_sample_audio.py` | Reads the same data and produces the recordings. See [GENERATED.md](GENERATED.md). |
| `media/*.mp3` | The recordings. |

## Part 3: the frontend, in reading order

### Foundations

| File | What it is |
|---|---|
| `lib/api.ts` | **The only place that calls `fetch`.** Adds the backend address, turns error bodies into one readable sentence, turns "network down" into "Cannot reach the server". |
| `lib/types.ts` | TypeScript shapes of what the API returns (mirrors `schemas.py`). |
| `lib/hooks.ts` | `useFetch` (load a path, keep old data while reloading), `useDebounced` (wait until typing stops), `useHotkey`, `useLocalStorage`, `useDismiss` (close a popup on outside click or Escape). |
| `lib/format.ts` | Dates, times, durations, initials. Treats server times as UTC. |
| `app/globals.css` | The colour variables (light and dark) and the shared classes (`.btn`, `.card`, `.chip`...). |
| `app/layout.tsx` | The root: font, the script that applies the saved theme before first paint, and the three providers (theme, toasts, search). |

### The player and transcript (the heart)

| File | What it is |
|---|---|
| `lib/usePlayer.ts` | One clock. Drives a real `Audio` element when there is a recording, or a timer when there is not. |
| `lib/transcript.ts` | Which line is being spoken now; which words to highlight; when to show a speaker's name. |
| `components/TranscriptPanel.tsx` | The lines, click to jump, follow-the-speaker scrolling, find-in-transcript. |
| `components/PlayerBar.tsx` | Seek bar, time, speed, skip, play. |
| `app/view/[id]/page.tsx` | The meeting page: owns the data (meeting, transcript, tasks, insights, bookmarks), the player, and the layout. |

### Notes, tasks and the side panels

`components/NotesPanel.tsx` · `ActionItems.tsx` · `SmartSearch.tsx` · `panels/CommentsPanel.tsx` · `panels/SoundbitesPanel.tsx` · `panels/BookmarksPanel.tsx` · `lib/useTicks.ts` (instant tick, reverted if the save fails) · `lib/notes.ts` (grouping tasks by person).

### The library and everything around it

| File | What it is |
|---|---|
| `app/(app)/meetings/page.tsx` | The library: groups by day, filters, search, sort. |
| `lib/meetingFilters.ts` | The filter rules turned into a query string, including "today" in the visitor's own timezone. |
| `components/FilterPopover.tsx`, `ChannelList.tsx`, `MeetingCard.tsx` | The pieces of the library. |
| `components/NewMeetingModal.tsx`, `EditMeetingModal.tsx`, `ConfirmDelete.tsx`, `MeetingMenu.tsx`, `CaptureMenu.tsx`, `ShareModal.tsx`, `ExportModal.tsx` | Create, edit, delete, share, download. |
| `components/Modal.tsx` | One dialog built on the browser's native `<dialog>`. |
| `components/AskPanel.tsx`, `lib/answer.ts` | The chat and the parsing of `[01:23]` citations. |
| `components/SearchProvider.tsx`, `CommandPalette.tsx` | The Cmd+K search. |
| `app/(app)/page.tsx`, `tasks/`, `people/`, `ask/`, `app/settings/`, `NotificationsMenu.tsx` | Home, Tasks, People, Ask, Settings, the bell. |
| `components/Sidebar.tsx`, `Topbar.tsx`, `nav.ts`, `Toast.tsx`, `ThemeProvider.tsx`, `ComingSoon.tsx`, `Logo.tsx` | The shell. |

## Part 4: three requests followed end to end

### A. Uploading a transcript (`POST /api/meetings`)

1. **Browser.** `NewMeetingForm.submit` (in `NewMeetingModal.tsx`) builds a `FormData` with the title and the file or text, and calls `api("/api/meetings", { method: "POST", body })`. `lib/api.ts` prepends the backend address and calls `fetch`. Because a file is sent, the browser uses `multipart/form-data`, which the browser sends **without** a preflight check.
2. **uvicorn** receives the bytes and gives them to the FastAPI app. The **CORS middleware** adds `Access-Control-Allow-Origin` to the eventual response if the caller's website is allowed.
3. **FastAPI** matches the path to `create_meeting`. Before calling it, FastAPI resolves its parameters: `BackgroundTasks`; the form fields (`python-multipart` parses them); a database session from `get_db`; the current user from `current_user`.
4. **`create_meeting`** (`routers/meetings.py`):
   - `registry.resolve(...)` checks the chosen AI provider is configured; if not, a 400 before anything is saved.
   - reads at most 2 MB + 1 byte of the file; one byte over means 413.
   - `parser.parse(text, filename)` returns a list of `Line(speaker, start, end, text)`; bad input raises `ValueError`, which becomes a 400 with a readable message.
   - `create_from_lines(...)` inserts the meeting with `status="processing"`, `flush()`es so the meeting has an id, then for each line finds or creates the speaker's seat and inserts a `Segment`. The **insert trigger** adds each line to the search index. `commit()` saves it all.
   - `background.add_task(ai.process_meeting, ...)` queues the notes job.
   - returns `meeting_out(meeting)`, which Pydantic turns into JSON with status 201.
5. **After the response is sent**, Starlette runs the queued job: `process_meeting` opens its **own** session, calls `generate_notes` → `ai.call` (provider or built-in) → `apply_notes` (writes summary, sections, bullets, tasks, tags) → sets `status="ready"`.
6. **Browser again.** `router.push("/view/7")` opens the meeting. The page's `useFetch` loads it, sees `processing`, and a 2-second timer calls `reload()` until it says `ready`. Then `NotesPanel` mounts and fetches the summary.

### B. Clicking a transcript line

1. `TranscriptPanel` line button `onClick` → `player.seek(l.start_sec)` and `setFollow(true)`.
2. `seek` (in `usePlayer.ts`) clamps the time into `[0, duration]`, sets `audio.currentTime`, updates `clock.current` and `time`.
3. React re-renders. `activeIndex(lines, player.time)` (a binary search) gives the line index; that line gets `aria-current` and the highlight class.
4. While playing, the browser fires `timeupdate` about four times a second; each one runs `setTime`, so the highlight moves on its own, and an effect scrolls the new line into view.

### C. Typing in the find box

1. `onChange` → `setFind`. `useDebounced` waits 250 ms after the last keystroke; clearing the box skips the wait.
2. `useFetch` requests `/api/meetings/{id}/transcript?q=budget`.
3. **Backend** `read_transcript` calls `segment_hits(db, q, meeting.id)`: `fts_query("budget")` gives `"budget"*`; one SQL query joins `segments` to the FTS index with `MATCH`; the result is the set of matching ids; each returned line carries `match: true/false`.
4. The panel keeps the lines it already has and highlights those flagged `match`, shows "1 of 2", and scrolls to the first.

## Part 5: the trickiest pieces, line by line

### 5.1 `db.py`: foreign keys and the search index

```python
@event.listens_for(Engine, "connect")
def enable_foreign_keys(dbapi_connection, _):
    dbapi_connection.execute("PRAGMA foreign_keys = ON")
```
SQLite **ignores foreign keys by default**, including `ON DELETE CASCADE`. `event.listens_for(Engine, "connect")` runs this function every time SQLAlchemy opens a new database connection. Without it, deleting a meeting would leave its transcript behind.

```python
"CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5("
"text, content='segments', content_rowid='id', tokenize='porter unicode61')"
```
A **virtual table** is a special table that SQLite maintains itself. `fts5` = the full-text-search engine. `text` = the one column indexed. `content='segments', content_rowid='id'` = **external content**: the index does not store the text again, it just points at rows in `segments` by `id`. `tokenize='porter unicode61'` = split text into words (unicode-aware, case-folded), then reduce each word to its stem (`launching` becomes `launch`).

```sql
CREATE TRIGGER segments_ai AFTER INSERT ON segments BEGIN
  INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text); END
```
A **trigger** runs inside the database whenever a row is inserted. `new` is the row just inserted. This line adds it to the index. The **delete** trigger removes it using the special `'delete'` command (an external-content index must be told the old text to forget); the **update** trigger does a delete then an insert. Because the database does this itself, no Python code can forget.

```python
"INSERT INTO segments_fts(segments_fts) VALUES ('rebuild')"
```
Re-reads every row in `segments` and rebuilds the index. It runs after table creation so a database that existed before the triggers still gets indexed.

```python
@event.listens_for(Base.metadata, "after_create")
def create_fts(target, connection, **kw): ...
```
Runs those statements right after SQLAlchemy creates the normal tables (`create_all`). `before_drop` removes the index so tests that drop and recreate tables do not keep stale index data.

### 5.2 `services/search.py`

```python
def fts_query(q):
    words = re.findall(r"\w+", q)
    if not words: return None
    return " ".join(f'"{w}"' for w in words) + "*"
```
FTS5 has its own query language (`AND`, `OR`, `NEAR`, quotes, `*`, `-`). Passing raw user text would let `AND` or an unbalanced quote cause a **syntax error**. `\w+` extracts only letters, digits and underscore; wrapping each word in quotes makes it a literal; the final `*` makes the **last** word a prefix (so `launc` finds `launch`: search as you type). `"quick" "overview"*` means both words must appear.

```python
sql = "SELECT s.id FROM segments s JOIN segments_fts ON segments_fts.rowid = s.id WHERE segments_fts MATCH :q"
```
`JOIN ... ON rowid = s.id` connects index hits to real rows. `WHERE segments_fts MATCH :q` is how you query a full-text table; `:q` is a **bound parameter** (never pasted into the SQL text, so no SQL injection).

`top_segments` (used by Ask Sidenote) joins words with `OR` and sorts by `bm25(segments_fts)`, SQLite's relevance score (lower is better), then `LIMIT`. A question has many words and a line rarely contains all of them, so `OR` plus ranking finds the best lines.

`title_or_person_clause` uses `icontains(q, autoescape=True)`: case-insensitive "contains", and `autoescape` escapes `%` and `_` so typing `%` searches for a percent sign instead of matching everything.

### 5.3 `services/parser.py`

`parse(content, filename)` decides the format in a fixed order:
1. strip a BOM and normalise Windows line endings;
2. if the name ends in `.json` **or** the text starts with `[` or `{`, **try** `json.loads`. If it fails and the name is not `.json`, carry on, because a text line like `[00:01] Ana: hi` starts with `[` but is not JSON;
3. else WebVTT if it ends in `.vtt` or starts with `WEBVTT`;
4. else plain text.

Each format returns tuples `(speaker, start|None, end|None, text)`. **`finish`** then fills gaps: a missing start is "after the previous line plus a pause"; a missing end is start plus words ÷ 2.8 per second (at least 1 s); and a line's end is capped at the next line's start, so lines never overlap. `TIME = (?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?` reads `1:23`, `01:23.5`, `1:02:03` and VTT's `00:00:01.000`.

### 5.4 `services/ai.py`: `parse_summary`, `call`, `apply_notes`

```python
start, end = raw.find("{"), raw.rfind("}")
data = json.loads(raw[start:end + 1])
```
Models often wrap JSON in ```` ```json ```` fences or add chatter. Cutting from the first `{` to the last `}` keeps just the object. Inner helper `line(v)` returns the line number only if it is a real index, else `None` (models invent numbers). `text(v)` rejects empty strings. Lists are cut (`[:8]`, `[:20]`) so a runaway reply cannot flood the database. Any mistake raises, which is the signal to fall back.

```python
def call(db, meeting_id, task, provider, model, run_llm, run_mock):
    started = time.perf_counter()
    if provider.name == "mock": result = run_mock()
    else:
        try: result = run_llm()
        except Exception as e: result, status, error = run_mock(), "fallback", ...
    db.add(AiRun(...)); db.commit()
```
`run_llm` and `run_mock` are **functions passed in**, so one wrapper serves both notes and chat. Catching *every* exception is deliberate: network down, 401 from a bad key, unparseable reply, all end the same way (the built-in logic answers, and the row in `ai_runs` says `fallback` with the reason). `perf_counter` times the call for the log.

`apply_notes` replaces summary and sections wholesale (`meeting.sections = [...]`; SQLAlchemy deletes the old rows because of the `delete-orphan` cascade) but **keeps existing tasks**: it builds a set of existing task texts (`casefold` = case-insensitive) and only adds new ones, so ticked tasks survive "Regenerate". Tags are suggested only if the meeting has none.

### 5.5 `services/llm/registry.py`

`all_providers()` builds the list from environment variables **on every call** (not at import), so setting a key takes effect without a restart. Each provider has `enabled` = "its key is set" (Ollama: "its URL is set"). `default_name()` returns `LLM_PROVIDER` only if that provider is enabled, else the first enabled real provider, else `mock`: a typo in the setting is logged and skipped, never fatal. `resolve(name, model)` returns the provider object and the model: explicit request wins; otherwise `LLM_MODEL` if it belongs to the default provider; otherwise the provider's first model. Asking for an unavailable provider by name raises `ProviderUnavailable`, which the routers turn into a 400.

### 5.6 `services/insights.py`

For each line it adds to a per-seat total: `talk[seat] = [seconds, words]`. Share = that seat's seconds ÷ all seconds. **WPM = words ÷ (seconds ÷ 60)**. Sentiment is a count per label divided by the total. The "questions / numbers / dates" lists are lists of line ids picked by `"?" in text` and two regular expressions (`\b...\b` makes `friday` match but not `Fridays` inside another word, and `sunday` not `sundial`). Nothing is stored.

### 5.7 `routers/meetings.py`: the list filter

`list_meetings` starts with `select(Meeting)` and **adds a `WHERE` for each filter that was given**. `Meeting.id.in_(select(MeetingParticipant.meeting_id).where(...))` is a **subquery**: "meetings whose id appears in the list of meetings that have this person". `Meeting.topics.any(Topic.name.in_(f.topic))` is "has at least one tag in this list". `after`/`before` compare exact UTC times (see `schemas.to_utc_naive`). Finally `order_by` newest or oldest. Each `if` is independent, so any combination works.

`update_meeting` (people): it computes the wanted set of names, **deletes seats not in it**, `flush()`es, refreshes the relationship, then adds seats for new names; finally `prune_orphan_people` removes anyone now in no meeting (except the logged-in person).

### 5.8 `lib/usePlayer.ts`

- Three **refs** hold values that must survive renders without causing one: `clock` (the current time in seconds), `speedRef`, `stopAt` (end of a soundbite). State (`time`, `playing`, `speed`) is what the UI shows.
- **Effect 1** (runs when `mediaUrl` changes): creates `new Audio(url)` and listens to its events. `timeupdate` (the browser fires it about four times a second) sets `clock.current` and `time`, and if a range is playing and its end is reached, pauses. `play` / `pause` / `ended` keep `playing` truthful because the browser can pause by itself (autoplay refusal, end of file). The cleanup function pauses and releases the file when the page closes.
- **Effect 2**: only when there is **no** recording and it is playing: `setInterval` every 100 ms adds `0.1 × speed` seconds, stops at the end or at `stopAt`. The cleanup `clearInterval` prevents a runaway timer.
- `seek` clamps the target, cancels any range (`stopAt = null`: moving by hand ends a soundbite), sets the audio time, and updates state. `skip(d)` is `seek(clock.current + d)`, which is why `clock.current` **must** follow the audio (a bug here once made skip jump from the last seek; there is a test for it).
- `play` starts over if the time is at the end; `audio.play()` returns a promise that **rejects** if the browser blocks autoplay, so a `.catch` keeps the UI honest. `playRange` seeks, *then* sets `stopAt` (seek clears it), then plays.

### 5.9 `lib/hooks.ts`: `useFetch`

State holds `settled = { key, data, error }` for the **last finished** request. `key` is `path#tick`; `tick` increases when `reload()` is called. `loading` is not stored: it is **derived**: "there is a request key, and the settled one is not it". So when the path changes, `data` still holds the previous answer (the list stays on screen, dimmed) while `loading` is true. The effect has a local `current` flag set to `false` in its cleanup: if the path changes before an answer arrives, the late answer is **ignored** (otherwise a slow old request could overwrite a newer one). An error keeps the old data and sets `error`, which clears on the next success.

### 5.10 `lib/useTicks.ts`

`ticks[id] = { value, list }` remembers the tick **and the exact array it was made on**. `isDone(item)` uses the tick only while `ticks[id].list === items` (same array object). The moment the list is reloaded, `items` is a new array, so the tick is ignored and the server's answer shows, with no clean-up code and no way for a stale tick to return. If the save fails, `toggle` deletes the tick, reverting the box.

### 5.11 `lib/transcript.ts`: `activeIndex` and `highlightPieces`

`activeIndex` is a binary search: `lo`/`hi` bracket the candidates; if the middle line has started (`start_sec <= time`) it is a candidate and we look right, else left; it returns the last candidate, or -1 before the first line. O(log n) per render. `highlightPieces` builds one regular expression from the query words (each **escaped**, so `(`, `*`, `[` are plain characters), `\b` + word + `\w*` so a word *starting* with the query matches (`launch` marks `Launching`), and cuts the text into `{text, hit}` pieces that React renders as plain text or `<mark>`.

### 5.12 `lib/meetingFilters.ts`: "today" in the visitor's timezone

The database stores UTC. If the browser sent the *date* "2026-10-07", the server could not know whether that means Oct 7 in London or in Los Angeles. So the **browser computes the day's start and end** in its own timezone (`localDayBounds` → `new Date(y, m, d)` is local midnight) and sends them as exact instants (`.toISOString()` gives UTC). The server just compares `started_at >= after AND started_at < before`. Daylight-saving days (23 or 25 hours long) work because the end is "midnight of the next date", not "start + 24 h" (there is a test for both).

## Part 6: how to explain any file in 30 seconds

1. What problem does it solve? (the first line of its comment or docstring)
2. What goes in and what comes out? (look at the function signatures)
3. What does it depend on? (the imports at the top)
4. Which test pins it down? (same name in `tests/`)

If you can answer those four, you can explain the file. If a question goes deeper, the tests are the best documentation: each test name is a sentence describing one behaviour.
