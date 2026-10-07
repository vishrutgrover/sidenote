import os

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sidenote.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


@event.listens_for(Engine, "connect")
def enable_foreign_keys(dbapi_connection, _):
    # SQLite ignores foreign keys (and ON DELETE CASCADE) unless asked
    dbapi_connection.execute("PRAGMA foreign_keys = ON")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Full-text index over transcript lines. Triggers keep it in step with the segments table,
# so no application code ever has to remember to update it.
FTS_SQL = [
    "CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5("
    "text, content='segments', content_rowid='id', tokenize='porter unicode61')",
    "CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN "
    "INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text); END",
    "CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN "
    "INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text); END",
    "CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN "
    "INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text); "
    "INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text); END",
    "INSERT INTO segments_fts(segments_fts) VALUES ('rebuild')",  # also indexes rows that predate the triggers
]


@event.listens_for(Base.metadata, "after_create")
def create_fts(target, connection, **kw):
    for sql in FTS_SQL:
        connection.exec_driver_sql(sql)


@event.listens_for(Base.metadata, "before_drop")
def drop_fts(target, connection, **kw):
    connection.exec_driver_sql("DROP TABLE IF EXISTS segments_fts")
