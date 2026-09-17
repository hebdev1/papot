/**
 * §10 — the provider boundary.
 *
 * PAPOT is not locked to one vendor. Everything above this file speaks
 * `LLMProvider`; only the adapters below know what an Anthropic request looks
 * like. Adding OpenAI or Gemini later means writing a second adapter, not
 * touching the orchestrator.
 *
 * The model name never appears here either — §11 routes per task and the names
 * live in `ai_model_configs`, so changing a model is a row, not a deploy.
 */

export type ToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Msg =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: unknown[] };

export type ChatInput = {
  model: string;
  system: string;
  messages: Msg[];
  tools: ToolSpec[];
  maxTokens: number;
  temperature?: number | null;
  signal?: AbortSignal;
};

/** What the orchestrator sees, whoever the vendor is. */
export type ChatChunk =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: string };

export interface LLMProvider {
  readonly name: string;
  stream(input: ChatInput): AsyncIterable<ChatChunk>;
}

export class MissingCredentials extends Error {
  constructor(public readonly provider: string) {
    super(`Aucune clé n'est configurée pour ${provider}.`);
  }
}

/* ────────────────────────────── Anthropic ────────────────────────────── */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  constructor(private readonly apiKey: string | undefined) {}

  async *stream(input: ChatInput): AsyncIterable<ChatChunk> {
    if (!this.apiKey) throw new MissingCredentials(this.name);

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: input.signal,
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: input.messages,
        ...(input.tools.length > 0 ? { tools: input.tools } : {}),
        ...(input.temperature === null || input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`anthropic ${res.status}: ${detail.slice(0, 400)}`);
    }

    // A tool call arrives as a stream of JSON fragments, so each block is
    // rebuilt before it is handed on. Parsing a half-written argument list is
    // how a search for "Jacmel" becomes a search for "Jac".
    const partials = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of sse(res.body)) {
      const t = event.type;

      if (t === "content_block_start" && event.content_block?.type === "tool_use") {
        partials.set(event.index, {
          id: event.content_block.id,
          name: event.content_block.name,
          json: "",
        });
      } else if (t === "content_block_delta") {
        const d = event.delta ?? {};
        if (d.type === "text_delta" && d.text) {
          yield { type: "text", text: d.text };
        } else if (d.type === "input_json_delta") {
          const held = partials.get(event.index);
          if (held) held.json += d.partial_json ?? "";
        }
      } else if (t === "content_block_stop") {
        const held = partials.get(event.index);
        if (held) {
          partials.delete(event.index);
          let parsed: Record<string, unknown> = {};
          try {
            parsed = held.json.trim() ? JSON.parse(held.json) : {};
          } catch {
            // Malformed arguments are a refusal, not a guess.
            parsed = { __invalid: held.json };
          }
          yield { type: "tool_use", id: held.id, name: held.name, input: parsed };
        }
      } else if (t === "message_start" && event.message?.usage) {
        yield {
          type: "usage",
          inputTokens: event.message.usage.input_tokens ?? 0,
          outputTokens: event.message.usage.output_tokens ?? 0,
        };
      } else if (t === "message_delta") {
        if (event.usage?.output_tokens) {
          yield { type: "usage", inputTokens: 0, outputTokens: event.usage.output_tokens };
        }
        if (event.delta?.stop_reason) {
          yield { type: "stop", reason: event.delta.stop_reason };
        }
      }
    }
  }
}

/** Reads a `text/event-stream` body into parsed JSON events. */
async function* sse(body: ReadableStream<Uint8Array>): AsyncIterable<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload);
        } catch {
          /* a fragment that is not JSON is not an event */
        }
      }
    }
  }
}

export function providerFor(name: string): LLMProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(Deno.env.get("ANTHROPIC_API_KEY"));
    default:
      throw new Error(`Fournisseur inconnu : ${name}`);
  }
}
