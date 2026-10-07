import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, SessionLocal, engine
from .routers import action_items, chat, collab, export, llm, me, meetings, notes, people, search, topics, transcript
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Sidenote API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


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
