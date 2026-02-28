"""
ReadFluent FastAPI backend: extract content from URL, call MiniMax for adaptation/translation.
Run: uvicorn main:app --reload
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from bs4 import BeautifulSoup
import re
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ReadFluent Process Content")

# Allow Next.js (port 3000) to call this server (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LessonRequest(BaseModel):
    url: str
    type: str  # "video" | "article"
    cefrLevel: str
    isChildMode: bool


def _normalize_url(url: str) -> str:
    url = (url or "").strip()
    if "<iframe" in url.lower() and "src=" in url:
        src_match = re.search(r'src=["\']([^"\']+)["\']', url, re.IGNORECASE)
        if src_match:
            url = src_match.group(1).strip()
    return url


def extract_content(url: str, content_type: str) -> str:
    url = _normalize_url(url)
    print(f"[EXTRACTION] Starting extraction for URL: {url[:120]}...")
    try:
        if "youtube.com" in url or "youtu.be" in url:
            video_id_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
            if not video_id_match:
                print("[EXTRACTION ERROR] Could not find YouTube Video ID")
                raise ValueError("Could not find YouTube Video ID")

            video_id = video_id_match.group(1)
            print(f"[EXTRACTION] Found Video ID: {video_id}. Fetching transcript...")

            transcript = YouTubeTranscriptApi().fetch(video_id)
            full_text = " ".join(snippet.text for snippet in transcript)
            print(f"[EXTRACTION] Success! Extracted {len(full_text)} characters.")
            return full_text[:15000]  # Truncate to prevent token limits

        else:
            print("[EXTRACTION] Attempting to scrape article...")
            headers = {"User-Agent": "Mozilla/5.0 ReadFluent/1.0"}
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            paragraphs = soup.find_all("p")
            full_text = " ".join([p.get_text() for p in paragraphs]).strip()
            print(f"[EXTRACTION] Success! Extracted {len(full_text)} characters.")
            return full_text[:15000]

    except Exception as e:
        print(f"[EXTRACTION ERROR] Failed to extract content: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Extraction failed: {str(e)}")


@app.post("/process-content")
def process_content(request: LessonRequest):
    # 1. Extract the text
    raw_text = extract_content(request.url, request.type)

    if not raw_text:
        raise HTTPException(status_code=400, detail="Extracted text was empty.")

    # 2. Build the MiniMax prompt
    print(f"[MINIMAX] Preparing to send {len(raw_text)} characters to MiniMax...")
    child_mode_instruction = ""
    if request.isChildMode:
        child_mode_instruction = (
            "Child Mode is TRUE: you MUST aggressively filter out any explicit, violent, or mature themes "
            "and replace them with safe, educational analogies. Use only family-friendly language. "
        )

    prompt = f"""Adapt the following text to CEFR level {request.cefrLevel}. {child_mode_instruction}
Return strict JSON with the following structure (no markdown, no code fence):
{{
  "title": "Adapted Title",
  "detectedTopics": ["topic1", "topic2"],
  "transcript": [
    {{ "id": "t1", "timestamp": "0:00", "text": "adapted sentence", "translatedText": "native translation" }}
  ],
  "flashcards": [
    {{ "word": "word", "context": "sentence", "definition": "definition", "imageUrl": "https://dummyimage.com/320x180/eee/333&text=WORD" }}
  ]
}}
Use 4–8 transcript segments and 3–6 flashcards. Here is the text to adapt:

{raw_text}
"""

    api_key = os.getenv("MINIMAX_API_KEY")
    endpoint = os.getenv(
        "MINIMAX_LLM_ENDPOINT",
        "https://api.minimax.chat/v1/text/chatcompletion_pro",
    )

    if not api_key:
        print("[MINIMAX ERROR] MINIMAX_API_KEY is missing from .env!")
        raise HTTPException(status_code=500, detail="Server missing API Key")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "abab6.5-chat",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }

    # 3. Call MiniMax
    print("[MINIMAX] Making API call...")
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=90)
    except requests.RequestException as e:
        print(f"[MINIMAX ERROR] Request failed: {str(e)}")
        raise HTTPException(status_code=502, detail=f"MiniMax request failed: {str(e)}")

    if not response.ok:
        print(f"[MINIMAX ERROR] API returned {response.status_code}: {response.text[:500]}")
        raise HTTPException(
            status_code=502,
            detail=f"MiniMax API error: {response.status_code} {response.text[:200]}",
        )

    data = response.json()

    # MiniMax can return "reply" or "choices"[0].message.content
    content_string = None
    if "reply" in data and isinstance(data["reply"], str):
        content_string = data["reply"]
    elif "choices" in data and data["choices"]:
        msg = data["choices"][0].get("message") or data["choices"][0]
        content_string = msg.get("content") or msg.get("text") or ""

    if not content_string:
        print(f"[MINIMAX ERROR] No content in response. Keys: {list(data.keys())}")
        raise HTTPException(status_code=502, detail="MiniMax returned empty content")

    # Strip markdown
    content_string = re.sub(r"^```(?:json)?\s*", "", content_string, flags=re.IGNORECASE)
    content_string = re.sub(r"\s*```$", "", content_string, flags=re.IGNORECASE)
    content_string = content_string.strip()

    # Find JSON object
    start = content_string.find("{")
    end = content_string.rfind("}")
    if start < 0 or end <= start:
        print(f"[MINIMAX ERROR] No JSON object in response. First 300 chars: {content_string[:300]}")
        raise HTTPException(status_code=502, detail="MiniMax response was not valid JSON")

    try:
        parsed_json = json.loads(content_string[start : end + 1])
    except json.JSONDecodeError as e:
        print(f"[MINIMAX ERROR] JSON parse failed: {e}. Raw slice: {content_string[start:start+300]}")
        raise HTTPException(status_code=502, detail=f"Failed to parse MiniMax JSON: {str(e)}")

    # Ensure shape expected by Next.js
    if "transcript" not in parsed_json:
        parsed_json["transcript"] = []
    if "flashcards" not in parsed_json:
        parsed_json["flashcards"] = []
    if "detectedTopics" not in parsed_json:
        parsed_json["detectedTopics"] = []
    for card in parsed_json["flashcards"]:
        if not card.get("imageUrl"):
            card["imageUrl"] = "https://dummyimage.com/320x180/e4e4e7/27272a&text=vocab"
    parsed_json["mediaUrl"] = request.url
    parsed_json["ambientVideoCue"] = parsed_json.get("ambientVideoCue") or (
        f"Calm focus scene for: {', '.join(parsed_json.get('detectedTopics', [])[:3]) or 'learning'}"
    )
    parsed_json["dataSource"] = "live"

    print("[SUCCESS] Returning parsed JSON to Next.js!")
    return parsed_json


@app.get("/health")
def health():
    return {"status": "ok", "service": "ReadFluent process-content"}
