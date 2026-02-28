"""
ReadFluent — Neon Postgres: lessons, vocabulary flashcards, practice sessions.
"""
import os
import json
from contextlib import contextmanager
from typing import Optional, List, Any

try:
    import psycopg2
    from psycopg2.extras import Json
    HAS_PG = True
except ImportError:
    HAS_PG = False


def _conn():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgres://", 1)
    try:
        return psycopg2.connect(url)
    except Exception as e:
        print(f"[DB] Connection failed: {e}")
        return None


@contextmanager
def get_cursor():
    conn = _conn()
    if not conn:
        yield None
        return
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[DB] Error: {e}")
        raise
    finally:
        if conn:
            cur.close()
            conn.close()


def init_db():
    """Create tables if they don't exist."""
    if not HAS_PG:
        return
    with get_cursor() as cur:
        if not cur:
            return
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lessons (
                id SERIAL PRIMARY KEY,
                url TEXT NOT NULL,
                highlighted_text TEXT,
                title TEXT,
                source_language VARCHAR(10),
                target_language VARCHAR(10),
                cefr_level VARCHAR(5),
                transcript JSONB,
                flashcards JSONB,
                practice_session_url TEXT,
                detected_topics JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary_flashcards (
                id SERIAL PRIMARY KEY,
                lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
                word TEXT,
                context TEXT,
                definition TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS practice_sessions (
                id SERIAL PRIMARY KEY,
                lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
                session_type VARCHAR(50),
                url TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)


def save_lesson(
    url: str,
    title: str,
    source_language: str,
    target_language: str,
    cefr_level: str,
    transcript: List[Any],
    flashcards: List[Any],
    practice_session_url: str,
    detected_topics: Optional[List[str]] = None,
    highlighted_text: Optional[str] = None,
) -> Optional[int]:
    """Save lesson and related flashcards/practice session. Returns lesson_id or None."""
    if not HAS_PG:
        return None
    init_db()
    with get_cursor() as cur:
        if not cur:
            return None
        cur.execute(
            """
            INSERT INTO lessons (url, highlighted_text, title, source_language, target_language,
                cefr_level, transcript, flashcards, practice_session_url, detected_topics)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                url,
                highlighted_text or None,
                title,
                source_language,
                target_language,
                cefr_level,
                Json(transcript or []),
                Json(flashcards or []),
                practice_session_url or url,
                Json(detected_topics or []),
            ),
        )
        row = cur.fetchone()
        lesson_id = row[0] if row else None
        if lesson_id and flashcards:
            for card in flashcards:
                if isinstance(card, dict):
                    cur.execute(
                        """
                        INSERT INTO vocabulary_flashcards (lesson_id, word, context, definition)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            lesson_id,
                            card.get("word"),
                            card.get("context"),
                            card.get("definition"),
                        ),
                    )
            cur.execute(
                """
                INSERT INTO practice_sessions (lesson_id, session_type, url)
                VALUES (%s, 'vocabulary', %s), (%s, 'shadowing', %s)
                """,
                (lesson_id, practice_session_url or url, lesson_id, practice_session_url or url),
            )
        return lesson_id
