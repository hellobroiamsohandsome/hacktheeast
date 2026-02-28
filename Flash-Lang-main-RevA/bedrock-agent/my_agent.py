"""
ReadFluent Bedrock AgentCore bridge.
Extracts raw text from URLs (YouTube transcript or article <p> tags), then calls MiniMax
with that text. Enforces isChildMode in the prompt. Returns JSON for /api/process-content.
"""
from bedrock_agentcore import BedrockAgentCoreApp
import requests
import os
import json
import re
from youtube_transcript_api import YouTubeTranscriptApi
from bs4 import BeautifulSoup

app = BedrockAgentCoreApp()


def extract_content(url: str) -> str:
    """
    Extract raw text from a URL.
    - YouTube: get transcript via youtube_transcript_api and join segments.
    - Article: fetch HTML and extract text from <p> tags.
    """
    if not url or not url.strip():
        return ""

    url = url.strip()
    # YouTube: extract video ID and fetch transcript
    if "youtube.com" in url or "youtu.be" in url:
        video_id = None
        if "youtu.be/" in url:
            match = re.search(r"youtu\.be/([a-zA-Z0-9_-]{11})", url)
            if match:
                video_id = match.group(1)
        else:
            match = re.search(r"(?:v=|/embed/|/v/)([a-zA-Z0-9_-]{11})", url)
            if match:
                video_id = match.group(1)
        if not video_id:
            return ""
        try:
            transcript = YouTubeTranscriptApi().fetch(video_id)
            return " ".join(snippet.text for snippet in transcript).strip()
        except Exception:
            return ""

    # Article or other URL: fetch and parse <p> tags
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "ReadFluent/1.0"})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        paragraphs = soup.find_all("p")
        parts = [p.get_text(separator=" ", strip=True) for p in paragraphs if p.get_text(strip=True)]
        return " ".join(parts).strip() if parts else ""
    except Exception:
        return ""


@app.entrypoint
def invoke(payload):
    # Payload may be dict (from AgentCore) or JSON string (from InvokeAgent inputText)
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    url = payload.get("url", "")
    cefr_level = payload.get("cefrLevel", "B2")
    content_type = payload.get("type", "video")
    is_child_mode = payload.get("isChildMode", False)

    # Step 1: Extract raw text from URL (MiniMax cannot scrape URLs)
    raw_text = extract_content(url)
    if not raw_text:
        return {
            "error": "Could not extract content from URL (check YouTube availability or article accessibility)",
            "result": None,
        }

    # Step 2: Build prompt with raw text and explicit Child Mode enforcement
    child_instruction = (
        " Child Mode is TRUE: you MUST aggressively filter out any explicit, violent, or mature "
        "themes and replace them with safe, educational analogies. Use only family-friendly language."
    ) if is_child_mode else " Child Mode is FALSE; standard educational tone is fine."

    prompt = (
        f"Adapt the following text to CEFR level {cefr_level}.{child_instruction} "
        "Return a single valid JSON object (no markdown, no code fence) with exactly these keys: "
        '"title" (string), '
        '"detectedTopics" (array of 1–5 topic strings), '
        '"transcript" (array of objects with: "id" (e.g. "t1"), "timestamp" (optional, e.g. "0:00"), "text", "translatedText"), '
        '"flashcards" (array of objects with: "word", "context", "definition", "imageUrl" as URL or placeholder). '
        "Use 4–8 transcript segments and 3–6 flashcards. imageUrl can be a placeholder like https://dummyimage.com/320x180/eee/333&text=WORD. "
        "Here is the text:\n\n"
        f"{raw_text[:12000]}"
    )
    if len(raw_text) > 12000:
        prompt += "\n\n[Text was truncated for length.]"

    minimax_url = os.environ.get(
        "MINIMAX_LLM_ENDPOINT",
        "https://api.minimax.chat/v1/text/chatcompletion_pro",
    )
    api_key = os.environ.get("MINIMAX_API_KEY", "")

    if not api_key:
        return {
            "error": "MINIMAX_API_KEY not set",
            "result": None,
        }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "abab6.5-chat",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests.post(minimax_url, headers=headers, json=body, timeout=90)
        data = response.json()
    except Exception as e:
        return {"error": str(e), "result": None}

    # MiniMax often returns { "reply" or "choices": [...] }; extract the actual JSON content
    raw = data
    if "choices" in raw and isinstance(raw["choices"], list) and raw["choices"]:
        first = raw["choices"][0]
        if isinstance(first, dict) and "message" in first:
            content = first["message"].get("content") or first["message"].get("text", "")
        else:
            content = str(first)
    elif "reply" in raw and isinstance(raw["reply"], str):
        content = raw["reply"]
    elif "result" in raw:
        content = raw["result"]
    else:
        content = json.dumps(raw)

    if isinstance(content, dict):
        result = content
    else:
        try:
            result = json.loads(
                content.strip().removeprefix("```json").removesuffix("```").strip()
            )
        except json.JSONDecodeError:
            result = {"title": "Lesson", "detectedTopics": [], "transcript": [], "flashcards": []}

    # Ensure mediaUrl for frontend (use original URL for articles/video link)
    result["mediaUrl"] = result.get("mediaUrl") or url
    result["ambientVideoCue"] = result.get("ambientVideoCue") or (
        f"Calm focus scene for: {', '.join(result.get('detectedTopics', [])[:3]) or 'learning'}"
    )
    return {"result": result}


if __name__ == "__main__":
    app.run()
