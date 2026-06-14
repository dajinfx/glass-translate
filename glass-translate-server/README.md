# Glass Translate Server

Local API server for the Glass Translate Chrome extension.

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Set `OPENAI_API_KEY` in `.env` for the MVP GPT path.

## API

```http
POST /api/translate-image
```

Body:

```json
{
  "image": "data:image/png;base64,...",
  "targetLanguage": "中文",
  "model": "gpt",
  "viewport": {
    "width": 800,
    "height": 520
  }
}
```
