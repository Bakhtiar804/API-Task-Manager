# Task Manager API

An Express REST API backed by MongoDB and Mongoose, with optional task planning through Google's Gemini API.

## Requirements

- Node.js 20 or newer
- MongoDB Atlas connection string (or another MongoDB URI)
- Gemini API key and a currently supported Gemini model ID for AI planning

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `GEMINI_API_KEY`, and `GEMINI_MODEL`. `PORT` is optional and defaults to `3000`.
3. Start the API with `npm start`; development mode uses `npm run dev`.
4. Run automated tests with `npm test`.

The server connects to MongoDB before listening. `GET /health` is available as a basic process health check.

## Environment variables

- `PORT`: HTTP port; defaults to `3000` and uses Render's assigned port when deployed.
- `MONGODB_URI`: MongoDB connection string.
- `GEMINI_API_KEY`: secret key for the Gemini API. Never expose it in client-side code.
- `GEMINI_MODEL`: model ID currently available to the account. Check [Gemini's supported models](https://ai.google.dev/gemini-api/docs/models).

The AI integration calls Google's `generateContent` API with the `x-goog-api-key` header and JSON response MIME type, as documented in [Gemini's API reference](https://ai.google.dev/api/generate-content).

## Render deployment

1. Push the project to a Git repository; `.env` and `node_modules` are ignored.
2. In Render, create a **Web Service** for the repository.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Add `MONGODB_URI`, `GEMINI_API_KEY`, and `GEMINI_MODEL` as Render environment variables. Render supplies `PORT` automatically.
5. Deploy and verify `GET https://<your-service>.onrender.com/health`.

Do not commit `.env` or paste credentials into source files.

## API

All task responses use JSON. Errors use `{ "success": false, "error": "..." }`.

### Tasks

- `POST /api/tasks/`: create a task. `title` is required; `description`, `status`, and `dueDate` are optional. Status defaults to `pending`.
- `GET /api/tasks/`: list tasks, newest first.
- `GET /api/tasks/:id`: retrieve one task.
- `PUT /api/tasks/:id`: update one or more of `title`, `description`, `status`, and `dueDate`.
- `DELETE /api/tasks/:id`: delete one task.

Valid statuses are `pending`, `in-progress`, and `completed`. Invalid ObjectIds return `400`; missing tasks return `404`.

### AI plan

- `POST /api/ai/plan-task`
- JSON body: `{ "description": "I need to build a portfolio website within three days." }`
- Returns `{ "success": true, "plan": { "summary": "...", "priority": "high", "estimatedHours": 12, "steps": ["..."] } }`.

AI errors return a generic message and do not reveal credentials or provider response bodies. A missing provider configuration returns `503`; upstream or malformed responses return `502`.