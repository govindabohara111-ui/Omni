# Forge Web

A multi-agent web app generator. A team of collaborating AI agents (Orchestrator, Frontend Developer, Backend Developer) plans, writes, and runs full-stack web applications inside isolated Docker sandboxes — streamed live to a browser IDE.

## Architecture

- **Next.js 14 (App Router)** serves both the UI and the backend API routes.
- **Agent engine** (`src/agent/engine.ts`): a streaming while-loop around the OpenAI API (GPT-4o) with function calling. Tools operate on the project's Docker container. The `request_handoff` tool swaps the active system prompt to delegate work between agents.
- **Docker sandbox** (`src/lib/docker.ts`): each project gets a `node:20-alpine` container (512MB RAM, 50% CPU) with `./volumes/<projectId>` mounted at `/app` and container port 3000 published on a random host port (3000-4000) for the live preview. Every exec has a hard 60s timeout.
- **Real-time updates** via Server-Sent Events from `POST /api/chat` (tokens, tool calls, terminal output, agent handoffs).
- **Persistence** via Prisma + SQLite (projects, message history, tool-call transcripts).
- **UI**: 3-panel IDE (file tree / chat + Monaco code viewer / live preview iframe) with a terminal log spanning the bottom. Zustand for state, Tailwind + shadcn-style components.

## Requirements

- Node.js 18.18+ (Node 20 recommended)
- Docker daemon running locally (the app talks to `/var/run/docker.sock`)
- An OpenAI API key

## Setup

```bash
npm install
cp .env.example .env      # then set OPENAI_API_KEY
npx prisma db push        # creates prisma/dev.db
npm run dev
```

Open http://localhost:3000, create a project (this pulls `node:20-alpine` on first run and starts the sandbox), then ask for an app, e.g.:

> Build a pomodoro timer app with a nice dark UI.

The Orchestrator plans and scaffolds, hands off to the Frontend/Backend Developer agents, and the live preview appears in the right panel once a dev server is running on the sandbox's port 3000.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/projects` | POST | Create a project + start its Docker sandbox |
| `/api/projects` | GET | List recent projects |
| `/api/chat` | POST | Run the agent loop; returns an SSE stream |
| `/api/files` | GET | List files (`?projectId=`) or read one (`&path=`) from the container |
| `/api/destroy` | POST | Kill and remove the project's container |

## Notes

- Generated app code lives on the host in `./volumes/<projectId>` (gitignored), so it survives container destruction.
- The live preview iframe points at `http://localhost:<hostPort>`; if you run Forge Web on a remote machine, forward that port or replace `localhost` in `LivePreview.tsx`.
- Agent bash commands have a hard 60-second timeout; agents are prompted to start dev servers detached (`nohup ... &`).
