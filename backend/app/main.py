import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import Base, SessionLocal, engine
from .routers import action_items, chat, collab, export, llm, me, meetings, notes, people, search, topics, transcript
from .seed import MEDIA_DIR, seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Sidenote API", lifespan=lifespan)

def cors_settings() -> dict:
    """Which websites may call this API from a browser.
    CORS_ORIGINS: exact addresses, comma separated. CORS_ORIGIN_REGEX: a pattern, e.g. every Vercel preview address."""
    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
    return {"allow_origins": origins, "allow_origin_regex": os.getenv("CORS_ORIGIN_REGEX") or None}


@app.middleware("http")
async def turn_crashes_into_json(request, call_next):
    """An unhandled error would escape past the CORS layer and reach the browser without CORS headers,
    which it reports as 'cannot reach the server'. Catching it here keeps the real reason visible."""
    try:
        return await call_next(request)
    except Exception:
        logging.getLogger("app").exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on the server"}, status_code=500)


# added last, so it wraps everything above and every response, errors included, carries CORS headers
app.add_middleware(CORSMiddleware, allow_methods=["*"], allow_headers=["*"], **cors_settings())


app.mount("/media", StaticFiles(directory=MEDIA_DIR, check_dir=False), name="media")  # sample recordings
app.include_router(meetings.router)
app.include_router(transcript.router)
app.include_router(search.router)
app.include_router(notes.router)
app.include_router(action_items.router)
app.include_router(topics.router)
app.include_router(llm.router)
app.include_router(collab.router)
app.include_router(export.router)
app.include_router(chat.router)
app.include_router(people.router)
app.include_router(me.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
