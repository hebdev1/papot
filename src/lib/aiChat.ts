import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The browser side of the AI gateway.
 *
 * The page never talks to a model provider — it talks to the `ai-chat` Edge
 * Function, which is the only part of PAPOT that holds a secret. What comes
 * back is a stream of small events, so the answer appears as it is written
 * rather than after a long blank pause.
 */

const SESSION_KEY = "papot.ai.session";
const FUNCTION = "ai-chat";

export type AiEvent =
  | { type: "open"; conversationId: string }
  | { type: "text"; text: string }
  /** §95: a task the gateway is performing. Never the model's reasoning. */
  | { type: "status"; tool: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * A long random identifier for a visitor who has not signed in.
 *
 * It is what ties an anonymous conversation to the person who started it, so
 * it is generated here and never guessable. The gateway treats it as a secret;
 * the database gives anonymous conversations no direct access at all.
 */
export function aiSessionId(): string {
  try {
    const held = localStorage.getItem(SESSION_KEY);
    if (held && held.length >= 16) return held;
    const fresh = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8);
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode: the conversation still works, it just will not survive a
    // reload.
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/** Whether AI Papot is open. The answer is a platform setting, read once. */
export function useAiEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    supabase.rpc("ai_enabled").then(({ data }) => {
      if (!live) return;
      setEnabled(data === true);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { enabled, loading };
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION}`;

/**
 * Sends a message and yields the events as they arrive.
 *
 * The signed-in traveller's token is forwarded, because the gateway runs every
 * tool with it: what the assistant can see is exactly what the person could
 * see themselves.
 */
export async function* askAi(
  message: string,
  opts: { conversationId?: string | null; language?: string; signal?: AbortSignal },
): AsyncGenerator<AiEvent> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${token ?? anon}`,
    },
    body: JSON.stringify({
      message,
      session_id: aiSessionId(),
      conversation_id: opts.conversationId ?? null,
      language: opts.language ?? "fr",
    }),
  });

  // A refusal comes back as plain JSON — the switch being off, a malformed
  // body — and carries its own reason, which is worth showing as written.
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/event-stream")) {
    let reason = "Je n'ai pas pu répondre à l'instant.";
    try {
      const body = await res.json();
      if (typeof body?.error === "string") reason = body.error;
    } catch {
      /* not JSON either; keep the generic sentence */
    }
    yield { type: "error", message: reason };
    return;
  }

  if (!res.body) {
    yield { type: "error", message: "La réponse est arrivée vide." };
    return;
  }

  const reader = res.body.getReader();
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

      let name = "";
      let payload = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) payload += line.slice(5).trim();
      }
      if (!name || !payload) continue;

      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }

      if (name === "open") yield { type: "open", conversationId: String(data.conversation_id) };
      else if (name === "text") yield { type: "text", text: String(data.text ?? "") };
      else if (name === "status") yield { type: "status", tool: String(data.tool ?? "") };
      else if (name === "done") yield { type: "done" };
      else if (name === "error") yield { type: "error", message: String(data.message ?? "") };
    }
  }
}

/** What each tool is doing, in words a traveller reads (§95). */
export const TOOL_LABEL: Record<string, string> = {
  searchListings: "Recherche dans PAPOT…",
  getListingDetails: "Lecture de la fiche…",
  checkRestaurantAvailability: "Vérification des tables libres…",
  getPackages: "Recherche des offres…",
  getDestinations: "Lecture des destinations…",
};
