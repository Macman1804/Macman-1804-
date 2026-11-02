import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { aliasFor } from "@/lib/alias";
import { CHANNELS, type Channel, type DeskHome, type Line } from "@/lib/desk-types";

const LIMITS: Record<Channel, number> = {
  desk: 2000,
  voice: 2000,
  mail: 4000,
  text: 160,
};

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

async function ensureAlias(userId: string): Promise<string> {
  const sql = await getSql();
  const existing = await sql<{ alias: string }>`
    select alias from desk_profiles where user_id = ${userId}
  `;
  if (existing[0]) return existing[0].alias;
  const alias = aliasFor(userId);
  await sql`
    insert into desk_profiles (user_id, alias)
    values (${userId}, ${alias})
    on conflict (user_id) do nothing
  `;
  const again = await sql<{ alias: string }>`
    select alias from desk_profiles where user_id = ${userId}
  `;
  return again[0]?.alias ?? alias;
}

async function readMemory(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ content: string }>`
    select content from desk_memory where user_id = ${userId}
  `;
  return rows[0]?.content ?? null;
}

async function writeMemory(userId: string, content: string): Promise<string | null> {
  const trimmed = content.trim().slice(0, 180);
  if (!trimmed) return readMemory(userId);
  const sql = await getSql();
  await sql`
    insert into desk_memory (user_id, content)
    values (${userId}, ${trimmed})
    on conflict (user_id) do update
      set content = excluded.content, updated_at = now()
  `;
  return trimmed;
}

async function insertLine(
  userId: string,
  channel: Channel,
  role: "person" | "macman",
  body: string,
  subject: string | null,
): Promise<Line> {
  const sql = await getSql();
  const id = crypto.randomUUID();
  const rows = await sql<{
    id: string;
    role: "person" | "macman";
    body: string;
    subject: string | null;
    created_at: string;
  }>`
    insert into desk_lines (id, user_id, channel, role, body, subject)
    values (${id}, ${userId}, ${channel}, ${role}, ${body}, ${subject})
    returning id, role, body, subject, created_at::text as created_at
  `;
  const row = rows[0];
  return {
    id: row?.id ?? id,
    role: row?.role ?? role,
    body: row?.body ?? body,
    subject: row?.subject ?? subject,
    createdAt: row?.created_at ?? new Date().toISOString(),
  };
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

async function recentTranscript(userId: string, channel: Channel): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ role: string; body: string }>`
    select role, body from desk_lines
    where user_id = ${userId} and channel = ${channel}
    order by created_at desc
    limit 6
  `;
  return rows
    .reverse()
    .map((row) => `${row.role === "person" ? "Person" : "Macman"}: ${row.body.slice(0, 400)}`)
    .join("\n");
}

async function answer(userId: string, channel: "desk" | "voice", body: string) {
  const memory = await readMemory(userId);
  const line = await insertLine(userId, channel, "person", body, null);
  const transcript = await recentTranscript(userId, channel);
  const raw = await complete(
    [
      "You are Macman, a private desk for one person.",
      "Reply in two short sentences, plain and warm. No lists, no markdown, no sign-off.",
      "Then a final line that starts with MEMORY: and one sentence under 140 characters.",
      "That sentence is the single memory to keep, folding the previous memory with anything new.",
      "Do not invent facts the person did not give you.",
      `Previous memory: ${memory ?? "none yet"}`,
    ].join(" "),
    `Channel: ${channel}\n${transcript || `Person: ${body}`}`,
    220,
  );
  if (!raw) {
    return { line, reply: null as Line | null, memory };
  }
  const parsed = splitReply(raw);
  const reply = await insertLine(userId, channel, "macman", parsed.reply, null);
  const next = parsed.memory ? await writeMemory(userId, parsed.memory) : memory;
  return { line, reply, memory: next };
}

async function foldMemory(userId: string, kind: string, text: string) {
  const previous = await readMemory(userId);
  const raw = await complete(
    "Write one sentence under 140 characters. It is the single memory a private desk should keep. Fold the previous memory with the new note. Do not invent facts. No prefix, no quotes.",
    `Previous memory: ${previous ?? "none yet"}\nNew ${kind}: ${text.slice(0, 500)}`,
    80,
  );
  if (!raw) return writeMemory(userId, text.slice(0, 140));
  return writeMemory(userId, raw.replace(/^memory:\s*/i, ""));
}

export const getDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeskHome> => {
    const alias = await ensureAlias(context.userId);
    const memory = await readMemory(context.userId);
    return { alias, memory };
  });

export const listLines = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { channel: string }) => {
    if (!input || !isChannel(input.channel)) throw new Error("Unknown line.");
    return { channel: input.channel };
  })
  .handler(async ({ context, data }): Promise<Line[]> => {
    await ensureAlias(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      role: "person" | "macman";
      body: string;
      subject: string | null;
      created_at: string;
    }>`
      select id, role, body, subject, created_at::text as created_at
      from desk_lines
      where user_id = ${context.userId} and channel = ${data.channel}
      order by created_at asc
      limit 80
    `;
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      body: row.body,
      subject: row.subject,
      createdAt: row.created_at,
    }));
  });

export const sendDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.desk) throw new Error("Write a shorter line.");
    return { body };
  })
  .handler(async ({ context, data }) => {
    await ensureAlias(context.userId);
    return answer(context.userId, "desk", data.body);
  });

export const sendVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.voice) throw new Error("Say a shorter line.");
    return { body };
  })
  .handler(async ({ context, data }) => {
    await ensureAlias(context.userId);
    return answer(context.userId, "voice", data.body);
  });

export const saveMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { subject: string; body: string }) => {
    const body = input?.body?.trim() ?? "";
    const subject = (input?.subject ?? "").trim().slice(0, 120);
    if (!body || body.length > LIMITS.mail) throw new Error("Keep the letter shorter.");
    return { subject: subject || "Letter", body };
  })
  .handler(async ({ context, data }) => {
    await ensureAlias(context.userId);
    const line = await insertLine(
      context.userId,
      "mail",
      "person",
      data.body,
      data.subject,
    );
    const memory = await foldMemory(
      context.userId,
      "letter",
      `${data.subject}. ${data.body}`,
    );
    return { line, memory };
  });

export const saveText = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body: string }) => {
    const body = input?.body?.trim() ?? "";
    if (!body || body.length > LIMITS.text) throw new Error("Keep it to one short line.");
    return { body };
  })
  .handler(async ({ context, data }) => {
    await ensureAlias(context.userId);
    const line = await insertLine(context.userId, "text", "person", data.body, null);
    const memory = await foldMemory(context.userId, "text", data.body);
    return { line, memory };
  });

export const hearLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { lineId: string }) => {
    const lineId = input?.lineId?.trim() ?? "";
    if (!lineId || lineId.length > 80) throw new Error("Nothing to hear.");
    return { lineId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ body: string }>`
      select body from desk_lines
      where id = ${data.lineId}
        and user_id = ${context.userId}
        and channel = 'voice'
        and role = 'macman'
    `;
    const text = rows[0]?.body?.slice(0, 600);
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
