# ReadFluent - Deployment Guide

## 🚀 Deploy to Vercel

### Prerequisites
1. Push your code to GitHub
2. Create a Vercel account at vercel.com

### Steps
1. Import your GitHub repo to Vercel
2. Configure environment variables:
   ```
   MINIMAX_API_KEY=your_minimax_key
   MINIMAX_LLM_ENDPOINT=https://api.minimax.io/v1
   MINIMAX_MODEL=M2-her
   DATABASE_URL=postgresql://...
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_aws_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret
   ```
3. Deploy!

## 🧪 Local Development

```bash
# Activate virtual environment
source .venv/bin/activate

# Run server
uvicorn main:app --reload
```

## 📱 Features

### Current Features
- ✅ YouTube transcript extraction
- ✅ Article scraping
- ✅ CEFR-level content generation (A1-C2)
- ✅ In-text translation
- ✅ Vocabulary flashcards
- ✅ Interactive quizzes
- ✅ AI Chat tutor (AWS Bedrock)
- ✅ Text-to-Speech (AWS Bedrock)
- ✅ Child mode filter

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/process-content` | Generate lesson from URL |
| POST | `/generate-by-level` | Generate lesson by CEFR level |
| POST | `/translate` | In-text translation |
| POST | `/tts` | Text-to-speech |
| POST | `/chat` | AI tutor chat |
| GET | `/health` | Health check |

## 🗄️ Database (Neon DB)

The app uses Neon PostgreSQL. Database is already configured in `.env`:
```
DATABASE_URL=postgresql://neondb_owner:...@ep-lively-cake-.../neondb
```

## 🤖 AWS Bedrock

For AI chat and TTS features:
1. Get AWS credentials
2. Add to Vercel environment variables
3. Features will activate automatically
