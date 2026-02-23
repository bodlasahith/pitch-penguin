# Pitch Penguin

Pitch Penguin is a multiplayer party game where players pitch chaotic startup ideas under constraints, while one rotating judge ("the Penguin") picks winners.

https://pitch-penguin.vercel.app/

This repository is a Node monorepo with:
- `web`: React + Vite frontend
- `api`: Fastify + Socket.IO backend

## Table Of Contents

1. Overview
2. Core Features
3. Tech Stack
4. Project Structure
5. Local Development
6. Environment Variables
7. Available Scripts
8. API Surface
9. Deployment
10. Troubleshooting
11. Operational Notes

## Overview

Pitch Penguin game flow:
1. Host creates a room and shares code.
2. Players join lobby and choose mascots.
3. Round starts with a PROBLEM + CONSTRAINT cards (+ optional TWIST).
4. Players submit pitches (optionally with AI assistance and voice playback).
5. Penguin/judges evaluate and score.
6. Rounds continue until final round and winner resolution.

The backend is stateful and keeps room/game state in memory for realtime play.

## Core Features

- Realtime room sync using Socket.IO
- Room lifecycle with host transfer and player leave/join handling
- Phase-based gameplay:
  - lobby
  - deal
  - pitch
  - reveal
  - vote
  - results
  - final-round
- Constraint and twist card mechanics
- AI pitch generation option (Groq)
- Server-side TTS audio generation (deAPI)
- Challenge/disqualification mechanics for AI-generated pitches
- Final-round ranking and tiebreak handling

## Tech Stack

- Frontend:
  - React 19
  - React Router 6
  - Vite 7
  - TypeScript
  - Socket.IO client
- Backend:
  - Fastify 4
  - Socket.IO server
  - TypeScript
  - dotenv
- Monorepo tooling:
  - npm workspaces
  - concurrently

## Project Structure

```text
.
├── api/
│   ├── src/
│   │   ├── index.ts         # Fastify server + Socket.IO + game engine
│   │   └── cards.json       # Rules and card decks
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── pages/           # Home, Lobby, Deal, Pitch, Reveal, Results, FinalRound
│   │   ├── components/      # Layout/UI components
│   │   └── utils/
│   │       ├── api.ts       # API base URL + fetch helper
│   │       └── socket.ts    # Socket.IO client setup
│   ├── package.json
│   └── vite.config.ts
├── package.json             # workspace scripts
└── README.md
```

## Local Development

### Prerequisites

- Node.js 20+ recommended
- npm 10+ recommended

### Install

```bash
npm install
```

### Run both frontend and backend

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

Vite proxies `/api` and `/socket.io` to the backend during local dev.

### Build

```bash
npm run build
```

## Environment Variables

Create local `.env` in repo root for backend development.

### Backend (`api`)

- `PORT` (optional): API port. Defaults to `3001`.
- `CORS_ORIGIN` (optional): Comma-separated allowed origins for browser requests.
  - Example: `https://pitch-penguin.vercel.app,https://preview.vercel.app`
- `DEAPI_KEY` (required for TTS endpoint)
- `GROQ_API_KEY` (required for AI pitch generation)
- Optional deAPI overrides:
  - `DEAPI_BASE_URL`
  - `DEAPI_TTS_MODEL`
  - `DEAPI_TTS_FORMAT`
  - `DEAPI_TTS_LANG`
  - `DEAPI_TTS_SAMPLE_RATE`

### Frontend (`web`)

- `VITE_API_BASE_URL` (optional in local dev, required in split deployment)
  - Example: `https://pitch-penguin.onrender.com`
  - If protocol is omitted, frontend helper will normalize to `https://...`

## Available Scripts

From repo root:

- `npm run dev`: run frontend and backend concurrently
- `npm run dev:web`: run only frontend
- `npm run dev:api`: run only backend
- `npm run build`: build both apps
- `npm run build:web`: build frontend
- `npm run build:api`: build backend
- `npm run start:api`: run compiled backend

Within `web`:

- `npm run lint`
- `npm run preview`

## API Surface

Primary game endpoints:

- `GET /api/health`
- `GET /api/rules`
- `POST /api/rooms`
- `POST /api/rooms/join`
- `POST /api/rooms/leave`
- `GET /api/room/:code`
- `GET /api/room/:code/game`
- `POST /api/room/:code/advance`
- `POST /api/room/:code/select-ask`
- `POST /api/room/:code/pitch`
- `GET /api/room/:code/pitches`
- `POST /api/room/:code/judge`
- `POST /api/room/:code/challenge`
- `POST /api/room/:code/advance-round`
- `POST /api/room/:code/tiebreaker-ranking`
- `POST /api/tts`
- `POST /api/room/:code/generate-pitch`

Socket events:

- Client emit:
  - `room:join`
  - `room:leave`
- Server emit:
  - `room:state`
  - `room:error`

## Deployment

Recommended production split:
- Backend/API on Render
- Frontend on Vercel

### Deploy Backend To Render

Create a Render Web Service:

- Root directory: `api`
- Build command: `npm install && npm run build`
- Start command: `npm run start`

Set Render environment variables:

- `DEAPI_KEY`
- `GROQ_API_KEY`
- `CORS_ORIGIN=https://your-frontend.vercel.app`

Render provides `PORT` automatically.

### Deploy Frontend To Vercel

Create/import Vercel project:

- Root directory: `web`
- Build command: `npm run build`
- Output directory: `dist`

Set Vercel environment variable:

- `VITE_API_BASE_URL=https://your-render-service.onrender.com`

Redeploy after env changes.

## Operational Notes

- Data persistence: none (ephemeral runtime state)
- Cleanup: empty/inactive rooms are automatically removed after TTL
- Capacity: room capacity is currently fixed at `14`
- Security:
  - Never commit real API keys
  - Keep secrets in Render/Vercel environment settings
