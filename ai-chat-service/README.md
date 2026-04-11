# ai-chat-service

Minimal Express microservice scaffold for AI chat features.

## Scripts

- `npm run dev`: Start in watch mode with TypeScript
- `npm run build`: Compile TypeScript to `dist`
- `npm start`: Run compiled app

## Environment Variables

Copy `.env.example` to `.env` and set values:

- `PORT` (default: `3006`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Endpoints

- `GET /health`
- `GET /config`
