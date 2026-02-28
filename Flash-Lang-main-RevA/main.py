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
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import re
from youtube_transcript_api import YouTubeTranscriptApi
from bs4 import BeautifulSoup
from urllib.parse import quote
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


class GenerateByLevelRequest(BaseModel):
    cefrLevel: str = "B2"
    targetLanguage: str = "en"
    sourceLanguage: str = "en"
    topic: Optional[str] = None
    isChildMode: bool = False


class TranslateRequest(BaseModel):
    text: str
    targetLang: str
    sourceLang: str = "ja"


class RefreshQuizRequest(BaseModel):
    title: str = "Lesson"
    transcript: List[dict] = []
    cefrLevel: str = "B2"
    targetLanguage: str = "en"
    sourceLanguage: str = "en"
    isChildMode: bool = False


def _parse_minimax_json(content_string: str) -> dict:
    """Parse JSON from MiniMax response; attempt repair if truncated (2048 token limit)."""
    try:
        return json.loads(content_string)
    except json.JSONDecodeError:
        pass
    
    s = content_string.rstrip()
    
    # Try to find and extract just the JSON portion if there's markdown wrapping
    if s.startswith("```"):
        # Strip markdown code blocks
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```$", "", s, flags=re.IGNORECASE)
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
    
    # Truncated: find the last complete transcript item
    for pattern in ['"}, ]', '"}, ']:
        idx = s.rfind(pattern)
        if idx > 100:
            repaired = s[: idx + 1] + "] }"
            try:
                parsed = json.loads(repaired)
                if "transcript" in parsed:
                    return parsed
            except json.JSONDecodeError:
                pass
    
    # Try finding last complete object in transcript array
    transcript_matches = list(re.finditer(r'\{"id":\s*"\d+",\s*"timestamp"', s))
    if transcript_matches:
        last_match = transcript_matches[-1]
        search_start = last_match.end()
        depth = 1
        end_pos = -1
        for i in range(search_start, len(s)):
            if s[i] == '{':
                depth += 1
            elif s[i] == '}':
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break
        
        if end_pos > 0:
            repaired = s[: end_pos + 1] + "] }"
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


def _extract_json_candidate(text: str) -> str:
    """Extract the most likely JSON object from mixed model output."""
    s = (text or "").strip()
    if not s:
        return ""
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s, flags=re.IGNORECASE)
    first = s.find("{")
    last = s.rfind("}")
    if first >= 0 and last > first:
        return s[first : last + 1]
    return s


def _simple_fallback_lesson(raw_text: str, yt_segments: Optional[List[dict]], request: LessonRequest, url: str) -> dict:
    """Guaranteed valid JSON lesson if model output is unusable."""
    title = "ReadFluent Lesson"
    topics = ["general"]
    transcript = []
    if yt_segments:
        for i, seg in enumerate(yt_segments[:20]):
            transcript.append(
                {
                    "id": str(i + 1),
                    "timestamp": _sec_to_timestamp(seg.get("start", 0)),
                    "text": (seg.get("text") or "")[:180],
                    "translatedText": "",
                }
            )
    else:
        sentences = [s.strip() for s in re.split(r"[.!?]\s+", raw_text) if s.strip()]
        for i, s in enumerate(sentences[:20]):
            transcript.append(
                {
                    "id": str(i + 1),
                    "timestamp": f"0:{(i*8)%60:02d}",
                    "text": s[:180],
                    "translatedText": "",
                }
            )

    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", raw_text or "")
    seen = set()
    flashcards = []
    for w in words:
        wl = w.lower()
        if wl in seen:
            continue
        seen.add(wl)
        flashcards.append(
            {
                "word": w,
                "context": f"{w} appears in the lesson content.",
                "definition": f"Key vocabulary item at CEFR {request.cefrLevel}.",
            }
        )
        if len(flashcards) >= 12:
            break

    return {
        "title": title,
        "detectedTopics": topics,
        "transcript": transcript,
        "flashcards": flashcards,
        "mediaUrl": url,
        "dataSource": "fallback",
        "practiceSessionUrl": url,
        "sourceLanguage": request.sourceLanguage,
        "targetLanguage": request.targetLanguage,
        "vocabularyFlashcards": flashcards,
        "practiceSessions": [
            {"type": "vocabulary", "content": "Review vocabulary flashcards"},
            {"type": "shadowing", "content": "Practice speaking the transcript lines"},
            {"type": "quiz", "questions": []},
        ],
    }


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


def _call_minimax(prompt: str, api_key: str, endpoint: str, model: str, max_retries: int = 3) -> str:
    """Call MiniMax API with retry logic for rate limiting."""
    import time
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": 2048,
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=90, verify=False)
            
            if response.status_code == 429 or "rate" in response.text.lower():
                wait_time = (attempt + 1) * 2
                print(f"[MINIMAX] Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
                
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
                if attempt < max_retries - 1:
                    print(f"[MINIMAX] Empty response, retrying...")
                    time.sleep(1)
                    continue
                raise HTTPException(status_code=502, detail="MiniMax returned empty response")
            
            return choices[0]["message"]["content"].strip()
            
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                print(f"[MINIMAX] Timeout, retrying...")
                time.sleep(2)
                continue
            raise HTTPException(status_code=502, detail="MiniMax API timeout")
    
    raise HTTPException(status_code=502, detail="MiniMax API failed after retries")


@app.post("/translate")
def translate(request: TranslateRequest):
    """In-text translation endpoint using MyMemory API."""
    # If same language, return original text
    if request.sourceLang == request.targetLang:
        return {"translated": request.text}
    
    url = f"https://api.mymemory.translated.net/get?q={quote(request.text)}&langpair={request.sourceLang}|{request.targetLang}"
    response = requests.get(url, verify=False)
    data = response.json()
    translated = data.get("responseData", {}).get("translatedText", "")
    return {"translated": translated}


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

    # CEFR level descriptions for content targeting
    cefr_descriptions = {
        "A1": "Beginner - Use very simple vocabulary and short sentences (1-5 words). Basic greetings, numbers, colors, family, daily routines.",
        "A2": "Elementary - Simple sentences, basic grammar. Shopping, directions, describing people, past activities.",
        "B1": "Intermediate - Compound sentences, past and future tenses. Work, travel, hobbies, experiences.",
        "B2": "Upper-Intermediate - Complex sentences, nuanced expressions. Abstract topics, opinions, arguments.",
        "C1": "Advanced - Sophisticated vocabulary, idioms. Professional discussions, nuanced opinions.",
        "C2": "Mastery - Native-level expression, subtle meanings. Complex discussions, literary language."
    }
    cefr_desc = cefr_descriptions.get(request.cefrLevel, cefr_descriptions["B2"])
    
    child_mode_addendum = ""
    if request.isChildMode:
        child_mode_addendum = "CHILD MODE: Remove ALL adult themes, violence, mature language. Replace with educational, family-friendly alternatives. Keep vocabulary simple."

    prompt = f"""You are a language-learning assistant. Output ONLY a single JSON object (no other text).

Task: Create a language lesson from the transcript below.

CEFR LEVEL: {request.cefrLevel} - {cefr_desc}

{child_mode_addendum}

Languages:
- SOURCE (video/content) language: {source_lang}. Keep "translatedText" in this language.
- TARGET (user's learning) language: {target_lang}. Write "text" in this target language, adapted to CEFR {request.cefrLevel}.

OUTPUT REQUIREMENTS:
- Up to 20 transcript segments (1-2 sentences each, max 20 words per segment)
- Up to 12 vocabulary flashcards
- Generate 12 quiz questions for practice (multiple choice with 4 options each)
- Vary quiz types: vocabulary meaning, fill-in-blank, grammar choice, context inference, translation direction both ways

JSON structure (output this only):
{{"title": "string", "detectedTopics": ["topic1"], "transcript": [{{"id": "1", "timestamp": "0:00", "text": "sentence in {target_lang}", "translatedText": "sentence in {source_lang}"}}], "flashcards": [{{"word": "word", "context": "sentence", "definition": "def"}}], "quizzes": [{{"question": "question text", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "why answer is correct"}}]}}

TRANSCRIPT:
---
{text_for_llm[:10000]}
---
Output ONLY the JSON object:"""

    api_key = (os.getenv("MINIMAX_API_KEY") or "").strip()
    endpoint = (os.getenv("MINIMAX_LLM_ENDPOINT") or "https://api.minimax.io/v1").strip().rstrip("/")
    if "/text/" not in endpoint:
        endpoint = endpoint.rstrip("/") + "/text/chatcompletion_v2"
    model = os.getenv("MINIMAX_MODEL", "M2-her")
    if not api_key:
        print("[MINIMAX ERROR] MINIMAX_API_KEY is missing or empty in .env!")
        raise HTTPException(status_code=500, detail="Server missing API Key")

    try:
        content_string = _call_minimax(prompt, api_key, endpoint, model)
        candidate = _extract_json_candidate(content_string)
        try:
            parsed_json = _parse_minimax_json(candidate)
        except json.JSONDecodeError:
            # One more try: ask model to reformat the broken output into strict JSON.
            repair_prompt = f"""Convert the following into ONE valid JSON object only.
If fields are missing, keep: title, detectedTopics, transcript, flashcards.
No markdown, no prose.

{content_string}
"""
            repaired = _call_minimax(repair_prompt, api_key, endpoint, model)
            repaired_candidate = _extract_json_candidate(repaired)
            try:
                parsed_json = _parse_minimax_json(repaired_candidate)
            except json.JSONDecodeError:
                print("[MINIMAX WARN] Using deterministic fallback lesson due to invalid model JSON.")
                parsed_json = _simple_fallback_lesson(raw_text, yt_segments, request, url)
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
        # Generate practice sessions with actual quiz content
        quizzes = parsed_json.get("quizzes", [])
        parsed_json["practiceSessions"] = [
            {"type": "vocabulary", "content": "Review vocabulary flashcards"},
            {"type": "shadowing", "content": "Practice speaking the transcript lines"},
            {"type": "quiz", "questions": quizzes[:5] if quizzes else []},
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




# AWS Bedrock integration (optional)
def _call_bedrock(prompt: str, model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0") -> str:
    """Call AWS Bedrock for advanced AI features. Falls back gracefully if not configured."""
    try:
        import boto3
        aws_key = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_BEDROCK_API_KEY")
        if not aws_key:
            raise ValueError("AWS credentials not configured")
            
        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=aws_key,
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "")
        )
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            "max_tokens": 2048,
        })
        response = bedrock.invoke_model(body=body, modelId=model_id, accept="application/json", contentType="application/json")
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]
    except Exception as e:
        print(f"[BEDROCK WARNING] {e}, using fallback")
        # Return a fallback response
        return "AWS Bedrock not configured. Please set AWS credentials in .env file."


@app.post("/generate-by-level")
def generate_by_level(request: GenerateByLevelRequest):
    """Generate content based on CEFR level without requiring a URL."""
    cefr_level = request.cefrLevel
    target_lang = request.targetLanguage
    source_lang = request.sourceLanguage if request.sourceLanguage != "auto" else "en"
    
    # CEFR level content suggestions
    level_content = {
        "A1": {"topic": "greetings, numbers, colors, family, daily routines", "difficulty": "very simple"},
        "A2": {"topic": "shopping, directions, describing people, past activities", "difficulty": "simple"},
        "B1": {"topic": "work, travel, hobbies, experiences, future plans", "difficulty": "intermediate"},
        "B2": {"topic": "opinions, arguments, abstract topics, news", "difficulty": "upper intermediate"},
        "C1": {"topic": "professional discussions, nuanced opinions, culture", "difficulty": "advanced"},
        "C2": {"topic": "subtle meanings, idioms, literary language", "difficulty": "mastery"}
    }
    
    content_info = level_content.get(cefr_level, level_content["B2"])
    
    prompt = f"""Create a language learning lesson for CEFR {cefr_level} level.

Target language: {target_lang}
Source/original language: {source_lang}
Topic: {content_info['topic']}
Difficulty: {content_info['difficulty']}

Output ONLY a JSON object with:
{{
  "title": "Lesson title in {target_lang}",
  "detectedTopics": ["topic1", "topic2"],
  "article": "A short article/lesson text in {target_lang} (max 500 words)",
  "transcript": [
    {{"id": "1", "timestamp": "0:00", "text": "Sentence in {target_lang}", "translatedText": "Translation in {source_lang}"}}
  ],
  "flashcards": [
    {{"word": "word", "context": "example sentence", "definition": "definition"}}
  ],
  "quizzes": [
    {{"question": "question", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "why"}}
  ],
  "youtubeSuggestions": ["recommended YouTube video IDs for this level"]
}}

Generate content appropriate for {cefr_level} level learners:"""

    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    endpoint = os.getenv("MINIMAX_LLM_ENDPOINT", "https://api.minimax.io/v1").strip().rstrip("/")
    if "/text/" not in endpoint:
        endpoint = endpoint.rstrip("/") + "/text/chatcompletion_v2"
    model = os.getenv("MINIMAX_MODEL", "M2-her")
    
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
                        content_string = content_string[json_start:i+1]
                        break
        
        parsed = _parse_minimax_json(content_string)
        
        # Ensure transcript exists
        if "transcript" not in parsed:
            # Create transcript from article
            article = parsed.get("article", "")
            sentences = re.split(r'[.!?]+', article)
            parsed["transcript"] = [
                {"id": str(i+1), "timestamp": f"0:{i*15:02d}", "text": s.strip(), "translatedText": ""}
                for i, s in enumerate(sentences[:20]) if s.strip()
            ]
        
        parsed["cefrLevel"] = cefr_level
        parsed["type"] = "generated"
        parsed["targetLanguage"] = target_lang
        parsed["sourceLanguage"] = source_lang
        parsed["practiceSessions"] = [
            {"type": "vocabulary", "content": "Review vocabulary"},
            {"type": "reading", "content": "Read the article"},
            {"type": "quiz", "questions": parsed.get("quizzes", [])[:5]}
        ]
        
        return parsed
        
    except Exception as e:
        print(f"[GENERATE ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate content: {str(e)}")


@app.post("/tts")
def text_to_speech(request: dict):
    """Text-to-speech using AWS Bedrock."""
    text = request.get("text", "")
    language = request.get("language", "en")
    
    # Map language to voice
    voice_map = {
        "en": "amy", "es": "lucia", "fr": "celine", "de": "marlene",
        "it": "giorgio", "ja": "mizuki", "ko": "seoyeon", "zh": "zhiyu"
    }
    voice_id = request.get("voiceId", voice_map.get(language, "amy"))
    
    prompt = f"""Convert this text to natural speech: {text}"""
    
    try:
        response = _call_bedrock(
            f"Generate a text-to-speech request for: {text}. Voice: {voice_id}. Return JSON with 'audio' base64 or 'url' if you can provide a pre-generated URL.",
            "anthropic.claude-3-sonnet-20240229-v1:0"
        )
        return {"response": response, "voiceId": voice_id}
    except Exception as e:
        # Fallback: return text for browser TTS
        return {"text": text, "voiceId": voice_id, "fallback": True}


@app.post("/chat")
def ai_chat(request: dict):
    """AI chat about the lesson using AWS Bedrock."""
    message = request.get("message", "")
    lesson_context = request.get("context", "")
    
    prompt = f"""You are a friendly language learning tutor. Help the user with their question.

Lesson context: {lesson_context}

User question: {message}

Respond in a helpful, educational way:"""
    
    try:
        response = _call_bedrock(prompt)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@app.post("/refresh-quizzes")
def refresh_quizzes(request: RefreshQuizRequest):
    """Regenerate a fresh, varied quiz set for an existing lesson."""
    api_key = (os.getenv("MINIMAX_API_KEY") or "").strip()
    endpoint = (os.getenv("MINIMAX_LLM_ENDPOINT") or "https://api.minimax.io/v1").strip().rstrip("/")
    if "/text/" not in endpoint:
        endpoint = endpoint.rstrip("/") + "/text/chatcompletion_v2"
    model = os.getenv("MINIMAX_MODEL", "M2-her")
    if not api_key:
        raise HTTPException(status_code=500, detail="Server missing API Key")

    transcript_text = " ".join([(x.get("text") or "") for x in (request.transcript or [])[:30]])
    child_mode_addendum = (
        "CHILD MODE: Keep all questions family-friendly and remove mature content."
        if request.isChildMode
        else ""
    )
    prompt = f"""Create ONLY valid JSON.

Generate 12 NEW and DIFFERENT multiple-choice questions for this lesson.
CEFR: {request.cefrLevel}
Target language: {request.targetLanguage}
Source language: {request.sourceLanguage}
{child_mode_addendum}

Question variety required:
1) vocabulary meaning
2) fill in the blank
3) grammar choice
4) context inference
5) translation both directions

Return only:
{{"quizzes":[{{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}}]}}

Lesson title: {request.title}
Lesson content:
{transcript_text}
"""
    try:
        raw = _call_minimax(prompt, api_key, endpoint, model)
        parsed = _parse_minimax_json(_extract_json_candidate(raw))
        quizzes = parsed.get("quizzes") or []
        return {"quizzes": quizzes[:12]}
    except Exception as e:
        print(f"[QUIZ REFRESH ERROR] {e}")
        fallback_quizzes = [
            {
                "question": f"What is the best summary of this lesson topic: {request.title}?",
                "options": ["Core idea of the lesson", "Unrelated topic", "Only grammar rules", "Only numbers"],
                "correct": 0,
                "explanation": "The lesson title and transcript indicate the core topic."
            },
            {
                "question": "Choose the option that is most context-appropriate in the lesson.",
                "options": ["A likely in-context phrase", "Random unrelated phrase", "Another unrelated phrase", "None"],
                "correct": 0,
                "explanation": "The first option is designed to match lesson context."
            },
            {
                "question": "Which option is likely a vocabulary target for CEFR practice?",
                "options": ["A content word from transcript", "Punctuation mark", "Empty string", "URL token"],
                "correct": 0,
                "explanation": "Content words are used for vocabulary practice."
            },
            {
                "question": "Pick the most natural translation direction for this app workflow.",
                "options": ["source -> target language", "target -> source only", "no translation", "image -> audio only"],
                "correct": 0,
                "explanation": "ReadFluent displays both source and target for learning."
            },
            {
                "question": "What should you do after answering a quiz in this UI?",
                "options": ["Review explanation, then Next", "Refresh page immediately", "Close lesson", "Delete flashcards"],
                "correct": 0,
                "explanation": "The UI shows correct answer + explanation before next."
            },
        ]
        return {"quizzes": fallback_quizzes}


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
