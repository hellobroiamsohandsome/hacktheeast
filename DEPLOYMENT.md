# ReadFluent – Vercel deployment

This document lists the environment variables to configure in the Vercel dashboard so the app runs correctly after deployment.

## Build

The project uses the default Next.js build:

- **Build Command:** `next build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

No extra build settings are required.

---

## Environment variables

In the Vercel project: **Settings → Environment Variables**, add the following. Use the same names and paste your values. You can leave optional ones blank for fallback-only mode.

| Variable | Required | Description |
|----------|----------|-------------|
| `USE_LIVE_PROVIDERS` | No | Set to `true` to enable Exa + MiniMax live enrichment. Omit or set to `false` for fallback-only (safe for demo). |
| `EXA_API_KEY` | If using live | Your Exa AI API key (used for topic hints when `USE_LIVE_PROVIDERS=true`). |
| `MINIMAX_API_KEY` | If using live | Your MiniMax API key (used for structured content when `USE_LIVE_PROVIDERS=true`). |
| `MINIMAX_LLM_ENDPOINT` | If using live | Full MiniMax chat/completion endpoint URL (e.g. your account’s text API URL). |
| `FEATHERLESS_API_KEY` | No | Featherless.ai API key; reserved for future use. |
| `BEDROCK_AGENT_ID` | No | AWS Bedrock AgentCore agent ID. When set, `/api/process-content` calls this agent first (see `bedrock-agent/README.md`). |
| `BEDROCK_AGENT_ALIAS_ID` | No | Agent alias (default `TSTALIASID`). |
| `AWS_REGION` | No | AWS region for Bedrock (e.g. `us-east-1`). |

### Example (fallback-only, no keys)

Leave all variables empty. The app will run in fallback mode and the debug badge will show **Fallback Mode**.

### Example (live providers)

1. `USE_LIVE_PROVIDERS` = `true`
2. `EXA_API_KEY` = your Exa key
3. `MINIMAX_API_KEY` = your MiniMax key
4. `MINIMAX_LLM_ENDPOINT` = your MiniMax LLM endpoint URL

### Example (AWS Bedrock AgentCore)

If you deploy the Python agent in `bedrock-agent/` with the AgentCore CLI (`agentcore configure` + `agentcore launch`), set:

1. `BEDROCK_AGENT_ID` = the Agent ID printed after `agentcore launch`
2. `BEDROCK_AGENT_ALIAS_ID` = `TSTALIASID` (or your alias)
3. `AWS_REGION` = the region you deployed to (e.g. `us-east-1`)

The Next.js app will then call the Bedrock agent for content processing; the UI shows an **AWS Bedrock AgentCore** badge when the response comes from the agent. See `bedrock-agent/README.md` for agent setup.

Redeploy after changing environment variables so the new values are applied.

---

## Deploy steps

1. Push the repo to GitHub (or connect your Git provider in Vercel).
2. In Vercel: **Add New Project** → import this repository.
3. Leave Framework Preset as **Next.js** and build/output as default.
4. Add the environment variables above under **Environment Variables**.
5. Deploy. The first deployment will run `npm install` and `next build`.

After deployment, open the project URL and paste a YouTube or article URL, then click **Generate Lesson** to test.
