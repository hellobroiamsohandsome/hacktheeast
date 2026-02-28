# ReadFluent Bedrock AgentCore Agent

This folder contains the Python agent that runs on **AWS Bedrock AgentCore**. It receives requests from the Next.js `/api/process-content` route, calls the MiniMax API for translation/adaptation, and returns structured content (title, transcript, flashcards) for ReadFluent.

## 1. Install dependencies

From this directory (or with `-r` from project root):

```bash
pip install -r requirements.txt
```

Or:

```bash
pip install bedrock-agentcore bedrock-agentcore-starter-toolkit requests youtube-transcript-api beautifulsoup4
```

## 2. Fix “agentcore: command not found” (macOS / zsh)

After `pip install`, the shell may not find the `agentcore` executable. Use one of these:

**Option A – Add user bin to PATH (then use `agentcore` as below):**

```bash
export PATH="$HOME/.local/bin:$PATH"
```

**Option B – Run via Python module (no PATH change):**

Use `python3 -m agentcore` instead of `agentcore` in the commands below, e.g.:

```bash
python3 -m agentcore configure -e my_agent.py
python3 -m agentcore launch --env MINIMAX_API_KEY=your_actual_minimax_api_key_here
```

**Option C – Use the full path:** Run `python3 -m site --user-base` and add `/bin` to that path; then run e.g. `$HOME/Library/Python/3.x/bin/agentcore` (replace `3.x` with your version).

## 3. Configure AWS AgentCore

Point the CLI at this agent file:

```bash
agentcore configure -e my_agent.py
```

If you use Option B above, run:

```bash
python3 -m agentcore configure -e my_agent.py
```

## 4. Deploy (launch) the agent

Pass your MiniMax API key as an environment variable. AWS will create the serverless runtime and return a **live Agent ID**.

```bash
agentcore launch --env MINIMAX_API_KEY=your_actual_minimax_api_key_here
```

With Option B:

```bash
python3 -m agentcore launch --env MINIMAX_API_KEY=your_actual_minimax_api_key_here
```

When the command finishes, **copy the printed Agent ID** and put it in `.env.local` as `BEDROCK_AGENT_ID`.

## 5. Wire Next.js to the agent

In your `.env.local` (see project root `.env.local.example`), set:

- `BEDROCK_AGENT_ID` = the Agent ID from step 3  
- `BEDROCK_AGENT_ALIAS_ID` = usually `TSTALIASID` (default test alias)  
- `AWS_REGION` = e.g. `us-east-1` (must match the region you deployed to)

Ensure your AWS credentials are configured (e.g. `aws configure` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in the environment). Then the Next.js app will call this agent when processing content, and the UI will show the Bedrock-powered response.

## AWS credentials (optional help)

To authenticate the `agentcore launch` command:

1. Install AWS CLI: `pip install awscli` or use the official installer.
2. Run `aws configure` and enter your Access Key ID, Secret Access Key, and default region (e.g. `us-east-1`).
3. Or set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in your environment before running `agentcore launch`.
