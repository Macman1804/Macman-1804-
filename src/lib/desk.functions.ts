import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { twilioReadiness } from "@/lib/telephony/readiness";
import {
  countUsage,
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
import { voiceId } from "@/lib/voice/voices";
import { calendarReply } from "@/lib/voice/calendar";
import { replySubject } from "@/lib/supabase/channels";
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

const hits = new Map<string, number[]>();

function pace(userId: string) {
  const turn = admit(hits.get(userId) ?? [], Date.now(), 30, 10 * 60 * 1000);
  hits.set(userId, turn.next);
  if (!turn.ok) throw new Error("Wait a moment before the next line.");
}

async function answer(
  scope: Scope,
  channel: Channel,
  body: string,
  timeZone: string,
  subject: string | null = null,
) {
  const userId = scope.supabaseUserId;
  const client = scope.supabase;
  pace(userId);
  await ensureAlias(client, userId, scope.supabaseEmail);
  const memories = await listMemories(client);
  const mailSubject = channel === "mail" ? subject || "Letter" : null;
  const line = await insertLine(client, userId, channel, "person", body, mailSubject);
  await recordUsage(client, userId, channel);
  const replySubjectLine = channel === "mail" ? replySubject(mailSubject) : null;
  const direct = calendarReply(body, new Date(), timeZone);
  if (direct) {
    const reply = await insertLine(client, userId, channel, "macman", direct, replySubjectLine);
    return { line, reply, memory: memories[0]?.content ?? null, memories };
  }
  const transcript = await recentTranscript(client, userId, channel);
  const earlier = pickRelevant(await earlierLines(client, userId, channel), body);
  const memoryText = memories.map((item) => item.content).join("\n") || "none yet";
  const earlierText = earlier
    .map((item) => `${item.channel} ${item.role === "person" ? "Person" : "Macman"}: ${item.body.slice(0, 240)}`)
    .join("\n");
  let clock = "";
  try {
    clock = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timeZone || "America/New_York",
    }).format(new Date());
  } catch {
    clock = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    }).format(new Date());
  }
  const raw = await complete(
    [
      "You are Macman, a private desk for one person.",
      channel === "mail"
        ? "This is a letter kept on the desk. It is not sent to an outside inbox. Write two or three short sentences. No lists, no markdown, no sign-off."
        : channel === "text"
          ? "This is a text kept on the desk. It is not sent to a phone. Keep the reply under 160 characters. No lists, no markdown, no sign-off."
          : "Reply in two short sentences, plain and warm. No lists, no markdown, no sign-off.",
      `Today is ${clock}. Answer a date question with that date. Never say you do not have today's date.`,
      "Use the saved memories and earlier lines for personal facts. Do not invent personal facts they did not give you.",
      "If a personal fact is not in the memories or earlier lines, say you do not have it yet.",
      "Then a final line that starts with MEMORY: and one sentence under 140 characters.",
      "That sentence is the single memory to keep, folding the saved memories with anything new.",
      `Saved memories:\n${memoryText}`,
      earlierText ? `Earlier lines from other channels:\n${earlierText}` : "Earlier lines from other channels: none yet",
    ].join(" "),
    `Channel: ${channel}${mailSubject ? `\nSubject: ${mailSubject}` : ""}\n${transcript || `Person: ${body}`}`,
    channel === "text" ? 120 : 220,
  );
  if (!raw) {
    return { line, reply: null as Line | null, memory: memories[0]?.content ?? null, memories };
  }
  const parsed = splitReply(raw);
  const reply = await insertLine(client, userId, channel, "macman", parsed.reply, replySubjectLine);
  const next = parsed.memory ? await writeMemory(client, userId, channel, parsed.memory) : memories[0]?.content ?? null;
  const saved = await listMemories(client);
  return { line, reply, memory: next, memories: saved };
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

export const getAccountDesk = createServerFn({ method: "GET" })
  .middleware(guards)
  .handler(async ({ context }) => {
    const scope = context as unknown as Scope;
    const alias = await ensureAlias(scope.supabase, scope.supabaseUserId, scope.supabaseEmail);
    const memories = await listMemories(scope.supabase);
    const phone = twilioReadiness();
    const count = await countUsage(scope.supabase, scope.supabaseUserId);
    return {
      email: scope.supabaseEmail,
      alias,
      mailbox: { gmail: "not_configured" as const, outlook: "not_configured" as const, sending: "confirmation_required" as const },
      phone: { configured: phone.configured, missing: phone.missing, callsEnabled: phone.callsEnabled, smsEnabled: phone.smsEnabled },
      sms: { mode: "simulated" as const, carrierDelivery: false as const, consentStored: false as const },
      usage: { available: count !== null, count },
      subscription: { status: "not_chosen" as const, billing: false as const },
      memories,
    };
  });

function asked(input: { body: string; timeZone?: string }, limit: number) {
  const body = input?.body?.trim() ?? "";
  const timeZone = (input?.timeZone ?? "").trim();
  if (!body || body.length > limit) throw new Error("Write a shorter line.");
  if (timeZone && !/^[A-Za-z0-9_+\-/]{1,80}$/.test(timeZone)) throw new Error("Write a shorter line.");
  return { body, timeZone: timeZone || "America/New_York" };
}

export const sendDesk = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string; timeZone?: string }) => asked(input, LIMITS.desk))
  .handler(async ({ context, data }) =>
    answer(context as unknown as Scope, "desk", data.body, data.timeZone),
  );

export const sendVoice = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string; timeZone?: string }) => asked(input, LIMITS.voice))
  .handler(async ({ context, data }) =>
    answer(context as unknown as Scope, "voice", data.body, data.timeZone),
  );

export const saveMail = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { subject: string; body: string; timeZone?: string }) => {
    const body = input?.body?.trim() ?? "";
    const subject = (input?.subject ?? "").trim().slice(0, 120);
    const timeZone = (input?.timeZone ?? "").trim();
    if (!body || body.length > LIMITS.mail) throw new Error("Keep the letter shorter.");
    if (timeZone && !/^[A-Za-z0-9_+\-/]{1,80}$/.test(timeZone)) throw new Error("Keep the letter shorter.");
    return { subject: subject || "Letter", body, timeZone: timeZone || "America/New_York" };
  })
  .handler(async ({ context, data }) =>
    answer(context as unknown as Scope, "mail", data.body, data.timeZone, data.subject),
  );

export const saveText = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { body: string; timeZone?: string }) => {
    const body = input?.body?.trim() ?? "";
    const timeZone = (input?.timeZone ?? "").trim();
    if (!body || body.length > LIMITS.text) throw new Error("Keep it to one short line.");
    if (timeZone && !/^[A-Za-z0-9_+\-/]{1,80}$/.test(timeZone)) throw new Error("Keep it to one short line.");
    return { body, timeZone: timeZone || "America/New_York" };
  })
  .handler(async ({ context, data }) =>
    answer(context as unknown as Scope, "text", data.body, data.timeZone, null),
  );

export const practiceCarrier = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { kind?: string; body?: string; timeZone?: string; simulated?: boolean; optedIn?: boolean }) => {
    if (input?.simulated !== true) throw new Error("Only a simulated line can be practiced.");
    if (input.kind !== "voice" && input.kind !== "sms") throw new Error("Unknown line.");
    if (input.kind === "sms" && input.optedIn !== true) throw new Error("Opt in before a simulated text.");
    const limit = input.kind === "sms" ? LIMITS.text : LIMITS.voice;
    return { kind: input.kind, ...asked({ body: input.body ?? "", timeZone: input.timeZone }, limit) };
  })
  .handler(async ({ context, data }) => {
    const channel = data.kind === "sms" ? "text" : "voice";
    const result = await answer(context as unknown as Scope, channel, data.body, data.timeZone);
    return {
      simulated: true as const,
      delivered: false as const,
      live: "off" as const,
      status: "simulated" as const,
      channel,
      line: result.line,
      reply: result.reply,
      memory: result.memory,
      memories: result.memories,
    };
  });

const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

export const transcribeSpeech = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { audio: string; mime?: string }) => {
    const audio = input?.audio?.trim() ?? "";
    const mime = (input?.mime ?? "audio/webm").split(";")[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(mime)) throw new Error("That recording format is not supported.");
    if (!audio || audio.length > 1_500_000) throw new Error("That recording is too long. Speak a shorter line.");
    return { audio, mime };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Transcription is not available right now." };
    try {
      const bytes = Buffer.from(data.audio, "base64");
      const ext = data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : data.mime.includes("ogg") ? "ogg" : data.mime.includes("wav") ? "wav" : "webm";
      const form = new FormData();
      form.append("language", "en");
      form.append("file", new File([bytes], `line.${ext}`, { type: data.mime }));
      const res = await fetch("https://api.x.ai/v1/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(25000),
        body: form,
      });
      if (!res.ok) return { ok: false as const, error: "Transcription failed. Speak the line again." };
      const body = (await res.json()) as { text?: string };
      const text = body.text?.trim() ?? "";
      if (!text) return { ok: false as const, error: "No words were recognized. Speak a little closer and try again." };
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "Transcription failed. Speak the line again." };
    }
  });

export const hearLine = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { lineId: string; voiceId?: string }) => {
    const lineId = input?.lineId?.trim() ?? "";
    if (!lineId || lineId.length > 80) throw new Error("Nothing to hear.");
    return { lineId, voiceId: voiceId(input?.voiceId) };
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
        body: JSON.stringify({ text, voice_id: data.voiceId, language: "en" }),
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
