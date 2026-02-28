# ReadFluent

**Turn the content you already consume into a personalized, privacy-first language immersion engine.**

ReadFluent is built with **FastAPI only** (no Next.js). One server serves both the API and the dashboard.

## Quick start

1. **Create a virtual environment and install dependencies**

   ```bash
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and set your MiniMax API key:

   ```bash
   cp .env.example .env
   # Edit .env and set MINIMAX_API_KEY=your_actual_api_key_here
   ```

3. **Run the server**

   ```bash
   uvicorn main:app --reload
   ```

   - Dashboard: **http://127.0.0.1:8000**
   - API: **http://127.0.0.1:8000/process-content** (POST)
   - Health: **http://127.0.0.1:8000/health**

## Workflow

1. **Browser extension** (or dashboard) sends: **URL** + optional **highlighted text**.
2. **Backend** fetches full transcript (YouTube) or article text, optionally merges highlighted text for vocabulary focus.
3. **MiniMax** returns: dual-language transcript (video language + your learning language), vocabulary flashcards, title/topics.
4. **Neon Postgres** stores: lessons, vocabulary flashcards, practice session URL (for vocabulary + shadowing).

## Usage

1. Open the dashboard at **http://127.0.0.1:8000**.
2. Paste a **YouTube URL** or **article link**.
3. Choose **Video language** (source) and **My learning language** (target) so the transcript shows both.
4. Optionally paste **highlighted text** from the extension to focus vocabulary.
5. Set **CEFR level** (A1–C2) and enable **Child Mode** if needed. Click **Generate Lesson**.
6. Use **Interactive Transcript** (dual language + timestamps), **Shadowing Practice**, and **Vocabulary Flashcards**. Use **Open practice session** for the lesson URL.

## Project structure

```
.
├── main.py              # FastAPI app: API + dashboard + process-content
├── db.py                # Neon Postgres: lessons, vocabulary_flashcards, practice_sessions
├── requirements.txt
├── .env.example
├── templates/
│   └── index.html       # Dashboard: URL, languages, highlighted text, tabs
├── browser-extension/   # Chrome extension (URL + highlighted text capture)
├── static/
└── README.md
```

Optional: set **DATABASE_URL** (Neon Postgres) in `.env` to persist lessons and flashcards. If unset, the app still runs; data is not saved.

## Hackathon tracks

- **ExpressVPN Digital Guardian**: Child Mode filters content for a safer, privacy-first experience.
- **MiniMax**: LLM used for CEFR adaptation, transcript, and flashcards.
- **RevisionDojo / OAX / HKUST**: Learning from real content (YouTube, articles) with transcripts and flashcards.

## Deploying the FastAPI server

To run in production (e.g. Render, Railway, Fly.io):

1. Set `MINIMAX_API_KEY` and optionally `MINIMAX_LLM_ENDPOINT` in the environment.
2. Run: `uvicorn main:app --host 0.0.0.0 --port $PORT` (use the platform’s `PORT` if required).
3. The same app serves the dashboard at `/` and the API at `/process-content`.

No separate Next.js or frontend build step is needed.
