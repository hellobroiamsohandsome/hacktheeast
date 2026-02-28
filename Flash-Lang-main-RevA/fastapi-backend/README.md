# ReadFluent FastAPI Backend

Extracts content from YouTube/article URLs and calls MiniMax for CEFR adaptation and translation. Use this when you want to bypass the Next.js API route and see explicit `print()` logs in the terminal.

## Setup

```bash
cd fastapi-backend
pip install -r requirements.txt
```

Copy your MiniMax key into `.env`:

```bash
MINIMAX_API_KEY=your_actual_api_key_here
MINIMAX_LLM_ENDPOINT=https://api.minimax.chat/v1/text/chatcompletion_pro
```

## Run

```bash
uvicorn main:app --reload
```

Server runs at **http://127.0.0.1:8000**. Leave this terminal open.

## Point Next.js to this backend

In the Next.js project, set in `.env.local`:

```bash
NEXT_PUBLIC_PROCESS_CONTENT_URL=http://localhost:8000/process-content
```

Restart `npm run dev`. When you click "Generate Lesson", the frontend will call this FastAPI server instead of `/api/process-content`. Watch the **FastAPI terminal** for `[EXTRACTION]`, `[MINIMAX]`, and `[SUCCESS]` (or errors).

## Deploy (Render / Railway)

- Build: no build step (Python).
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Env: set `MINIMAX_API_KEY` and `MINIMAX_LLM_ENDPOINT` in the dashboard.
- After deploy, set `NEXT_PUBLIC_PROCESS_CONTENT_URL=https://your-app.onrender.com/process-content` (or your Railway URL).
