# NanoClaw Docker Compose Setup

## Architecture

```
docker-compose.yml
├── signal-api (bbernhard/signal-cli-rest-api)
│   ├── Handles Signal protocol (send/receive messages)
│   ├── Provides REST API on port 8080
│   └── Sends webhooks to nanoclaw on incoming messages
│
└── nanoclaw (built from ./Dockerfile)
    ├── Receives webhooks on port 3002
    ├── Routes messages to Claude agents
    ├── Spawns agent containers via host Docker daemon
    └── Manages sessions, scheduling, IPC
```

The NanoClaw container mounts the host Docker socket (`/var/run/docker.sock`), which allows it to spawn agent containers directly on the host. Agent container volume mounts are translated from container paths to host paths via the `HOST_PROJECT_ROOT` environment variable.

## Quick Start

```bash
# Start both signal-api and nanoclaw services
docker compose up -d
```

## Stop Services

```bash
docker compose down
```

## Rebuild After Code Changes

```bash
docker compose build nanoclaw && docker compose up -d nanoclaw
```

## View Logs

```bash
docker compose logs -f nanoclaw      # NanoClaw logs
docker compose logs -f signal-api    # Signal API logs
docker compose logs -f               # All logs
```

## Signal-Only Mode

If you prefer running NanoClaw directly on the host (for development):

```bash
# Start only the Signal API
docker compose -f docker-compose.signal.yml up -d

# Run NanoClaw on the host
npm run dev
```

## Environment Variables

Required in `.env`:
- `SIGNAL_PHONE_NUMBER` - Your phone number in E.164 format (e.g., `+14155551234`)
- `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` - Claude authentication

Optional:
- `ASSISTANT_NAME` - Trigger word (default: `Andy`)
- `CONTAINER_RUNTIME` - Set to `docker` (default when using Docker Compose)
- `SIGNAL_API_URL` - Signal API endpoint (auto-set in Docker Compose to `http://signal-api:8080`)

## Troubleshooting

**NanoClaw can't connect to Signal API:**
```bash
# Check signal-api is healthy
curl -s http://localhost:8080/v1/about

# Check inter-container connectivity
docker compose exec signal-api curl -s http://nanoclaw:3002/health
```

**Agent containers fail to start:**
```bash
# Verify Docker socket is mounted
docker compose exec nanoclaw docker info

# Check for orphaned containers
docker ps --filter "name=nanoclaw-"
```

**Signal account not linked:**
```bash
# Open in browser to scan QR code
# http://localhost:8080/v1/qrcodelink?device_name=nanoclaw

# Verify account
curl -s http://localhost:8080/v1/accounts
```
