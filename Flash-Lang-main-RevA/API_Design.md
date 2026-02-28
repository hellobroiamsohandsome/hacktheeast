# ReadFluent API Design

## Base URL
```
Production: https://your-project.vercel.app
Development: http://localhost:8000
```

## Endpoints

### 1. Health Check
**GET** `/health`

Response:
```json
{
  "status": "ok",
  "app": "ReadFluent"
}
```

---

### 2. Process Content (YouTube/Article → Lesson)
**POST** `/process-content`

Request:
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "type": "youtube",  // "youtube" | "article"
  "cefrLevel": "B2",
  "isChildMode": false,
  "sourceLanguage": "en",
  "targetLanguage": "zh",
  "highlightedText": "optional highlighted text"
}
```

Response:
```json
{
  "title": "Lesson Title",
  "detectedTopics": ["topic1", "topic2"],
  "transcript": [
    {
      "id": "1",
      "timestamp": "0:00",
      "text": "Sentence in target language",
      "translatedText": "Sentence in source language"
    }
  ],
  "flashcards": [
    {
      "word": "vocabulary word",
      "context": "example sentence",
      "definition": "word definition"
    }
  ],
  "quizzes": [
    {
      "question": "What does 'word' mean?",
      "options": ["option A", "option B", "option C", "option D"],
      "correct": 0,
      "explanation": "Why this answer is correct"
    }
  ],
  "mediaUrl": "https://...",
  "sourceLanguage": "en",
  "targetLanguage": "zh",
  "lessonId": 1,
  "practiceSessions": [
    {"type": "vocabulary", "content": "Review flashcards"},
    {"type": "shadowing", "content": "Practice speaking"},
    {"type": "quiz", "questions": [...]}
  ]
}
```

---

### 3. Generate Content by CEFR Level (No URL Required)
**POST** `/generate-by-level`

Request:
```json
{
  "cefrLevel": "A1",  // A1, A2, B1, B2, C1, C2
  "targetLanguage": "en",
  "sourceLanguage": "en",
  "topic": "optional topic preference",
  "isChildMode": false
}
```

Response:
```json
{
  "title": "A1 English Lesson - Greetings",
  "type": "generated",  // "youtube" | "article" | "generated"
  "content": {
    "transcript": [...],
    "article": "Generated article text...",
    "youtubeSuggestions": ["video_id_1", "video_id_2"]
  },
  "flashcards": [...],
  "quizzes": [...],
  "cefrLevel": "A1",
  "targetLanguage": "en"
}
```

---

### 4. In-Text Translation
**POST** `/translate`

Request:
```json
{
  "text": "Text to translate",
  "targetLang": "en",
  "sourceLang": "ja"
}
```

Response:
```json
{
  "translated": "Translated text"
}
```

---

### 5. Text-to-Speech (AWS Bedrock)
**POST** `/tts`

Request:
```json
{
  "text": "Text to speak",
  "language": "en",
  "voiceId": "amy"  // Optional voice preference
}
```

Response:
```json
{
  "audioUrl": "https://...",
  "audioBase64": "data:audio/mp3;base64,..."
}
```

---

### 6. AI Chat (AWS Bedrock)
**POST** `/chat`

Request:
```json
{
  "message": "Explain the difference between ser and estar",
  "lessonId": 1,
  "language": "es"
}
```

Response:
```json
{
  "response": "AI explanation...",
  "context": {"lessonId": 1}
}
```

---

### 7. User Progress
**GET** `/progress`

Response:
```json
{
  "totalLessons": 10,
  "wordsLearned": 150,
  "quizzesTaken": 25,
  "accuracy": 85,
  "streak": 5,
  "recentLessons": [...]
}
```

---

### 8. Save Progress
**POST** `/progress`

Request:
```json
{
  "lessonId": 1,
  "flashcardsReviewed": ["word1", "word2"],
  "quizScore": 80,
  "timeSpent": 300
}
```

Response:
```json
{"status": "saved"}
```
