import { NextResponse } from "next/server";

/**
 * POST /api/debrief
 * Body: { message: string, topic: string, language: string }
 * Returns: { reply: string }
 * Demo: returns a mock debate reply. Set FEATHERLESS_API_KEY or use an LLM to get real replies.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }
    const { message, topic, language } = body as {
      message?: string;
      topic?: string;
      language?: string;
    };
    const userMessage = typeof message === "string" ? message.trim() : "";
    const topicStr = typeof topic === "string" ? topic : "this topic";
    const lang = typeof language === "string" ? language : "your target language";

    if (!userMessage) {
      return NextResponse.json(
        { error: "Missing or invalid 'message'" },
        { status: 400 }
      );
    }

    // Optional: call Featherless or another LLM here when API key is set
    const apiKey = process.env.FEATHERLESS_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [
              {
                role: "system",
                content: `You are a debate partner for language practice. The lesson topic is: ${topicStr}. Reply in ${lang} only. Keep replies 1-3 sentences. Be conversational.`,
              },
              { role: "user", content: userMessage },
            ],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const reply =
            data.choices?.[0]?.message?.content?.trim() ||
            getMockReply(userMessage, topicStr, lang);
          return NextResponse.json({ reply });
        }
      } catch {
        // fall through to mock
      }
    }

    const reply = getMockReply(userMessage, topicStr, lang);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("debrief error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

function getMockReply(
  userMessage: string,
  topic: string,
  language: string
): string {
  const replies = [
    `That's a good point about ${topic}. In ${language}, we might say something similar. Can you rephrase that once more?`,
    `I agree. Another way to put it in ${language} would be to emphasize the main idea. What do you think?`,
    `Interesting. Let's debate further—try asking me a question in ${language} about ${topic}.`,
  ];
  const i =
    Math.abs(
      userMessage.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
    ) % replies.length;
  return replies[i] ?? replies[0];
}
