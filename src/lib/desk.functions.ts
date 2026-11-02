import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import {
  ensureAlias,
  forgetMemory,
  insertLine,
  listChannelLines,
  listMemories,
  readMemory,
  readVoiceReply,
  recordUsage,
  writeMemory,
} from "@/lib/supabase/desk-store";
import { pickRelevant, type PastLine } from "@/lib/supabase/memory-context";
import { CHANNELS, type Channel, type DeskHome, type Line, type SavedMemory } from "@/lib/desk-types";

const LIMITS: Record<Channel, number> = {
  desk: 2000,
  voice: 2000,
  mail: 4000,
  text: 160,
};

const guards = [supabaseMiddleware];

type Scope = {
  supabaseUserId: string;
  supabaseEmail: string | null;
  supabase: SupabaseClient;
};

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

async function complete(system: string, user: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: maxTokens,
        temperature: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return body.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function splitReply(raw: string): { reply: string; memory: string | null } {
  const lines = raw.split("\n");
  const idx = lines.findIndex((line) => line.trim().toUpperCase().startsWith("MEMORY:"));
  if (idx === -1) return { reply: raw.trim(), memory: null };
  const memory = lines[idx].replace(/^memory:\s*/i, "").trim().slice(0, 180);
  const reply = lines
    .slice(0, idx)
    .join("\n")
    .replace(/^#+\s*/gm, "")
    .trim();
  return { reply: reply || "Kept.", memory: memory || null };
}

async function recentTranscript(
  client: SupabaseClient,
  userId: string,
  channel: Channel,
): Promise<string> {
  const rows = await listChannelLines(client, userId, channel);
  return rows
    .slice(-6)
    .map((row) => `${row.role === "person" ? "Person" : "Macman"}: ${row.body.slice(0, 400)}`)
    .join("\n");
}

async function earlierLines(client: SupabaseClient, userId: string, channel: Channel): Promise<PastLine[]> {
  const others = CHANNELS.filter((item) => item !== channel);
  const groups = await Promise.all(
    others.map(async (item) => {
      const rows = await listChannelLines(client, userId, item);
      return rows.slice(-8).map((row) => ({ channel: item, role: row.role, body: row.body }));
    }),
  );
  return groups.flat();
}

async function answer(scope: Scope, channel: "desk" | "voice", body: string) {
  const userId = scope.supabaseUserId;
  const client = scope.supabase;
  await ensureAlias(client, userId, scope.supabaseEmail);
  const memories = await listMemories(client);
  const line = await insertLine(client, userId, channel, "person", body, null);
  await recordUsage(client, userId, channel);
  const transcript = await recentTranscript(client, userId, channel);
  const earlier = pickRelevant(await earlierLines(client, userId, channel), body);
  const memoryText = memories.map((item) => item.content).join("\n") || "none yet";
  const earlierText = earlier
    .map((item) => `${item.channel} ${item.role === "person" ? "Person" : "Macman"}: ${item.body.slice(0, 240)}`)
    .join("\n");
  const raw = await complete(
    [
      "You are Macman, a private desk for one person.",
      "Reply in two short sentences, plain and warm. No lists, no markdown, no sign-off.",
      "Use the saved memories and earlier lines when they answer the person. Do not invent facts they did not give you.",
      "If the memories and lines do not contain the fact, say you do not have it yet.",
      "Then a final line that starts with MEMORY: and one sentence under 140 characters.",
      "That sentence is the single memory to keep, folding the saved memories with anything new.",
      `Saved memories:\n${memoryText}`,
      earlierText ? `Earlier lines from other channels:\n${earlierText}` : "Earlier lines from other channels: none yet",
    ].join(" "),
    `Channel: ${channel}\n${transcript || `Person: ${body}`}`,
    220,
  );
  if (!raw) {
    return { line, reply: null as Line | null, memory: memories[0]?.content ?? null, memories };
  }
  const parsed = splitReply(raw);
  const reply = await insertLine(client, userId, channel, "macman", parsed.reply, null);
  const next = parsed.memory ? await writeMemory(client, userId, channel, parsed.memory) : memories[0]?.content ?? null;
  const saved = await listMemories(client);
  return { line, reply, memory: next, memories: saved };
}

async function foldMemory(scope: Scope, channel: Channel, kind: string, text: string) {
  const previous = await readMemory(scope.supabase);
  const raw = await complete(
    "Write one sentence under 140 characters. It is the single memory a private desk should keep. Fold the previous memory with the new note. Do not invent facts. No prefix, no quotes.",
    `Previous memory: ${previous ?? "none yet"}\nNew ${kind}: ${text.slice(0, 500)}`,
    80,
  );
  const next = raw ? raw.replace(/^memory:\s*/i, "") : text.slice(0, 140);
  return writeMemory(scope.supabase, scope.supabaseUserId, channel, next);
}

export const getDesk = createServerFn({ method: "GET" })
  .middleware(guards)
  .handler(async ({ context }): Promise<DeskHome> => {
    const scope = context as unknown as Scope;
    const alias = await ensureAlias(scope.supabase, scope.supabaseUserId, scope.supabaseEmail);
    const memory = await readMemory(scope.supabase);
    const memories = await listMemories(scope.supabase);
    return { alias, memory, memories };
  });

export const listLines = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { channel: string }) => {
    if (!input || !isChannel(input.channel)) throw new Error("Unknown line.");
    return { channel: input.channel };
  })
  .handler(async ({ context, data }): Promise<Line[]> => {
    const scope = context as unknown as Scope;
    await ensureAlias(scope.supabase, scope.supabaseUserId, scope.supabaseEmail);
    return listChannelLines(scope.supabase, scope.supabaseUserId, data.channel);
  });

export const forgetSavedMemory = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { id: string }) => {
    const id = input?.id?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("That memory is already gone.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<SavedMemory[]> => {
    const scope = context as unknown as Scope;
    await forgetMemory(scope.supabase, scope.supabaseUserId, data.id);
    return listMemories(scope.supabase);
  });

export const sendDesk = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.desk) throw new Error("Write a shorter line.");
    return { body };
  })
  .handler(async ({ context, data }) => answer(context as unknown as Scope, "desk", data.body));

export const sendVoice = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.voice) throw new Error("Say a shorter line.");
    return { body };
  })
  .handler(async ({ context, data }) => answer(context as unknown as Scope, "voice", data.body));

export const saveMail = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { subject: string; body: string }) => {
    const body = input?.body?.trim() ?? "";
    const subject = (input?.subject ?? "").trim().slice(0, 120);
    if (!body || body.length > LIMITS.mail) throw new Error("Keep the letter shorter.");
    return { subject: subject || "Letter", body };
  })
  .handler(async ({ context, data }) => {
    const scope = context as unknown as Scope;
    await ensureAlias(scope.supabase, scope.supabaseUserId, scope.supabaseEmail);
    const line = await insertLine(
      scope.supabase,
      scope.supabaseUserId,
      "mail",
      "person",
      data.body,
      data.subject,
    );
    await recordUsage(scope.supabase, scope.supabaseUserId, "mail");
    const memory = await foldMemory(scope, "mail", "letter", `${data.subject}. ${data.body}`);
    return { line, memory, memories: await listMemories(scope.supabase) };
  });

export const saveText = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.text) throw new Error("Keep it to one short line.");
    return { body };
  })
  .handler(async ({ context, data }) => {
    const scope = context as unknown as Scope;
    await ensureAlias(scope.supabase, scope.supabaseUserId, scope.supabaseEmail);
    const line = await insertLine(
      scope.supabase,
      scope.supabaseUserId,
      "text",
      "person",
      data.body,
      null,
    );
    await recordUsage(scope.supabase, scope.supabaseUserId, "text");
    const memory = await foldMemory(scope, "text", "text", data.body);
    return { line, memory, memories: await listMemories(scope.supabase) };
  });

export const hearLine = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { lineId: string }) => {
    const lineId = input?.lineId?.trim() ?? "";
    if (!lineId || lineId.length > 80) throw new Error("Nothing to hear.");
    return { lineId };
  })
  .handler(async ({ context, data }) => {
    const scope = context as unknown as Scope;
    const text = await readVoiceReply(scope.supabase, scope.supabaseUserId, data.lineId);
    if (!text) return { ok: false as const, error: "Nothing to hear." };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Voice is not available right now." };
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ text, voice_id: "eve" }),
      });
      if (!res.ok) return { ok: false as const, error: "The voice is quiet right now." };
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("application/json")) {
        const json = (await res.json()) as { url?: string };
        if (json.url) return { ok: true as const, url: json.url };
        return { ok: false as const, error: "The voice is quiet right now." };
      }
      const audio = Buffer.from(await res.arrayBuffer()).toString("base64");
      return { ok: true as const, audio };
    } catch {
      return { ok: false as const, error: "The voice is quiet right now." };
    }
  });
