"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import YouTube, { type YouTubePlayer } from "react-youtube";
import type {
  ProcessedContent,
  DataSourceStatus,
} from "@/app/types/processed-content";

/** String similarity (0–1) using Levenshtein distance; used for pronunciation grading. */
function stringSimilarity(a: string, b: string): number {
  const sa = a.trim().toLowerCase();
  const sb = b.trim().toLowerCase();
  if (sa.length === 0 && sb.length === 0) return 1;
  if (sa.length === 0 || sb.length === 0) return 0;
  const lenA = sa.length;
  const lenB = sb.length;
  const dp: number[][] = Array(lenA + 1)
    .fill(0)
    .map(() => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(lenA, lenB);
  return 1 - dp[lenA][lenB] / maxLen;
}

/** Word-level match percentage (0–100); good for sentence pronunciation. */
function pronunciationScore(target: string, spoken: string): number {
  const t = target.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const s = spoken.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (t.length === 0) return 100;
  let matches = 0;
  for (let i = 0; i < t.length; i++) {
    if (s[i] != null && stringSimilarity(t[i], s[i]) >= 0.8) matches++;
  }
  return Math.round((matches / t.length) * 100);
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent!";
  if (score >= 80) return "Great!";
  if (score >= 70) return "Good";
  if (score >= 50) return "Keep practicing";
  return "Try again";
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const TABS = [
  { id: "media", label: "Interactive Media" },
  { id: "shadowing", label: "Shadowing Studio" },
  { id: "flashcards", label: "Smart Flashcards" },
  { id: "debrief", label: "AI Voice Debrief" },
  { id: "lounge", label: "Echo Lounge" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function getYouTubeVideoId(mediaUrl: string): string | null {
  try {
    if (mediaUrl.includes("youtube.com/watch?v=")) {
      const u = new URL(mediaUrl);
      const v = u.searchParams.get("v");
      return v ? v.slice(0, 11) : null;
    }
    if (mediaUrl.includes("youtu.be/")) {
      const u = new URL(mediaUrl);
      const id = u.pathname.slice(1).split("/")[0];
      return id ? id.slice(0, 11) : null;
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(mediaUrl)) {
      return mediaUrl;
    }
  } catch {
    return null;
  }
  return null;
}

/** Parse "M:SS" or "H:MM:SS" to seconds for YouTube seekTo. */
function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] ?? 0;
}

const DATA_SOURCE_BADGE: Record<
  DataSourceStatus,
  { label: string; className: string }
> = {
  live: {
    label: "Live: MiniMax + Exa",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700",
  },
  bedrock: {
    label: "AWS Bedrock AgentCore",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200 dark:border-violet-700",
  },
  partial_exa: {
    label: "Partial: Exa Only",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-700",
  },
  partial_minimax: {
    label: "Partial: MiniMax Only",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-700",
  },
  fallback: {
    label: "Fallback Mode",
    className:
      "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-600",
  },
};

function DataSourceBadge({ status }: { status: DataSourceStatus }) {
  const config = DATA_SOURCE_BADGE[status];
  const dot =
    status === "live"
      ? "🟢"
      : status === "bedrock"
        ? "🟣"
        : status === "fallback"
          ? "🔴"
          : "🟡";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.className}`}
      title={`Data source: ${config.label}`}
    >
      <span aria-hidden>{dot}</span>
      {config.label}
    </span>
  );
}

export default function Home() {
  // ─── Step 1: Core state management ───────────────────────────────────────
  /** Holds the data returned from POST /api/process-content. Drives all tabs. */
  const [content, setContent] = useState<ProcessedContent | null>(null);
  /** Manages the loading spinner during process-content request. */
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [childMode, setChildMode] = useState(false);
  const [cefrLevel, setCefrLevel] = useState<string>("B2");
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const [urlInput, setUrlInput] = useState("");
  const [contentType, setContentType] = useState<"video" | "article">("video");
  const [ambientFocus, setAmbientFocus] = useState(false);
  const [flippedCardIndex, setFlippedCardIndex] = useState<number | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  /** Debrief chat history; reset when a new lesson is generated. */
  const [debriefMessages, setDebriefMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [debriefInput, setDebriefInput] = useState("");
  const [debriefLanguage, setDebriefLanguage] = useState("English");
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);

  /** Echo Lounge match status; reset when a new lesson is generated. */
  const [loungeMatchStatus, setLoungeMatchStatus] = useState<
    "idle" | "matching" | "matched"
  >("idle");

  // Feature: Focus Mode (Interactive Media) – full viewport immersive mode
  const [focusMode, setFocusMode] = useState(false);
  // Feature: Quick-Add to Flashcards – selection from transcript
  const [quickAddSelection, setQuickAddSelection] = useState<{
    word: string;
    context: string;
    segId: string;
  } | null>(null);
  // Feature: Live Pronunciation Grading (Shadowing) – which segment is recording, last score
  const [shadowingRecordingSegId, setShadowingRecordingSegId] = useState<string | null>(null);
  const [shadowingScoreBySegId, setShadowingScoreBySegId] = useState<Record<string, { score: number; label: string }>>({});

  const trackedTopics = content?.detectedTopics ?? [];
  const youtubeVideoId = content ? getYouTubeVideoId(content.mediaUrl) : null;
  const showVideo = youtubeVideoId !== null;

  // ─── Step 2: handleGenerateLesson – wire UI to backend ───────────────────
  const handleGenerateLesson = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) {
      setError("Please enter a URL");
      return;
    }

    // Reset child states and clear previous content so UI reflects “new lesson”
    setContent(null);
    setDebriefMessages([]);
    setLoungeMatchStatus("idle");
    setFlippedCardIndex(null);
    setError(null);
    setFocusMode(false);
    setQuickAddSelection(null);
    setShadowingScoreBySegId({});

    setIsLoading(true);

    try {
      const res = await fetch("/api/process-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          type: contentType,
          cefrLevel,
          isChildMode: childMode,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }

      // Dynamically set content from API response; all tabs read from this state
      const payload = data?.data != null ? data.data : data;
      setContent(payload as ProcessedContent);
      setActiveTab("media");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [urlInput, contentType, cefrLevel, childMode]);

  function speakWithBrowserVoice(text: string, slow = false, lang?: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = slow ? 0.85 : 1;
    u.lang =
      lang ??
      (debriefLanguage.startsWith("Spanish")
        ? "es"
        : debriefLanguage.startsWith("French")
          ? "fr"
          : debriefLanguage.startsWith("Mandarin")
            ? "zh-CN"
            : debriefLanguage.startsWith("German")
              ? "de"
              : debriefLanguage.startsWith("Japanese")
                ? "ja"
                : "en");
    window.speechSynthesis.speak(u);
  }

  const handleDebriefSubmit = useCallback(async () => {
    const text = debriefInput.trim();
    if (!text || debriefLoading || !content) return;
    setDebriefInput("");
    setDebriefMessages((prev) => [...prev, { role: "user", content: text }]);
    setDebriefLoading(true);
    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          topic: content.title || (content.detectedTopics?.[0] ?? "this topic"),
          language: debriefLanguage,
        }),
      });
      const data = await res.json();
      const reply =
        res.ok && data.reply
          ? String(data.reply)
          : "I couldn't reply right now. Try again.";
      setDebriefMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch {
      setDebriefMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Network error. Try again.",
        },
      ]);
    } finally {
      setDebriefLoading(false);
    }
  }, [debriefInput, debriefLoading, content, debriefLanguage]);

  const toggleVoiceInput = useCallback(() => {
    if (voiceListening) {
      setVoiceListening(false);
      return;
    }
    const w = typeof window !== "undefined" ? window as unknown as { webkitSpeechRecognition?: new () => { start: () => void; onresult: (e: { results: { length: number; [i: number]: { transcript: string }; isFinal?: boolean } }) => void; onend: () => void; lang: string; continuous: boolean; interimResults: boolean }; SpeechRecognition?: new () => { start: () => void; onresult: (e: { results: { length: number; [i: number]: { transcript: string }; isFinal?: boolean } }) => void; onend: () => void; lang: string; continuous: boolean; interimResults: boolean } } : null;
    const SR = w?.webkitSpeechRecognition ?? w?.SpeechRecognition;
    if (!SR) {
      setDebriefInput((prev) => prev + " [Voice not supported in this browser]");
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: { results: { length: number; [i: number]: { transcript: string }; isFinal?: boolean } }) => {
      const results = e.results;
      const lastIdx = results.length - 1;
      const last = results[lastIdx] as { isFinal?: boolean; 0?: { transcript: string } } | undefined;
      const transcript = last?.[0]?.transcript;
      if (last?.isFinal && transcript) {
        setDebriefInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setVoiceListening(false);
    rec.start();
    setVoiceListening(true);
  }, [voiceListening]);

  const handleLoungeMatch = useCallback(() => {
    if (loungeMatchStatus !== "idle") return;
    setLoungeMatchStatus("matching");
    setTimeout(() => setLoungeMatchStatus("matched"), 2200);
  }, [loungeMatchStatus]);

  /** Feature 1: Live pronunciation grading – record and compare to target text. */
  const handleShadowingRecord = useCallback(
    (segId: string, targetText: string) => {
      type SRResult = { 0?: { transcript: string }; isFinal?: boolean };
      type SRResults = { length: number; [index: number]: SRResult };
      const w =
        typeof window !== "undefined"
          ? (window as unknown as {
              webkitSpeechRecognition?: new () => {
                start: () => void;
                stop: () => void;
                onresult: (e: { results: SRResults }) => void;
                onend: () => void;
                lang: string;
                continuous: boolean;
                interimResults: boolean;
              };
              SpeechRecognition?: new () => {
                start: () => void;
                stop: () => void;
                onresult: (e: { results: SRResults }) => void;
                onend: () => void;
                lang: string;
                continuous: boolean;
                interimResults: boolean;
              };
            })
          : null;
      const SR = w?.webkitSpeechRecognition ?? w?.SpeechRecognition;
      if (!SR) {
        setShadowingScoreBySegId((prev) => ({
          ...prev,
          [segId]: { score: 0, label: "Voice not supported" },
        }));
        return;
      }
      if (shadowingRecordingSegId != null) return;
      setShadowingRecordingSegId(segId);
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e: { results: SRResults }) => {
        const results = e.results;
        const lastIdx = results.length - 1;
        const last = results[lastIdx];
        const transcript = last?.[0]?.transcript ?? "";
        if (last?.isFinal && transcript) {
          const score = pronunciationScore(targetText, transcript);
          const label = getScoreLabel(score);
          setShadowingScoreBySegId((prev) => ({ ...prev, [segId]: { score, label } }));
        }
      };
      rec.onend = () => setShadowingRecordingSegId(null);
      rec.start();
    },
    [shadowingRecordingSegId]
  );

  /** Feature 2: Quick-Add to Flashcards – add selected word to content.flashcards. */
  const handleQuickAddFlashcard = useCallback(() => {
    if (!content || !quickAddSelection) return;
    const newCard = {
      word: quickAddSelection.word,
      context: quickAddSelection.context,
      definition: "Added from transcript",
      imageUrl: "/file.svg",
    };
    setContent({
      ...content,
      flashcards: [...(content.flashcards ?? []), newCard],
    });
    setQuickAddSelection(null);
  }, [content, quickAddSelection]);

  const statusText = childMode
    ? "Child Mode is active with stricter content filtering."
    : "Child Mode is off.";

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      {/* Header – hidden in Focus Mode */}
      {!focusMode && (
      <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-zinc-900/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#3B82F6] to-[#14B8A6] text-white shadow-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">ReadFluent</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <input
                type="checkbox"
                checked={childMode}
                onChange={(e) => setChildMode(e.target.checked)}
                className="sr-only peer"
              />
              <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-4 peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-600" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Digital Guardian Child Mode
              </span>
              {childMode && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  ON
                </span>
              )}
            </label>
            <span className="sr-only" role="status" aria-live="polite">
              {statusText}
            </span>
            <select
              value={cefrLevel}
              onChange={(e) => setCefrLevel(e.target.value)}
              aria-label="Select CEFR level"
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#3B82F6]/10 dark:bg-[#3B82F6]/20 px-3 py-1 text-xs font-medium text-[#3B82F6] dark:text-[#93C5FD]">
              Tracking: {trackedTopics.length ? trackedTopics.join(", ") : "—"}
            </span>
          </div>
        </div>
      </header>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Ingestion zone */}
        <section className="flex flex-col items-center gap-4 py-12">
          <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="url"
              placeholder="Paste YouTube or article URL"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) {
                  void handleGenerateLesson();
                }
              }}
              aria-label="Content URL"
              className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as "video" | "article")}
                aria-label="Select content type"
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
              >
                <option value="video">Video</option>
                <option value="article">Article</option>
              </select>
              <button
                onClick={() => void handleGenerateLesson()}
                disabled={isLoading}
                aria-busy={isLoading}
                className="rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#14B8A6] px-5 py-3 font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Generating…" : "Generate Lesson"}
              </button>
              {content?.dataSource && (
                <DataSourceBadge status={content.dataSource} />
              )}
            </div>
          </div>
          {isLoading && (
            <div className="flex w-full max-w-2xl items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 px-4 py-8">
              <svg
                className="h-6 w-6 animate-spin text-zinc-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Processing content…
              </span>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* Step 4: Conditional rendering – Learning Hub only when we have content or loading */}
        {isLoading && (
          <section className="space-y-6 animate-pulse" aria-busy="true">
            <div className="h-7 w-3/4 max-w-md rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex gap-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 p-1">
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className="h-9 flex-1 rounded-lg bg-zinc-200 dark:bg-zinc-700"
                />
              ))}
            </div>
            <div className="h-[420px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/50" />
          </section>
        )}

        {!isLoading && !content && (
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 p-12 text-center">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Generate a lesson to get started.
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Paste a YouTube or article URL above and click Generate Lesson.
            </p>
          </section>
        )}

        {!isLoading && content && (
          <section
            className="space-y-6"
            key={`hub-${content.title}-${content.mediaUrl}`}
            aria-label="Learning Hub"
          >
            <h2 className="text-xl font-semibold tracking-tight">{content.title}</h2>

            {/* Step 3: Tabs read from content state – transcript, flashcards, title, dataSource */}
            <div
              className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 p-1"
              role="tablist"
              aria-label="Learning hub tabs"
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-[#3B82F6] text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-[#3B82F6]/10 hover:text-[#3B82F6] dark:hover:text-[#93C5FD]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <AnimatePresence mode="wait">
              {activeTab === "media" && !focusMode && (
                <motion.div
                  key="media"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  id="panel-media"
                  role="tabpanel"
                  aria-label="Interactive Media"
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm"
                >
                  {/* Feature 3: Focus Mode toggle */}
                  <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Double-click a word in the transcript to add it to Smart Flashcards
                    </span>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs shadow-sm">
                      <input
                        type="checkbox"
                        checked={focusMode}
                        onChange={(e) => setFocusMode(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      Focus Mode
                    </label>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[420px] lg:min-h-[480px]">
                    {/* Left: Video / Article */}
                    <div className="relative flex flex-col min-h-[240px] lg:min-h-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="relative flex-1 min-h-0 aspect-video lg:aspect-auto">
                        {showVideo && youtubeVideoId ? (
                          <YouTube
                            videoId={youtubeVideoId}
                            className="absolute inset-0 h-full w-full [&>iframe]:rounded-t-xl [&>iframe]:lg:rounded-l-xl [&>iframe]:lg:rounded-tr-none"
                            iframeClassName="w-full h-full"
                            opts={{ width: "100%", height: "100%", playerVars: { modestbranding: 1 } }}
                            onReady={(e) => {
                              playerRef.current = e.target;
                            }}
                          />
                        ) : !showVideo && content ? (
                          <img
                            src={content.mediaUrl}
                            alt="Article hero"
                            className="absolute inset-0 h-full w-full object-cover rounded-t-xl lg:rounded-l-xl lg:rounded-tr-none"
                          />
                        ) : null}
                        <div className="absolute right-2 top-2">
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white/95 dark:bg-zinc-800/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
                            <input
                              type="checkbox"
                              checked={ambientFocus}
                              onChange={(e) => setAmbientFocus(e.target.checked)}
                              className="rounded border-zinc-300"
                            />
                            Ambient Focus Video/Music
                          </label>
                        </div>
                      </div>
                    </div>
                    {/* Right: Scrollable transcript with Feature 2 Quick-Add (double-click word) */}
                    <div className="flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-700">
                      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          Transcript
                        </h3>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          Click a line to seek; double-click a word to add to flashcards
                        </p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                        <ul className="space-y-2" aria-label="Transcript segments">
                          {(content.transcript ?? []).map((seg) => (
                            <li key={seg.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (seg.timestamp != null && seg.timestamp !== "") {
                                    const seconds = parseTimestampToSeconds(seg.timestamp);
                                    playerRef.current?.seekTo(seconds, true);
                                  }
                                  if (seg.shadowingAudioUrl) {
                                    try {
                                      new Audio(seg.shadowingAudioUrl).play().catch(() => {});
                                    } catch {
                                      // placeholder; mock URL may 404
                                    }
                                  }
                                }}
                                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                              >
                                <span className="flex items-start gap-3">
                                  {seg.timestamp != null && (
                                    <span
                                      className="shrink-0 mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums"
                                      aria-hidden
                                    >
                                      {seg.timestamp}
                                    </span>
                                  )}
                                  <span className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed select-text">
                                    {(seg.text ?? "").split(/(\s+)/).map((part, idx) =>
                                      /^\s+$/.test(part) ? (
                                        <span key={idx}>{part}</span>
                                      ) : (
                                        <span
                                          key={idx}
                                          role="button"
                                          tabIndex={0}
                                          onDoubleClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const word = part.replace(/[^\w'-]/g, "");
                                            if (word) setQuickAddSelection({ word, context: seg.text ?? "", segId: seg.id });
                                          }}
                                          className="hover:bg-[#3B82F6]/20 rounded px-0.5 -mx-0.5 cursor-pointer"
                                          title="Double-click to add to flashcards"
                                        >
                                          {part}
                                        </span>
                                      )
                                    )}
                                  </span>
                                </span>
                              </button>
                              {quickAddSelection?.segId === seg.id && (
                                <div className="mt-1 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickAddFlashcard();
                                    }}
                                    className="rounded-lg bg-[#14B8A6] text-white px-3 py-1.5 text-xs font-medium hover:bg-[#0D9488]"
                                  >
                                    + Add to Flashcards
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setQuickAddSelection(null)}
                                    className="text-xs text-zinc-500 hover:text-zinc-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "shadowing" && (
                <motion.div
                  key="shadowing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  id="panel-shadowing"
                  role="tabpanel"
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6"
                >
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shadowing Studio
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Use &quot;Play slow (browser voice)&quot; to hear each sentence via the Web Speech API—it always works even when hosted audio is not available. Then record yourself for live pronunciation grading.
                  </p>
                  <div className="space-y-4">
                    {(content.transcript ?? []).map((seg) => {
                      const scoreResult = shadowingScoreBySegId[seg.id];
                      const isRecording = shadowingRecordingSegId === seg.id;
                      return (
                        <div
                          key={seg.id}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4"
                        >
                          <p className="text-sm text-zinc-800 dark:text-zinc-200 mb-3">
                            {seg.text}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => speakWithBrowserVoice(seg.text ?? "", true, "en")}
                              className="rounded-lg bg-[#3B82F6] text-white px-3 py-2 text-xs font-medium hover:bg-[#2563EB]"
                              title="Uses browser Web Speech API when hosted audio is missing"
                            >
                              Play slow (browser voice)
                            </button>
                            {seg.shadowingAudioUrl && (
                              <>
                                <audio
                                  controls
                                  src={seg.shadowingAudioUrl}
                                  className="h-9 max-w-xs"
                                  preload="metadata"
                                >
                                  Your browser does not support the audio element.
                                </audio>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleShadowingRecord(seg.id, seg.text ?? "")}
                              disabled={isRecording}
                              className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-wait"
                            >
                              {isRecording ? "Listening…" : "Record my voice"}
                            </button>
                            {scoreResult != null && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  scoreResult.score >= 80
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200"
                                    : scoreResult.score >= 50
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200"
                                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 border-red-200"
                                }`}
                                role="status"
                              >
                                🎙️ Score: {scoreResult.score}% – {scoreResult.label}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === "flashcards" && (
                <motion.div
                  key="flashcards"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  id="panel-flashcards"
                  role="tabpanel"
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6"
                >
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Click or hover a card to flip and reveal the definition and context.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(content.flashcards ?? []).map((card, i) => {
                      const isFlipped = flippedCardIndex === i;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setFlippedCardIndex(isFlipped ? null : i)
                          }
                          className="group relative h-[220px] w-full rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-800/50 text-left focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 [perspective:800px]"
                        >
                          <div
                            className="absolute inset-0 transition-transform duration-300 [transform-style:preserve-3d]"
                            style={{
                              transform: isFlipped
                                ? "rotateY(180deg)"
                                : "rotateY(0deg)",
                            }}
                          >
                            {/* Front: word + image */}
                            <div
                              className="absolute inset-0 flex flex-col [backface-visibility:hidden]"
                              style={{ transform: "rotateY(0deg)" }}
                            >
                              <div className="relative flex-1 min-h-0 bg-zinc-200 dark:bg-zinc-700">
                                <img
                                  src={card.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="shrink-0 p-4 border-t border-zinc-200 dark:border-zinc-600">
                                <p className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                                  {card.word}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                  Click to reveal
                                </p>
                              </div>
                            </div>
                            {/* Back: FlashLan-style gradient card */}
                            <div
                              className="absolute inset-0 flex flex-col overflow-y-auto p-4 bg-gradient-to-br from-[#3B82F6] to-[#14B8A6] [backface-visibility:hidden]"
                              style={{ transform: "rotateY(180deg)" }}
                            >
                              <p className="font-semibold text-white">
                                {card.word}
                              </p>
                              <p className="mt-2 text-sm text-white/90">
                                {card.definition}
                              </p>
                              <p className="mt-2 text-sm text-white/80 italic border-l-2 border-white/50 pl-3">
                                &ldquo;{card.context}&rdquo;
                              </p>
                              <p className="mt-2 text-xs text-white/70">
                                Click to flip back
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === "debrief" && (
                <motion.div
                  key="debrief"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  id="panel-debrief"
                  role="tabpanel"
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col min-h-[400px]"
                >
                  <div className="border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Debate this topic in
                    </h3>
                    <select
                      value={debriefLanguage}
                      onChange={(e) => setDebriefLanguage(e.target.value)}
                      aria-label="Target language"
                      className="rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-sm"
                    >
                      <option value="English">English</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="Mandarin">Mandarin</option>
                      <option value="German">German</option>
                      <option value="Japanese">Japanese</option>
                    </select>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {debriefMessages.length === 0 && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Send a message or use the microphone to start the debate.
                      </p>
                    )}
                    {debriefMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                          m.role === "user"
                            ? "ml-auto bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        {m.content}
                      </div>
                    ))}
                    {debriefLoading && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Thinking…
                      </p>
                    )}
                  </div>
                  <div className="border-t border-zinc-200 dark:border-zinc-700 p-4 flex gap-2">
                    <input
                      type="text"
                      placeholder="Type your message…"
                      value={debriefInput}
                      onChange={(e) => setDebriefInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleDebriefSubmit();
                        }
                      }}
                      className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      title={voiceListening ? "Listening…" : "Voice input"}
                      className={`rounded-lg p-2 ${
                        voiceListening
                          ? "bg-red-200 dark:bg-red-900/50"
                          : "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                      }`}
                    >
                      <svg
                        className="h-5 w-5 text-zinc-600 dark:text-zinc-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDebriefSubmit()}
                      disabled={!debriefInput.trim() || debriefLoading}
                      className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200"
                    >
                      Send
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === "lounge" && (
                <motion.div
                  key="lounge"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  id="panel-lounge"
                  role="tabpanel"
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8"
                >
                  <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50 p-8 text-center">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Match anonymously with a native speaker currently reading this
                      exact article.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-4 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      <span>Abelian verification</span>
                    </div>
                    {loungeMatchStatus === "idle" && (
                      <button
                        type="button"
                        onClick={handleLoungeMatch}
                        className="mt-6 rounded-xl bg-zinc-900 dark:bg-zinc-100 px-6 py-3 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                      >
                        Find match
                      </button>
                    )}
                    {loungeMatchStatus === "matching" && (
                      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <svg
                          className="h-5 w-5 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Finding a verified match…
                      </div>
                    )}
                    {loungeMatchStatus === "matched" && (
                      <div className="mt-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-left">
                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                          You&apos;re matched!
                        </p>
                        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                          Abelian-verified. Start the conversation when ready.
                        </p>
                      </div>
                    )}
                    <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                      Powered by Abelian verification
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* Feature 3: Focus Mode – full viewport overlay with video + transcript */}
        <AnimatePresence>
          {focusMode && content && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex flex-col bg-black/95"
              aria-modal="true"
              role="dialog"
              aria-label="Focus Mode"
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-black/50 border-b border-white/10">
                <span className="text-sm text-white/80">Focus Mode – full viewport</span>
                <button
                  type="button"
                  onClick={() => setFocusMode(false)}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
                >
                  Exit Focus Mode
                </button>
              </div>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
                <div className="relative flex flex-col min-h-0 bg-zinc-900">
                  <div className="relative flex-1 min-h-0">
                    {showVideo && youtubeVideoId ? (
                      <YouTube
                        videoId={youtubeVideoId}
                        className="absolute inset-0 h-full w-full"
                        iframeClassName="w-full h-full"
                        opts={{ width: "100%", height: "100%", playerVars: { modestbranding: 1 } }}
                        onReady={(e) => {
                          playerRef.current = e.target;
                        }}
                      />
                    ) : !showVideo && content ? (
                      <img
                        src={content.mediaUrl}
                        alt="Article hero"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col overflow-hidden border-l border-white/10 bg-zinc-900">
                  <div className="shrink-0 border-b border-white/10 px-4 py-3">
                    <h3 className="text-sm font-semibold text-white">Transcript</h3>
                    <p className="mt-0.5 text-xs text-white/60">Click a line to seek the video</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <ul className="space-y-2">
                      {(content.transcript ?? []).map((seg) => (
                        <li key={seg.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (seg.timestamp != null && seg.timestamp !== "") {
                                const seconds = parseTimestampToSeconds(seg.timestamp);
                                playerRef.current?.seekTo(seconds, true);
                              }
                              if (seg.shadowingAudioUrl) {
                                try {
                                  new Audio(seg.shadowingAudioUrl).play().catch(() => {});
                                } catch {}
                              }
                            }}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors"
                          >
                            {seg.timestamp != null && (
                              <span className="mr-3 font-mono text-xs text-white/50">{seg.timestamp}</span>
                            )}
                            {seg.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
