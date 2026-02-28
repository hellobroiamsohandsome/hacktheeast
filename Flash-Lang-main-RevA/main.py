"""
ReadFluent - FastAPI backend and dashboard.
Turn the content you consume into a personalized, privacy-first language immersion engine.
Workflow: extension (highlighted text + URL) -> backend -> MiniMax -> Neon DB (vocabulary flashcards, practice sessions).
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Any, Tuple
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from bs4 import BeautifulSoup
import re
import os
import json
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader

try:
    from db import init_db, save_lesson
except ImportError:
    init_db = lambda: None
    save_lesson = lambda **kw: None

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="ReadFluent", description="Language immersion from your own content")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files if directory exists
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


class LessonRequest(BaseModel):
    url: str
    type: str = "youtube"  # youtube | article
    cefrLevel: str = "B2"
    isChildMode: bool = False
    highlightedText: Optional[str] = None  # from browser extension
    targetLanguage: str = "en"   # user's learning language (display both this + source)
    sourceLanguage: str = "en"   # video/content language (use "auto" to detect from content)


def _parse_minimax_json(content_string: str) -> dict:
    """Parse JSON from MiniMax response; attempt repair if truncated (2048 token limit)."""
    try:
        return json.loads(content_string)
    except json.JSONDecodeError:
        pass
    s = content_string.rstrip()
    # Truncated: find last complete transcript item (object ending with "}, )
    idx = s.rfind('"}, ')
    if idx > 100:
        repaired = s[: idx + 1] + "}, ], \"flashcards\": [] }"
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass
    # Fallback: close open brackets/braces by count
    open_brackets = max(0, s.count("[") - s.count("]"))
    open_braces = max(0, s.count("{") - s.count("}"))
    try:
        out = json.loads(s + "]" * open_brackets + "}" * open_braces)
        if isinstance(out, dict) and "flashcards" not in out:
            out["flashcards"] = []
        return out
    except json.JSONDecodeError:
        raise json.JSONDecodeError("Could not parse or repair JSON", content_string, 0)

def _normalize_url(url: str) -> str:
    """Extract a clean URL or video ID from input (handles iframe HTML from extension)."""
    url = (url or "").strip()
    if "<iframe" in url.lower() and "src=" in url:
        src_match = re.search(r'src=["\']([^"\']+)["\']', url, re.IGNORECASE)
        if src_match:
            url = src_match.group(1).strip()
    return url


def _sec_to_timestamp(sec: float) -> str:
    m = int(sec // 60)
    s = int(sec % 60)
    return f"{m}:{s:02d}"


def extract_content(url: str, content_type: str) -> Tuple[str, Optional[List[dict]]]:
    """Returns (full_text, yt_segments or None). yt_segments = [{"text", "start"}] for merging timestamps."""
    url = _normalize_url(url)
    print(f"[EXTRACTION] Starting extraction for URL: {url[:120]}...")
    try:
        if "youtube.com" in url or "youtu.be" in url:
            video_id_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
            if not video_id_match:
                raise ValueError("Could not find YouTube Video ID")
            video_id = video_id_match.group(1)
            print(f"[EXTRACTION] Found Video ID: {video_id}. Fetching transcript...")
            transcript = YouTubeTranscriptApi().fetch(video_id)
            segments = [{"text": s.text, "start": s.start} for s in transcript]
            full_text = " ".join(s["text"] for s in segments)
            print(f"[EXTRACTION] Success! Extracted {len(full_text)} chars, {len(segments)} timestamped segments.")
            # No truncation here so full transcript is available; we'll chunk for MiniMax
            return full_text, segments
        else:
            print("[EXTRACTION] Attempting to scrape article...")
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            paragraphs = soup.find_all("p")
            full_text = " ".join([p.get_text() for p in paragraphs])
            print(f"[EXTRACTION] Success! Extracted {len(full_text)} characters.")
            return full_text[:20000], None
    except Exception as e:
        print(f"[EXTRACTION ERROR] Failed to extract content: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Extraction failed: {str(e)}")


def _call_minimax(prompt: str, api_key: str, endpoint: str, model: str) -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": 2048,
    }
    response = requests.post(endpoint, headers=headers, json=payload, timeout=90)
    if not response.ok:
        try:
            err = response.json()
            msg = err.get("base_resp", {}).get("status_msg") or err.get("detail") or response.text
        except Exception:
            msg = response.text
        raise HTTPException(status_code=502, detail=f"MiniMax API error: {msg}")
    data = response.json()
    choices = data.get("choices") or []
    if not choices or not choices[0].get("message", {}).get("content"):
        raise HTTPException(status_code=502, detail="MiniMax returned empty response")
    return choices[0]["message"]["content"].strip()


@app.post("/process-content")
def process_content(request: LessonRequest):
    url = _normalize_url(request.url)
    raw_text, yt_segments = extract_content(url, request.type)

    if not raw_text:
        raise HTTPException(status_code=400, detail="Extracted text was empty.")

    # Optional highlighted text from extension: merge into content for vocabulary focus
    if request.highlightedText and request.highlightedText.strip():
        raw_text = f"[Highlighted by user]: {request.highlightedText.strip()}\n\n[Full content]:\n{raw_text}"

    # Use more of the transcript (no 1‑minute cap); chunk for API if very long
    text_for_llm = raw_text[:20000] if len(raw_text) > 20000 else raw_text
    print(f"[MINIMAX] Preparing to send {len(text_for_llm)} characters to MiniMax...")

    child_mode_instruction = ""
    if request.isChildMode:
        child_mode_instruction = (
            "Child Mode is TRUE: you MUST aggressively filter out any explicit, violent, or mature themes "
            "and replace them with safe, educational analogies. Use only family-friendly language."
        )

    source_lang = request.sourceLanguage if request.sourceLanguage != "auto" else "the original language of the content"
    target_lang = request.targetLanguage

    prompt = f"""You are a language-learning assistant. Output ONLY a single JSON object (no other text).

Task: Adapt the transcript below to CEFR {request.cefrLevel}. {child_mode_instruction}

Languages:
- SOURCE (video/content) language: {source_lang}. Keep "translatedText" in this language (original meaning).
- TARGET (user's learning) language: {target_lang}. Write "text" in this language, adapted to CEFR {request.cefrLevel}.

Output limits: up to 20 transcript segments (one short sentence each), up to 12 flashcards. Keep each "text" and "translatedText" under 25 words so the full JSON fits.

JSON structure (output this only):
{{"title": "string", "detectedTopics": ["topic1", "topic2"], "transcript": [{{"id": "1", "timestamp": "0:00", "text": "sentence in {target_lang}", "translatedText": "sentence in {source_lang}"}}], "flashcards": [{{"word": "word", "context": "sentence", "definition": "def"}}]}}

TRANSCRIPT TO ADAPT:
---
{text_for_llm[:12000]}
---
Output the JSON object only:"""

    api_key = (os.getenv("MINIMAX_API_KEY") or "").strip()
    endpoint = (os.getenv("MINIMAX_LLM_ENDPOINT") or "https://api.minimax.io/v1").strip().rstrip("/")
    if "/text/" not in endpoint:
        endpoint = f"{endpoint}/text/chatcompletion_v2"
    model = os.getenv("MINIMAX_MODEL", "M2-her")
    if not api_key:
        print("[MINIMAX ERROR] MINIMAX_API_KEY is missing or empty in .env!")
        raise HTTPException(status_code=500, detail="Server missing API Key")

    try:
        content_string = _call_minimax(prompt, api_key, endpoint, model)

        content_string = re.sub(r"^```(?:json)?\s*", "", content_string, flags=re.IGNORECASE)
        content_string = re.sub(r"\s*```$", "", content_string, flags=re.IGNORECASE)
        json_start = content_string.find("{")
        if json_start >= 0:
            depth = 0
            for i in range(json_start, len(content_string)):
                if content_string[i] == "{":
                    depth += 1
                elif content_string[i] == "}":
                    depth -= 1
                    if depth == 0:
                        content_string = content_string[json_start : i + 1]
                        break

        parsed_json = _parse_minimax_json(content_string)
        transcript = parsed_json.get("transcript") or []

        # Merge real timestamps from YouTube (full length, not 1‑minute cap)
        if yt_segments and transcript:
            for i, seg in enumerate(transcript):
                if i < len(yt_segments):
                    seg["timestamp"] = _sec_to_timestamp(yt_segments[i]["start"])

        practice_session_url = url
        parsed_json["mediaUrl"] = url
        parsed_json["dataSource"] = "live"
        parsed_json["practiceSessionUrl"] = practice_session_url
        parsed_json["sourceLanguage"] = request.sourceLanguage
        parsed_json["targetLanguage"] = request.targetLanguage
        parsed_json["vocabularyFlashcards"] = parsed_json.get("flashcards") or []
        parsed_json["practiceSessions"] = [
            {"type": "vocabulary", "url": practice_session_url},
            {"type": "shadowing", "url": practice_session_url},
        ]

        init_db()
        lesson_id = save_lesson(
            url=url,
            title=parsed_json.get("title") or "Lesson",
            source_language=request.sourceLanguage,
            target_language=request.targetLanguage,
            cefr_level=request.cefrLevel,
            transcript=transcript,
            flashcards=parsed_json.get("flashcards") or [],
            practice_session_url=practice_session_url,
            detected_topics=parsed_json.get("detectedTopics"),
            highlighted_text=request.highlightedText,
        )
        if lesson_id:
            parsed_json["lessonId"] = lesson_id

        print("[SUCCESS] Returning parsed JSON to frontend!")
        return parsed_json

    except json.JSONDecodeError as e:
        print(f"[MINIMAX ERROR] JSON parse failed: {e}. Content: {content_string[:500]}")
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[MINIMAX ERROR] {type(e).__name__}: {str(e)}")
        if "response" in locals():
            print(f"[MINIMAX DEBUG] response.text: {response.text[:600]}")
        raise HTTPException(status_code=500, detail=f"AI Processing failed: {str(e)}")


@app.get("/health")
def health():
    """For deployment health checks."""
    return {"status": "ok", "app": "ReadFluent"}


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    """Serve the ReadFluent dashboard (no Next.js)."""
    if not TEMPLATES_DIR.exists():
        raise HTTPException(status_code=500, detail="Templates directory missing")
    template = env.get_template("index.html")
    return HTMLResponse(template.render())
