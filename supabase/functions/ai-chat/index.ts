import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MissingCredentials, providerFor, type ChatChunk, type Msg } from "./provider.ts";
import { redact, registry, specs, type Tool } from "./tools.ts";
import { compose } from "./prompt.ts";

/**
 * AI Papot — the gateway and the orchestrator (§9, §77, §95).
 *
 * This is the only place in PAPOT that runs code with a secret. The site is a
 * static bundle, so a provider key cannot live there: anything prefixed VITE_
 * is inlined and public.
 *
 * `verify_jwt` is off because §101 lets a visitor plan without an account. The
 * authorization that matters happens below: the caller's own token is what runs
 * every tool, so row level security decides what the model can see. An
 * anonymous caller simply sees less.
 *
 * The orchestrator coordinates and nothing more (§9). It holds no rule about
 * price, availability or booking — those live in the database, where they can
 * be tested.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TOOL_ROUNDS = 5;
const PROVIDER_TIMEOUT_MS = 60_000;
const TOOL_TIMEOUT_MS = 10_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Bookkeeping only: conversations, audit, cost. Never business data. */
const service = createClient(SUPABASE_URL, SERVICE_KEY);

const haitiToday = () =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Port-au-Prince" }).format(new Date());

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  const language = typeof body.language === "string" ? body.language : "fr";

  if (!message) return json({ error: "Le message est vide." }, 400);
  if (sessionId.length < 16) return json({ error: "session_id manquant ou trop court." }, 400);

  // The switch first: a gateway billed per call must be closeable without a
  // deploy, and nothing below should run when it is shut.
  const { data: open } = await service.rpc("ai_enabled");
  if (open !== true) {
    return json({ error: "AI Papot n'est pas activé pour le moment." }, 503);
  }

  // The caller's token runs the tools. Absent, the anon key does — and RLS
  // narrows what comes back on its own.
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
  const { data: who } = await caller.auth.getUser();
  const userId = who?.user?.id ?? null;

  /* ── conversation ── */
  let convId = conversationId;
  if (convId) {
    const { data } = await service
      .from("ai_conversations")
      .select("id, user_id, session_id, trip_state_id")
      .eq("id", convId)
      .maybeSingle();
    // A conversation belongs to its session, or to its user once there is one.
    const mine = data && (data.session_id === sessionId || (userId && data.user_id === userId));
    if (!mine) return json({ error: "Conversation introuvable." }, 404);
  } else {
    const { data, error } = await service
      .from("ai_conversations")
      .insert({ user_id: userId, session_id: sessionId, language })
      .select("id")
      .single();
    if (error) return json({ error: "La conversation n'a pas pu être ouverte." }, 500);
    convId = data.id;
  }

  const { data: history } = await service
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .in("role", ["user", "assistant"])
    .order("created_at")
    .limit(40);

  await service.from("ai_messages").insert({
    conversation_id: convId,
    role: "user",
    content: message,
  });

  /* ── model ── */
  const { data: cfg } = await service
    .from("ai_model_configs")
    .select("provider, model, max_output_tokens, temperature")
    .eq("task", "planning")
    .eq("active", true)
    .maybeSingle();

  if (!cfg) return json({ error: "Aucun modèle n'est configuré." }, 503);

  let provider;
  try {
    provider = providerFor(cfg.provider);
  } catch {
    return json({ error: `Fournisseur inconnu : ${cfg.provider}.` }, 503);
  }

  const tools = registry({ anonymous: !userId, maxRisk: "low" });
  const byName = new Map<string, Tool>(tools.map(t => [t.spec.name, t]));

  const system = compose({
    language,
    mode: "plan",
    signedIn: !!userId,
    tripState: null,
    today: haitiToday(),
  });

  const messages: Msg[] = [
    ...(history ?? []).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  /* ── the stream ── */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      let answer = "";
      let inTokens = 0;
      let outTokens = 0;
      let toolCount = 0;

      try {
        send("open", { conversation_id: convId });

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const pending: { id: string; name: string; input: Record<string, unknown> }[] = [];
          const assistantBlocks: unknown[] = [];
          let text = "";
          let stop = "end_turn";

          const abort = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
          const chunks = provider.stream({
            model: cfg.model,
            system,
            messages,
            tools: specs(tools),
            maxTokens: cfg.max_output_tokens,
            temperature: cfg.temperature,
            signal: abort,
          });

          for await (const c of chunks as AsyncIterable<ChatChunk>) {
            if (c.type === "text") {
              text += c.text;
              answer += c.text;
              send("text", { text: c.text });
            } else if (c.type === "tool_use") {
              pending.push({ id: c.id, name: c.name, input: c.input });
            } else if (c.type === "usage") {
              inTokens += c.inputTokens;
              outTokens += c.outputTokens;
            } else if (c.type === "stop") {
              stop = c.reason;
            }
          }

          if (text) assistantBlocks.push({ type: "text", text });
          for (const p of pending) {
            assistantBlocks.push({ type: "tool_use", id: p.id, name: p.name, input: p.input });
          }

          if (stop !== "tool_use" || pending.length === 0) break;

          messages.push({ role: "assistant", content: assistantBlocks });

          const results: unknown[] = [];
          for (const call of pending) {
            toolCount++;
            // §95: the visitor sees what is happening, never the reasoning.
            send("status", { tool: call.name });

            const started = Date.now();
            const tool = byName.get(call.name);
            let payload: unknown;
            let status = "ok";
            let failure: string | null = null;

            if (!tool) {
              status = "unknown_tool";
              failure = `Outil inconnu : ${call.name}`;
              payload = { error: failure };
            } else {
              try {
                payload = await Promise.race([
                  tool.execute(call.input, caller),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("délai dépassé")), TOOL_TIMEOUT_MS),
                  ),
                ]);
              } catch (e) {
                status = "error";
                failure = e instanceof Error ? e.message : String(e);
                // A failed tool is reported to the model, not hidden: §84.6
                // says the tool result wins, and "it did not work" is a result.
                payload = { error: failure };
              }
            }

            await service.from("ai_tool_calls").insert({
              conversation_id: convId,
              tool_name: call.name,
              input_json: redact(call.input),
              output_status: status,
              error_reason: failure,
              latency_ms: Date.now() - started,
            });

            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(payload).slice(0, 60_000),
            });
          }

          messages.push({ role: "user", content: results });
        }

        await service.from("ai_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: answer,
          token_count: outTokens,
        });

        await service.from("ai_cost_usage").insert({
          user_id: userId,
          conversation_id: convId,
          provider: provider.name,
          model: cfg.model,
          input_tokens: inTokens,
          output_tokens: outTokens,
          tool_calls: toolCount,
        });

        send("done", { conversation_id: convId });
      } catch (e) {
        const missing = e instanceof MissingCredentials;
        console.error("ai-chat failed:", e);
        // §113: never a stack trace, never a 500 in the face.
        send("error", {
          message: missing
            ? "AI Papot n'est pas encore relié à un fournisseur."
            : "Je n'ai pas pu répondre à l'instant. Réessayez dans un moment.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
