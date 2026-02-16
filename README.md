<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  A personal Claude assistant running on Signal via Docker Compose. Fork of <a href="https://github.com/gavrielc/nanoclaw">gavrielc/nanoclaw</a> that replaces WhatsApp entirely with Signal as the sole messaging channel and uses a fully containerized Docker Compose architecture.
</p>

<p align="center">
  <a href="https://discord.gg/VGWXrf8x"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord"></a>
</p>

## What's Different in This Fork

## Migration from WhatsApp to Signal

This fork completely migrates the messaging channel from WhatsApp to Signal. All WhatsApp-related code, authentication flows, and dependencies have been removed. Signal is integrated via the `signal-cli-rest-api` service, providing a secure, open‑source, and container‑friendly way to send and receive messages.



The [upstream NanoClaw](https://github.com/gavrielc/nanoclaw) originally used WhatsApp as its messaging channel. This fork replaces WhatsApp entirely with **Signal** and runs everything via **Docker Compose**:

- **Signal via [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api)** — webhook receiver + REST sender, no reverse-engineered protocols
- **Docker Compose orchestration** — `docker compose up -d` starts both Signal API and NanoClaw as services
- **Host Docker socket mounting** — NanoClaw spawns agent containers from inside its own container, with `HOST_PROJECT_ROOT` path mapping for correct volume mounts
- **WhatsApp fully removed** — no WhatsApp code, auth, or dependencies remain

## Why NanoClaw

[OpenClaw](https://github.com/openclaw/openclaw) is an impressive project with a great vision. But I can't sleep well running software I don't understand with access to my life. OpenClaw has 52+ modules, 8 config management files, 45+ dependencies, and abstractions for 15 channel providers. Security is application-level (allowlists, pairing codes) rather than OS isolation. Everything runs in one Node process with shared memory.

NanoClaw gives you the same core functionality in a codebase you can understand in 8 minutes. One process. A handful of files. Agents run in actual Linux containers with filesystem isolation, not behind permission checks.

## Quick Start

```bash
git clone https://github.com/gavrielc/nanoclaw.git
cd nanoclaw
```

Run `/setup` to configure everything: dependencies, authentication, container setup, and service configuration. The setup will create a `.env` file with the required environment variables.

## Philosophy

**Small enough to understand.** One process, a few source files. No microservices, no message queues, no abstraction layers. Have Claude Code walk you through it.

**Secure by isolation.** Agents run in Linux containers (Apple Container on macOS, or Docker). They can only see what's explicitly mounted. Bash access is safe because commands run inside the container, not on your host.

**Built for one user.** This isn't a framework. It's working software that fits my exact needs. You fork it and have Claude Code make it match your exact needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that this is safe.

**AI-native.** No installation wizard; Claude Code guides setup. No monitoring dashboard; ask Claude what's happening. No debugging tools; describe the problem, Claude fixes it.

**Skills over features.** Contributors shouldn't add features (e.g. support for Telegram) to the codebase. Instead, they contribute [claude code skills](https://code.claude.com/docs/en/skills) like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

**Best harness, best model.** This runs on Claude Agent SDK, which means you're running Claude Code directly. The harness matters. A bad harness makes even smart models seem dumb, a good harness gives them superpowers. Claude Code is (IMO) the best harness available.

## What It Supports

- **Signal I/O** - Message Claude from your phone via Signal
- **Isolated group context** - Each group has its own `CLAUDE.md` memory, isolated filesystem, and runs in its own container sandbox with only that filesystem mounted
- **Main channel** - Your private channel (self-chat) for admin control; every other group is completely isolated
- **Scheduled tasks** - Recurring jobs that run Claude and can message you back
- **Web access** - Search and fetch content
- **Container isolation** - Agents sandboxed in Docker containers
- **Agent Swarms** - Spin up teams of specialized agents that collaborate on complex tasks (first personal AI assistant to support this)
- **Optional integrations** - Add Gmail (`/add-gmail`) and more via skills

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am (has access to my Obsidian vault folder)
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your self-chat), you can manage groups and tasks:
```
@Andy list all scheduled tasks across groups
@Andy pause the Monday briefing task
@Andy join the Family Chat group
```

## Customizing

There are no configuration files to learn. Just tell Claude Code what you want:

- "Change the trigger word to @Bob"
- "Remember in the future to make responses shorter and more direct"
- "Add a custom greeting when I say good morning"
- "Store conversation summaries weekly"

Or run `/customize` for guided changes.

The codebase is small enough that Claude can safely modify it.

## Contributing

**Don't add features. Add skills.**

If you want to add Telegram support, don't create a PR that adds Telegram alongside Signal. Instead, contribute a skill file (`.claude/skills/add-telegram/SKILL.md`) that teaches Claude Code how to transform a NanoClaw installation to use Telegram.

Users then run `/add-telegram` on their fork and get clean code that does exactly what they need, not a bloated system trying to support every use case.

### RFS (Request for Skills)

Skills we'd love to see:

**Communication Channels**
- `/add-telegram` - Add Telegram as channel. Should give the user option to replace Signal or add as additional channel. Also should be possible to add it as a control channel (where it can trigger actions) or just a channel that can be used in actions triggered elsewhere
- `/add-slack` - Add Slack
- `/add-discord` - Add Discord

**Platform Support**
- `/setup-windows` - Windows via WSL2 + Docker

**Session Management**
- `/add-clear` - Add a `/clear` command that compacts the conversation (summarizes context while preserving critical information in the same session). Requires figuring out how to trigger compaction programmatically via the Claude Agent SDK.

## Requirements

- macOS or Linux
- Node.js 20+
- [Docker](https://docker.com/products/docker-desktop) (required for signal-cli-rest-api and agent runtime)
- [Claude Code](https://claude.ai/download)

## Setup

Run `/setup` to configure everything. The setup will:
1. Install dependencies
2. Configure authentication (Claude Code token or Anthropic API key)
3. Set up Signal connection
4. Create required configuration files

### Environment Variables

The setup creates a `.env` file with these required variables:
- `SIGNAL_PHONE_NUMBER`: Your Signal phone number in E.164 format (e.g., `+14155551234`)
- `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`: Your Claude authentication

### Start Services

```bash
docker compose up -d
```

This starts both the Signal API and NanoClaw services.

### Register Your Main Channel

After setup, run `/setup` again to register your main channel. This is typically your "Note to Self" chat in Signal.

### Test

Send a message from your registered Signal chat. The agent will respond in the same chat.

## Architecture

```
Signal (signal-cli-rest-api webhook) --> SQLite --> Polling loop --> Container (Claude Agent SDK) --> Response
```

Single Node.js process. Agents execute in isolated Linux containers with mounted directories. Per-group message queue with concurrency control. IPC via filesystem.

Key files:
- `src/index.ts` - Orchestrator: state, message loop, agent invocation
- `src/channels/signal.ts` - Signal webhook receiver and REST sender
- `src/ipc.ts` - IPC watcher and task processing
- `src/router.ts` - Message formatting and outbound routing
- `src/group-queue.ts` - Per-group queue with global concurrency limit
- `src/container-runner.ts` - Spawns streaming agent containers
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations (messages, groups, sessions, state)
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Why Signal?**

It's open source, has strong encryption, and signal-cli-rest-api provides a clean REST/webhook interface. No reverse-engineering proprietary protocols.

**Why Docker?**

Docker is the only container runtime needed. It handles both the Signal API service and the agent runtime, providing consistent behavior across macOS and Linux.

**Can I run this on Linux?**

Yes. Run `/setup` and it will automatically configure Docker as the container runtime. Thanks to [@dotsetgreg](https://github.com/dotsetgreg) for contributing the `/convert-to-docker` skill.

**Is this secure?**

Agents run in containers, not behind application-level permission checks. They can only access explicitly mounted directories. You should still review what you're running, but the codebase is small enough that you actually can. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize it to so that the code matches exactly what they want rather than configuring a generic system. If you like having config files, tell Claude to add them.

**How do I debug issues?**

Ask Claude Code. "Why isn't the scheduler running?" "What's in the recent logs?" "Why did this message not get a response?" That's the AI-native approach.

**Common issues:**
- Service not starting: Check `logs/nanoclaw.log`
- Signal not linked: Verify at `http://localhost:8080/v1/about`
- No response: Check that the chat is registered

**Why isn't the setup working for me?**

I don't know. Run `claude`, then run `/debug`. If claude finds an issue that is likely affecting other users, open a PR to modify the setup SKILL.md.

**What changes will be accepted into the codebase?**

Security fixes, bug fixes, and clear improvements to the base configuration. That's it.

Everything else (new capabilities, OS compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets every user customize their installation without inheriting features they don't want.

## Community

Questions? Ideas? [Join the Discord](https://discord.gg/VGWXrf8x).

## License

MIT
