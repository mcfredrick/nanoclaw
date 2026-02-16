---
name: openrouter-setup
nd: Guide new users to configure OpenRouter as the inference provider for NanoClaw agents, automating all steps the agent can perform.
---

# OpenRouter Setup for NanoClaw (Automated)

This skill walks a user through configuring NanoClaw to use **OpenRouter** as the backend for Claude Code and other agents. The agent will perform every step that does not require user secrets or confirmation, leaving only the actions the user must do.

## Prerequisites
- An OpenRouter account with an API key (the user must provide this).
- Docker (required by NanoClaw).
- Access to the NanoClaw repository on your machine.

## Steps
1. **User provides OpenRouter API key**
   - The user must obtain an API key from https://openrouter.ai and share it with the assistant.

2. **Agent adds the key to the environment**
   - The agent will append `OPENROUTER_API_KEY=sk-<your-key>` to `.env` and verify it.

3. **Agent configures NanoClaw to use OpenRouter**
   - The agent will edit `src/config.ts` (or the appropriate config file) to set the `inferenceProvider` block:
   ```ts
   export const inferenceProvider = {
     name: "openrouter",
     baseUrl: "https://openrouter.ai/api/v1",
     model: "claude-opus-4-6",
   };
   ```

4. **Agent rebuilds the container**
   - The agent will run:
   ```bash
   docker compose build
   docker compose up -d
   ```

5. **Agent verifies the connection**
   - Inside the running container the agent will execute a quick test to ensure the API key works and a model can be called.
   ```bash
   docker exec -it nanoclaw /bin/sh -c "node -e \"require('./src/index').testOpenRouter();\""
   ```

6. **Optional: Agent sets a default Claude model**
   - The agent can add `export const defaultClaudeModel = "claude-opus-4-6";` to `src/config.ts`.

7. **User confirmation**
   - Once the agent reports success, the user can start a test conversation in Signal to confirm the new provider works.

## FAQ
- **What if I already have another provider configured?**
  The `inferenceProvider` block overwrites any previous settings. The old block can be left commented for reference.

- **How do I change the model later?**
  Edit the `model` field in `src/config.ts` and rebuild the container.

- **Can I use multiple providers?**
  Yes, but that requires additional routing logic not covered by this simple skill.

## Next Steps
- Run a test message in your registered Signal chat.
- If anything fails, invoke the `/debug` skill to inspect container logs.

---

**Note:** The agent will perform all automated steps using its available tools. The only manual step is providing the OpenRouter API key.
