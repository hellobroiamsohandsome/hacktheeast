import { NextResponse } from "next/server";
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { ProcessedContent } from "@/app/types/processed-content";

type ContentType = "video" | "article";

interface ProcessContentBody {
  url: string;
  type: ContentType;
  cefrLevel: string;
  isChildMode: boolean;
}

interface ProviderConfig {
  useLiveProviders: boolean;
  exaApiKey?: string;
  minimaxApiKey?: string;
  featherlessApiKey?: string;
  minimaxEndpoint?: string;
  /** AWS Bedrock AgentCore – when set, we try this first before fallback/MiniMax. */
  bedrockAgentId?: string;
  bedrockAgentAliasId?: string;
  awsRegion?: string;
}

function getProviderConfig(): ProviderConfig {
  return {
    useLiveProviders: process.env.USE_LIVE_PROVIDERS === "true",
    exaApiKey: process.env.EXA_API_KEY,
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    featherlessApiKey: process.env.FEATHERLESS_API_KEY,
    minimaxEndpoint: process.env.MINIMAX_LLM_ENDPOINT,
    bedrockAgentId: process.env.BEDROCK_AGENT_ID,
    bedrockAgentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID ?? "TSTALIASID",
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
  };
}

const CEFR_DESCRIPTORS: Record<string, string> = {
  A1: "very basic",
  A2: "basic",
  B1: "intermediate",
  B2: "upper-intermediate",
  C1: "advanced",
  C2: "near-native",
};

function extractHostName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "web-source";
  }
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").slice(0, 11);
    }
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      return v ? v.slice(0, 11) : null;
    }
  } catch {
    return null;
  }
  return null;
}

function titleCase(word: string): string {
  return word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word;
}

function deriveTopicsFromUrl(url: string): string[] {
  const seed = url
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2);

  const stopWords = new Set([
    "www",
    "com",
    "org",
    "net",
    "youtube",
    "watch",
    "video",
    "article",
    "index",
    "html",
    "the",
    "and",
    "for",
    "with",
  ]);

  const candidates = seed
    .filter((token) => !stopWords.has(token))
    .map(titleCase);

  const unique: string[] = [];
  for (const token of candidates) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length === 3) break;
  }

  if (unique.length === 0) {
    return ["Language Learning", "Current Events", "Reading Skills"];
  }
  return unique;
}

function applyChildModeFilter(text: string): string {
  return text
    .replace(/war/gi, "conflict")
    .replace(/violence/gi, "harmful content")
    .replace(/weapon/gi, "unsafe object");
}

async function fetchExaTopicHints(url: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) return [];

  try {
    // Optional best-effort call. Safe fallback to local heuristics on any failure.
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: url,
        numResults: 3,
        useAutoprompt: true,
      }),
    });

    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{ title?: string }>;
    };
    const hints =
      data.results
        ?.map((result) => result.title?.trim())
        .filter((value): value is string => Boolean(value))
        .slice(0, 3) ?? [];
    return hints;
  } catch {
    return [];
  }
}

function compactJson<T>(value: T): string {
  return JSON.stringify(value, null, 0);
}

function normalizeTopicCandidates(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    normalized.push(trimmed);
    if (normalized.length >= 5) break;
  }
  return normalized;
}

type MinimaxStructuredOutput = Partial<ProcessedContent> & {
  detectedTopics?: string[];
};

async function fetchMiniMaxStructuredContent(
  body: ProcessContentBody,
  topics: string[],
  providers: ProviderConfig
): Promise<MinimaxStructuredOutput | null> {
  if (!providers.useLiveProviders) return null;
  if (!providers.minimaxApiKey || !providers.minimaxEndpoint) return null;

  const systemPrompt = [
    "You are a strict JSON generator for a language-learning app.",
    "Return only valid JSON with keys:",
    "title, detectedTopics, ambientVideoCue, transcript, flashcards.",
    "transcript is an array with id, timestamp(optional), text, translatedText, shadowingAudioUrl(optional).",
    "flashcards is an array with word, context, definition, imageUrl.",
    "No markdown, no explanation, no extra keys.",
  ].join(" ");

  const userPrompt = {
    url: body.url,
    type: body.type,
    cefrLevel: body.cefrLevel,
    isChildMode: body.isChildMode,
    topics,
    constraints: {
      transcriptCount: 5,
      flashcardCount: 4,
      childMode: "if true, aggressively remove unsafe content",
    },
  };

  try {
    // NOTE: endpoint shape can vary by MiniMax account/version.
    // This payload is intentionally conservative and gracefully falls back on failure.
    const response = await fetch(providers.minimaxEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providers.minimaxApiKey}`,
        "Content-Type": "application/json",
      },
      body: compactJson({
        model: "MiniMax-Text-01",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: compactJson(userPrompt) },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
    };

    const rawText =
      payload.output_text ??
      payload.choices?.[0]?.message?.content ??
      "";
    if (!rawText) return null;

    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(rawText.slice(start, end + 1)) as MinimaxStructuredOutput;
    return parsed;
  } catch {
    return null;
  }
}

function mergeWithStructuredOutput(
  fallback: ProcessedContent,
  structured: MinimaxStructuredOutput | null
): ProcessedContent {
  if (!structured) return fallback;

  const transcript = Array.isArray(structured.transcript)
    ? structured.transcript
        .filter((row) => row && typeof row.id === "string" && typeof row.text === "string")
        .slice(0, 8)
    : fallback.transcript;
  const flashcards = Array.isArray(structured.flashcards)
    ? structured.flashcards
        .filter(
          (row) =>
            row &&
            typeof row.word === "string" &&
            typeof row.context === "string" &&
            typeof row.definition === "string" &&
            typeof row.imageUrl === "string"
        )
        .slice(0, 8)
    : fallback.flashcards;

  const detectedTopics = Array.isArray(structured.detectedTopics)
    ? normalizeTopicCandidates(
        structured.detectedTopics.filter((topic): topic is string => typeof topic === "string")
      ).slice(0, 5)
    : fallback.detectedTopics;

  return {
    ...fallback,
    title:
      typeof structured.title === "string" && structured.title.trim()
        ? structured.title.trim()
        : fallback.title,
    ambientVideoCue:
      typeof structured.ambientVideoCue === "string" && structured.ambientVideoCue.trim()
        ? structured.ambientVideoCue.trim()
        : fallback.ambientVideoCue,
    detectedTopics: detectedTopics.length > 0 ? detectedTopics : fallback.detectedTopics,
    transcript: transcript.length > 0 ? transcript : fallback.transcript,
    flashcards: flashcards.length > 0 ? flashcards : fallback.flashcards,
  };
}

/** Raw shape returned by our Bedrock AgentCore agent (Python my_agent.py). */
interface BedrockAgentPayload {
  result?: {
    title?: string;
    detectedTopics?: string[];
    mediaUrl?: string;
    ambientVideoCue?: string;
    transcript?: Array<{
      id?: string;
      timestamp?: string;
      text?: string;
      translatedText?: string;
    }>;
    flashcards?: Array<{
      word?: string;
      context?: string;
      definition?: string;
      imageUrl?: string;
    }>;
  };
  error?: string;
}

async function invokeBedrockAgent(
  payload: { url: string; type: ContentType; cefrLevel: string; isChildMode: boolean },
  config: { bedrockAgentId: string; bedrockAgentAliasId: string; awsRegion: string }
): Promise<BedrockAgentPayload | null> {
  try {
    const client = new BedrockAgentRuntimeClient({ region: config.awsRegion });
    const sessionId = `readfluent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const inputText = JSON.stringify(payload);

    const command = new InvokeAgentCommand({
      agentId: config.bedrockAgentId,
      agentAliasId: config.bedrockAgentAliasId,
      sessionId,
      inputText,
    });

    const response = await client.send(command);
    let resultString = "";

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes && event.chunk.bytes.length > 0) {
          resultString += new TextDecoder().decode(event.chunk.bytes);
        }
      }
    }

    if (!resultString.trim()) return null;
    const parsed = JSON.parse(resultString) as BedrockAgentPayload;
    return parsed;
  } catch (err) {
    console.error("Bedrock AgentCore invoke error:", err);
    return null;
  }
}

function normalizeBedrockResponse(
  agentPayload: BedrockAgentPayload,
  url: string,
  type: ContentType
): ProcessedContent | null {
  const result = agentPayload.result;
  if (!result || agentPayload.error) return null;

  const detectedTopics = Array.isArray(result.detectedTopics)
    ? normalizeTopicCandidates(
        result.detectedTopics.filter((t): t is string => typeof t === "string")
      ).slice(0, 5)
    : deriveTopicsFromUrl(url);

  const transcript = Array.isArray(result.transcript)
    ? result.transcript
        .filter((row) => row && typeof (row as { text?: string }).text === "string")
        .slice(0, 12)
        .map((row, index) => ({
          id: typeof (row as { id?: string }).id === "string" ? (row as { id: string }).id : `t${index + 1}`,
          timestamp: (row as { timestamp?: string }).timestamp,
          text: (row as { text: string }).text,
          translatedText:
            typeof (row as { translatedText?: string }).translatedText === "string"
              ? (row as { translatedText: string }).translatedText
              : (row as { text: string }).text,
        }))
    : [];

  const defaultImageUrl = "https://dummyimage.com/320x180/e4e4e7/27272a&text=vocab";
  const flashcards = Array.isArray(result.flashcards)
    ? result.flashcards
        .filter(
          (row) =>
            row &&
            typeof (row as { word?: string }).word === "string" &&
            typeof (row as { context?: string }).context === "string" &&
            typeof (row as { definition?: string }).definition === "string"
        )
        .slice(0, 10)
        .map((row) => ({
          word: (row as { word: string }).word,
          context: (row as { context: string }).context,
          definition: (row as { definition: string }).definition,
          imageUrl:
            typeof (row as { imageUrl?: string }).imageUrl === "string" && (row as { imageUrl: string }).imageUrl
              ? (row as { imageUrl: string }).imageUrl
              : defaultImageUrl,
        }))
    : [];

  const mediaUrl =
    typeof result.mediaUrl === "string" && result.mediaUrl.trim()
      ? result.mediaUrl.trim()
      : type === "video"
        ? url
        : url;

  const title =
    typeof result.title === "string" && result.title.trim()
      ? result.title.trim()
      : `ReadFluent Lesson from ${extractHostName(url)}`;

  const ambientVideoCue =
    typeof result.ambientVideoCue === "string" && result.ambientVideoCue.trim()
      ? result.ambientVideoCue.trim()
      : `3-second seamless loop inspired by ${detectedTopics.join(", ") || "learning"}`;

  return {
    title,
    detectedTopics,
    mediaUrl,
    ambientVideoCue,
    transcript: transcript.length > 0 ? transcript : [
      { id: "t1", text: title, translatedText: title },
    ],
    flashcards: flashcards.length > 0 ? flashcards : [],
    dataSource: "bedrock",
  };
}

function buildMockResponse(
  body: ProcessContentBody,
  exaHints: string[] = []
): ProcessedContent {
  const level = CEFR_DESCRIPTORS[body.cefrLevel.toUpperCase()] ?? "intermediate";
  const hostName = extractHostName(body.url);
  const derivedTopics = deriveTopicsFromUrl(body.url);
  const detectedTopics =
    exaHints.length > 0
      ? [...exaHints.slice(0, 2), ...derivedTopics].slice(0, 3)
      : derivedTopics;

  const transcriptBase = [
    "This lesson helps you understand the source content step by step.",
    `The language is adapted to a ${level} CEFR reading level.`,
    "You can shadow these lines to improve pronunciation and rhythm.",
    "Notice how key vocabulary appears naturally in context.",
    "Finish with a short debate to reinforce speaking confidence.",
  ];

  const transcript = transcriptBase.map((line, index) => {
    const maybeFiltered = body.isChildMode ? applyChildModeFilter(line) : line;
    return {
      id: `t${index + 1}`,
      timestamp: body.type === "video" ? `0:${String(index * 6).padStart(2, "0")}` : undefined,
      text: maybeFiltered,
      translatedText: `[Translation Placeholder] ${maybeFiltered}`,
      shadowingAudioUrl: `/audio/slow-${index + 1}.mp3`,
    };
  });

  const flashcards = [
    {
      word: "adaptive",
      context: transcript[0]?.text ?? "This lesson adapts to your level.",
      definition: "able to change based on different conditions",
      imageUrl: "https://dummyimage.com/320x180/e4e4e7/27272a&text=adaptive",
    },
    {
      word: "context",
      context: transcript[3]?.text ?? "Vocabulary is easier in context.",
      definition: "the situation that gives meaning to words or events",
      imageUrl: "https://dummyimage.com/320x180/e4e4e7/27272a&text=context",
    },
    {
      word: "pronunciation",
      context: transcript[2]?.text ?? "Practice improves pronunciation.",
      definition: "the way a word is spoken",
      imageUrl: "https://dummyimage.com/320x180/e4e4e7/27272a&text=pronunciation",
    },
    {
      word: "debate",
      context: transcript[4]?.text ?? "Debate strengthens speaking skills.",
      definition: "a discussion where ideas are argued and evaluated",
      imageUrl: "https://dummyimage.com/320x180/e4e4e7/27272a&text=debate",
    },
  ];

  const mediaUrl =
    body.type === "video"
      ? extractYouTubeId(body.url) ?? "dQw4w9WgXcQ"
      : `https://dummyimage.com/1280x720/e4e4e7/27272a&text=${encodeURIComponent(hostName)}`;

  return {
    title: `ReadFluent Lesson from ${hostName}`,
    detectedTopics,
    mediaUrl,
    ambientVideoCue: `3-second seamless loop inspired by ${detectedTopics.join(", ")} with calm cinematic lighting`,
    transcript,
    flashcards,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const { url, type, cefrLevel, isChildMode } = body as ProcessContentBody;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'url'" },
        { status: 400 }
      );
    }
    if (!type || (type !== "video" && type !== "article")) {
      return NextResponse.json(
        { error: "Missing or invalid 'type' (must be 'video' or 'article')" },
        { status: 400 }
      );
    }
    if (typeof cefrLevel !== "string" || !cefrLevel.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'cefrLevel'" },
        { status: 400 }
      );
    }
    if (typeof isChildMode !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid 'isChildMode' (must be boolean)" },
        { status: 400 }
      );
    }

    const providers = getProviderConfig();
    const hasExa = Boolean(providers.exaApiKey);
    const hasMinimax = Boolean(providers.minimaxApiKey);
    const hasFeatherless = Boolean(providers.featherlessApiKey);

    // -------------------------------------------------------------------------
    // TODO: AWS Bedrock – Orchestration and content extraction
    // - Call Bedrock to orchestrate the pipeline.
    // - URL scraping: fetch and parse the given URL (article or YouTube).
    // - YouTube: extract video ID, then use Bedrock/transcription service to get
    //   transcript text. Article: scrape main text content.
    // - Pass raw text and metadata to the next steps.
    // - Suggested implementation:
    //   1) Guard with required key checks.
    //   2) Call Bedrock with a deterministic orchestration prompt.
    //   3) Return normalized transcript segments for downstream providers.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // TODO: MiniMax LLM – Adaptation and extraction
    // - Adapt the extracted text to the requested CEFR level (cefrLevel).
    // - Extract vocabulary list for flashcards (word, context, definition).
    // - Extract high-level topics from the content for detectedTopics (interest tracker).
    // - If isChildMode === true: aggressively filter content (remove adult themes,
    //   violence, etc.) and optionally simplify further for child safety.
    // - Suggested implementation:
    //   1) System prompt includes CEFR + target language + safety policy.
    //   2) Use JSON-mode output for deterministic parsing.
    //   3) Enforce strict moderation branch when child mode is enabled.
    //
    // Example sketch (disabled until endpoint contract is finalized):
    // if (hasMinimax) {
    //   await fetch("https://api.minimax.chat/v1/...", {
    //     method: "POST",
    //     headers: {
    //       Authorization: `Bearer ${providers.minimaxApiKey}`,
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({ ...payload }),
    //   });
    // }
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // TODO: MiniMax Audio – Voice and ambient
    // - Generate native-speaker voiceover for each transcript segment (or full transcript).
    // - Generate slowed-down shadowing audio per segment (shadowingAudioUrl).
    // - Generate ambient focus music/audio for the "Ambient Focus Video/Music" toggle.
    // - Suggested implementation:
    //   1) Batch transcript segments to parallel TTS calls.
    //   2) Persist generated asset URLs to object storage.
    //   3) Return signed URLs as shadowingAudioUrl values.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // TODO: MiniMax Video – Background loop
    // - From the article/video text (or summary), generate a short prompt describing
    //   a 3-second contextual background loop (e.g. for ambient focus).
    // - Store or return this as ambientVideoCue; downstream can generate or fetch
    //   the actual video from this prompt.
    // - Suggested implementation:
    //   1) Generate a concise scene prompt from the topic summary.
    //   2) Request 3-second seamless loop render.
    //   3) Return render URL plus prompt metadata for reproducibility.
    // -------------------------------------------------------------------------

    if (!providers.useLiveProviders || !hasMinimax || !hasExa || !hasFeatherless) {
      // Keep MVP functional with mocks while external providers are not fully wired.
      console.info(
        "ReadFluent API: using fallback-first response (live providers disabled or partially configured)."
      );
    }

    const normalizedBody: ProcessContentBody = {
      url: url.trim(),
      type,
      cefrLevel: cefrLevel.trim(),
      isChildMode,
    };

    // When BEDROCK_AGENT_ID is set, call AWS Bedrock AgentCore first (Python agent + MiniMax).
    if (
      providers.bedrockAgentId &&
      providers.bedrockAgentAliasId &&
      providers.awsRegion
    ) {
      const agentPayload = await invokeBedrockAgent(
        {
          url: normalizedBody.url,
          type: normalizedBody.type,
          cefrLevel: normalizedBody.cefrLevel,
          isChildMode: normalizedBody.isChildMode,
        },
        {
          bedrockAgentId: providers.bedrockAgentId,
          bedrockAgentAliasId: providers.bedrockAgentAliasId,
          awsRegion: providers.awsRegion,
        }
      );
      const bedrockContent = agentPayload
        ? normalizeBedrockResponse(agentPayload, normalizedBody.url, normalizedBody.type)
        : null;
      if (bedrockContent) {
        return NextResponse.json(bedrockContent, { status: 200 });
      }
      // Fall through to Exa + MiniMax / mock if Bedrock failed or returned invalid data.
    }

    const exaHints = await fetchExaTopicHints(normalizedBody.url, providers.exaApiKey);
    const fallbackData = buildMockResponse(normalizedBody, exaHints);
    const minimaxStructured = await fetchMiniMaxStructuredContent(
      normalizedBody,
      fallbackData.detectedTopics,
      providers
    );
    const responseData = mergeWithStructuredOutput(fallbackData, minimaxStructured);

    const exaUsed = exaHints.length > 0;
    const minimaxUsed = minimaxStructured !== null;
    const dataSource: "live" | "partial_exa" | "partial_minimax" | "fallback" =
      minimaxUsed && exaUsed
        ? "live"
        : exaUsed && !minimaxUsed
          ? "partial_exa"
          : minimaxUsed && !exaUsed
            ? "partial_minimax"
            : "fallback";

    return NextResponse.json(
      { ...responseData, dataSource },
      { status: 200 }
    );
  } catch (err) {
    console.error("process-content error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
