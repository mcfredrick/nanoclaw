---
name: setup
description: Run initial NanoClaw setup. Use when user wants to install dependencies, authenticate Signal, register their main channel, or start the background services. Triggers on "setup", "install", "configure nanoclaw", or first-time setup requests.
---

# NanoClaw Setup

Run all commands automatically. Only pause when user action is required (Signal authentication, configuration choices).

**UX Note:** When asking the user questions, prefer using the `AskUserQuestion` tool instead of just outputting text. This integrates with Claude's built-in question/answer system for a better experience.

## 1. Install Dependencies

```bash
npm install
```

## 2. Install Container Runtime

First, detect the platform and check what's available:

```bash
echo "Platform: $(uname -s)"
which docker && docker info >/dev/null 2>&1 && echo "Docker: installed and running" || echo "Docker: not installed or not running"
```

### If Docker is NOT installed

Tell the user:
> NanoClaw needs Docker for container isolation. Docker will be used to run both the Signal API and NanoClaw services.
>
> Would you like me to help you install Docker Desktop?

If the user says yes, provide installation instructions:
> 1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
> 2. Install the package
> 3. Start Docker Desktop and ensure it's running
> 4. Run `docker info` to verify it's working

Wait for the user to confirm Docker is installed and running, then verify:

```bash
docker info
```

### If Docker is installed

Continue to Section 3.

## 5. Docker Setup and Services

**USER ACTION REQUIRED**

NanoClaw uses Docker for all services. The setup will start both the Signal API and NanoClaw services.

### 5a. Create Environment Variables

Tell the user:
> I need your Signal phone number in E.164 format (e.g. `+14155551234`) to configure the environment.
> You can either:
> 1. Provide it here and I'll add it to `.env`, or
> 2. Add it yourself to `.env` as `SIGNAL_PHONE_NUMBER=<your-number>`

If they provide the number, add it to `.env`:
```bash
echo "SIGNAL_PHONE_NUMBER=+PHONE_NUMBER_HERE" > .env
```

### 5b. Start Docker Services

```bash
docker compose up -d
```

Wait for the containers to be healthy:

```bash
for i in $(seq 1 30); do
  if curl -s http://localhost:8080/v1/about >/dev/null 2>&1 && curl -s http://localhost:3002/health >/dev/null 2>&1; then
    echo "All services ready"
    exit 0
  fi
  sleep 2
done
echo "timeout waiting for services"
```

### 5c. Verify Signal Account

Tell the user:
> Open this URL in your browser to see the QR code for linking your Signal account:
>
> **http://localhost:8080/v1/qrcodelink?device_name=nanoclaw**
>
> Then on your phone: **Signal → Settings → Linked Devices → Link New Device** and scan the QR code.

Wait for the user to confirm they've linked the device.

### 5d. Verify the link

```bash
curl -s http://localhost:8080/v1/about | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/v1/about
```

This should show account information. If it shows an empty accounts list, the linking failed — ask the user to try again.

### 5e. Configure External Directory Access (Mount Allowlist)

Ask the user:
> Do you want the agent to be able to access any directories **outside** the NanoClaw project?
>
> Examples: Git repositories, project folders, documents you want Claude to work on.
>
> **Note:** This is optional. Without configuration, agents can only access their own group folders.

If **no**, create an empty allowlist to make this explicit:

```bash
mkdir -p ~/.config/nanoclaw
cat > ~/.config/nanoclaw/mount-allowlist.json << 'EOF'
{
  "allowedRoots": [],
  "blockedPatterns": [],
  "nonMainReadOnly": true
}
EOF
echo "Mount allowlist created - no external directories allowed"
```

Skip to the next step.

If **yes**, ask follow-up questions:

### 5f. Collect Directory Paths

Ask the user:
> Which directories do you want to allow access to?
>
> You can specify:
> - A parent folder like `~/projects` (allows access to anything inside)
> - Specific paths like `~/repos/my-app`
>
> List them one per line, or give me a comma-separated list.

For each directory they provide, ask:
> Should `[directory]` be **read-write** (agents can modify files) or **read-only**?
>
> Read-write is needed for: code changes, creating files, git commits
> Read-only is safer for: reference docs, config examples, templates

### 5g. Configure Non-Main Group Access

Ask the user:
> Should **non-main groups** (other Signal chats you add later) be restricted to **read-only** access even if read-write is allowed for the directory?
>
> Recommended: **Yes** - this prevents other groups from modifying files even if you grant them access to a directory.

### 5h. Create the Allowlist

Create the allowlist file based on their answers:

```bash
mkdir -p ~/.config/nanoclaw
```

Then write the JSON file. Example for a user who wants `~/projects` (read-write) and `~/docs` (read-only) with non-main read-only:

```bash
cat > ~/.config/nanoclaw/mount-allowlist.json << 'EOF'
{
  "allowedRoots": [
    {
      "path": "~/projects",
      "allowReadWrite": true,
      "description": "Development projects"
    },
    {
      "path": "~/docs",
      "allowReadWrite": false,
      "description": "Reference documents"
    }
  ],
  "blockedPatterns": [],
  "nonMainReadOnly": true
}
EOF
```

Verify the file:

```bash
cat ~/.config/nanoclaw/mount-allowlist.json
```

Tell the user:
> Mount allowlist configured. The following directories are now accessible:
> - `~/projects` (read-write)
> - `~/docs` (read-only)
>
> **Security notes:**
> - Sensitive paths (`.ssh`, `.gnupg`, `.aws`, credentials) are always blocked
> - This config file is stored outside the project, so agents cannot modify it
> - Changes require restarting the NanoClaw service
>
> To grant a group access to a directory, add it to their config in `data/registered_groups.json`:
> ```json
> "containerConfig": {
>   "additionalMounts": [
>     { "hostPath": "~/projects/my-app" }
>   ]
> }
> ```
> The folder appears inside the container at `/workspace/extra/<folder-name>` (derived from the last segment of the path). Add `"readonly": false` for write access, or `"containerPath": "custom-name"` to override the default name.
```

## 4. Build Container Image

Build the NanoClaw agent container:

```bash
docker compose build
```

This creates the container image with Node.js, Chromium, Claude Code CLI, and agent-browser.

Verify the build succeeded by running a simple test:

```bash
curl -s http://localhost:3002/health >/dev/null && echo "Container OK" || echo "Container build failed"
```

## 5. Docker Setup and Services

**USER ACTION REQUIRED**

NanoClaw uses Docker for all services. The setup will start both the Signal API and NanoClaw services.

### 5a. Create Environment Variables

Tell the user:
> I need your Signal phone number in E.164 format (e.g. `+14155551234`) to configure the environment.
> You can either:
> 1. Provide it here and I'll add it to `.env`, or
> 2. Add it yourself to `.env` as `SIGNAL_PHONE_NUMBER=<your-number>`

If they provide the number, add it to `.env`:
```bash
echo "SIGNAL_PHONE_NUMBER=+PHONE_NUMBER_HERE" > .env
```

### 5b. Start Docker Services

```bash
docker compose up -d
```

Wait for the containers to be healthy:

```bash
for i in $(seq 1 30); do
  if curl -s http://localhost:8080/v1/about >/dev/null 2>&1 && curl -s http://localhost:3002/health >/dev/null 2>&1; then
    echo "All services ready"
    exit 0
  fi
  sleep 2
done
echo "timeout waiting for services"
```

### 5c. Verify Signal Account

Tell the user:
> Open this URL in your browser to see the QR code for linking your Signal account:
>
> **http://localhost:8080/v1/qrcodelink?device_name=nanoclaw**
>
> Then on your phone: **Signal → Settings → Linked Devices → Link New Device** and scan the QR code.

Wait for the user to confirm they've linked the device.

### 5d. Verify the link

```bash
curl -s http://localhost:8080/v1/about | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/v1/about
```

This should show account information. If it shows an empty accounts list, the linking failed — ask the user to try again.

### 5b. Link Signal account

Tell the user:
> Open this URL in your browser to see the QR code for linking your Signal account:
>
> **http://localhost:8080/v1/qrcodelink?device_name=nanoclaw**
>
> Then on your phone: **Signal → Settings → Linked Devices → Link New Device** and scan the QR code.

Wait for the user to confirm they've linked the device.

### 5c. Verify the link

```bash
curl -s http://localhost:8080/v1/about | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/v1/about
```

This should show account information. If it shows an empty accounts list, the linking failed — ask the user to try again.

### 5d. Get the phone number

Ask the user for their Signal phone number in E.164 format (e.g. `+14155551234`). This is needed for `SIGNAL_PHONE_NUMBER` in `.env`.

Add it to `.env`:
```bash
echo "SIGNAL_PHONE_NUMBER=+PHONE_NUMBER_HERE" >> .env
```

## 8. Troubleshooting

**Services not starting**: Check Docker status:
```bash
docker ps
```

**Signal account not linked**:
- Visit `http://localhost:8080/v1/qrcodelink?device_name=nanoclaw` to re-link
- Verify with `curl http://localhost:8080/v1/about`

**Container agent fails with "Claude Code process exited with code 1"**:
- Ensure Docker is running: `docker info`
- Check container logs: `docker compose logs -f`

**No response to messages**:
- Verify the trigger pattern matches (e.g., `@AssistantName` at start of message)
- Main channel doesn't require a prefix — all messages are processed
- Personal/solo chats with `requiresTrigger: false` also don't need a prefix
- Check that the chat JID is in the database: `sqlite3 store/messages.db "SELECT * FROM registered_groups"`
- Check that signal-cli-rest-api is sending webhooks: `curl http://localhost:8080/v1/about`
- Ensure `SIGNAL_PHONE_NUMBER` is set correctly in `.env`
- Check `logs/nanoclaw.log` for errors

## 8. Troubleshooting

**Services not starting**: Check Docker status:
```bash
docker ps
```

**Signal account not linked**:
- Visit `http://localhost:8080/v1/qrcodelink?device_name=nanoclaw` to re-link
- Verify with `curl http://localhost:8080/v1/about`

**Container agent fails with "Claude Code process exited with code 1"**:
- Ensure Docker is running: `docker info`
- Check container logs: `docker compose logs -f`

**No response to messages**:
- Verify the trigger pattern matches (e.g., `@AssistantName` at start of message)
- Main channel doesn't require a prefix — all messages are processed
- Personal/solo chats with `requiresTrigger: false` also don't need a prefix
- Check that the chat JID is in the database: `sqlite3 store/messages.db "SELECT * FROM registered_groups"`
- Check that signal-cli-rest-api is sending webhooks: `curl http://localhost:8080/v1/about`
- Ensure `SIGNAL_PHONE_NUMBER` is set correctly in `.env`
- Check `logs/nanoclaw.log` for errors

## 8. Test

Tell the user (using the assistant name they configured):
> Send `@ASSISTANT_NAME hello` in your registered chat.
>
> **Tip:** In your main channel, you don't need the `@` prefix — just send `hello` and the agent will respond.

Check the logs:
```bash
tail -f logs/nanoclaw.log
```

The user should receive a response in Signal.

## Troubleshooting

**Services not starting**: Check Docker status:
```bash
docker ps
```

**Signal account not linked**:
- Visit `http://localhost:8080/v1/qrcodelink?device_name=nanoclaw` to re-link
- Verify with `curl http://localhost:8080/v1/about`

**Container agent fails with "Claude Code process exited with code 1"**:
- Ensure Docker is running: `docker info`
- Check container logs: `docker compose logs -f`

**No response to messages**:
- Verify the trigger pattern matches (e.g., `@AssistantName` at start of message)
- Main channel doesn't require a prefix — all messages are processed
- Personal/solo chats with `requiresTrigger: false` also don't need a prefix
- Check that the chat JID is in the database: `sqlite3 store/messages.db "SELECT * FROM registered_groups"`
- Check that signal-cli-rest-api is sending webhooks: `curl http://localhost:8080/v1/about`
- Ensure `SIGNAL_PHONE_NUMBER` is set correctly in `.env`
- Check `logs/nanoclaw.log` for errors

## 9. Test

Tell the user (using the assistant name they configured):
> Send `@ASSISTANT_NAME hello` in your registered chat.
>
> **Tip:** In your main channel, you don't need the `@` prefix — just send `hello` and the agent will respond.

Check the logs:
```bash
tail -f logs/nanoclaw.log
```

The user should receive a response in Signal.

## Troubleshooting

**Service not starting**: Check `logs/nanoclaw.error.log`

**signal-cli-rest-api not running**:
- Check Docker: `docker ps | grep signal`
- Restart: `docker compose -f docker-compose.signal.yml up -d`
- Check logs: `docker compose -f docker-compose.signal.yml logs -f`

**Signal account not linked**:
- Visit `http://localhost:8080/v1/qrcodelink?device_name=nanoclaw` to re-link
- Verify with `curl http://localhost:8080/v1/about`

**Container agent fails with "Claude Code process exited with code 1"**:
- Ensure the container runtime is running:
  - Apple Container: `container system start`
  - Docker: `docker info` (start Docker Desktop on macOS, or `sudo systemctl start docker` on Linux)
- Check container logs: `cat groups/main/logs/container-*.log | tail -50`

**No response to messages**:
- Verify the trigger pattern matches (e.g., `@AssistantName` at start of message)
- Main channel doesn't require a prefix — all messages are processed
- Personal/solo chats with `requiresTrigger: false` also don't need a prefix
- Check that the chat JID is in the database: `sqlite3 store/messages.db "SELECT * FROM registered_groups"`
- Check that signal-cli-rest-api is sending webhooks: `curl http://localhost:8080/v1/about`
- Ensure `SIGNAL_PHONE_NUMBER` is set correctly in `.env`
- Check `logs/nanoclaw.log` for errors

**Webhook not receiving messages**:
- Ensure `RECEIVE_WEBHOOK_URL` in docker-compose points to `http://host.docker.internal:3002/webhook/signal`
- Test the webhook manually: `curl -X POST http://localhost:3002/webhook/signal -H 'Content-Type: application/json' -d '{"envelope":{}}'`
- Check Docker networking: `docker compose -f docker-compose.signal.yml logs signal-api`

**Unload service**:
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
```
