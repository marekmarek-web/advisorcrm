import type { AssistantResponse } from "@/lib/ai/assistant-tool-router";

function parseSseDataLine(line: string): unknown | null {
  const t = line.trimEnd();
  if (!t.startsWith("data:")) return null;
  const payload = t.replace(/^data:\s*/, "").trim();
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

/** Čte SSE z `/api/ai/assistant/chat?stream=1` a volá onDelta pro úseky textu. */
export async function consumeAssistantChatSse(
  res: Response,
  onDelta: (chunk: string) => void
): Promise<AssistantResponse> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Chybí tělo odpovědi.");
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: AssistantResponse | null = null;

  const handleLine = (line: string) => {
    const json = parseSseDataLine(line);
    if (!json || typeof json !== "object" || json === null) return;
    const rec = json as { type?: string; text?: string };
    if (rec.type === "text" && typeof rec.text === "string") onDelta(rec.text);
    if (rec.type === "complete") {
      const { type: _t, ...rest } = json as { type: string } & AssistantResponse;
      complete = rest as AssistantResponse;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
    }
    if (done) break;
  }
  if (buffer.trim()) handleLine(buffer);

  if (!complete) {
    throw new Error("Stream skončil bez kompletní odpovědi.");
  }
  return complete;
}

/** POST na streamovaný chat; `init.body` musí být JSON string zprávy. */
export async function postAssistantChatStreaming(
  init: RequestInit,
  onDelta: (chunk: string) => void
): Promise<AssistantResponse> {
  const res = await fetch("/api/ai/assistant/chat?stream=1", init);
  return consumeAssistantChatSse(res, onDelta);
}
