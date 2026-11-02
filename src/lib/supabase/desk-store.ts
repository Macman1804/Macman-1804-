import type { SupabaseClient } from "@supabase/supabase-js";
import { aliasFor } from "@/lib/alias";
import type { Channel, Line, SavedMemory } from "@/lib/desk-types";
import { DB_CHANNEL, packBody, unpackBody } from "@/lib/supabase/channels";

export { DB_CHANNEL, packBody, unpackBody };

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function ensureAlias(
  client: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const existing = await client
    .from("profiles")
    .select("ai_email_alias")
    .eq("id", userId)
    .maybeSingle();
  if (existing.error) fail(existing.error, "The profile could not be opened.");
  if (existing.data?.ai_email_alias) return existing.data.ai_email_alias;

  const alias = aliasFor(userId);
  if (!existing.data) {
    const inserted = await client
      .from("profiles")
      .insert({ id: userId, email, status: "active", ai_email_alias: alias })
      .select("ai_email_alias")
      .single();
    if (inserted.error) fail(inserted.error, "The profile could not be created.");
    return inserted.data.ai_email_alias ?? alias;
  }

  const updated = await client
    .from("profiles")
    .update({ ai_email_alias: alias, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("ai_email_alias")
    .single();
  if (updated.error) fail(updated.error, "The alias could not be saved.");
  return updated.data.ai_email_alias ?? alias;
}

async function conversationId(
  client: SupabaseClient,
  userId: string,
  channel: Channel,
): Promise<string> {
  const dbChannel = DB_CHANNEL[channel];
  const existing = await client
    .from("conversations")
    .select("id")
    .eq("subscriber_id", userId)
    .eq("channel", dbChannel)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing.error) fail(existing.error, "The conversation could not be opened.");
  if (existing.data?.[0]?.id) return existing.data[0].id;

  const inserted = await client
    .from("conversations")
    .insert({
      subscriber_id: userId,
      channel: dbChannel,
      external_thread_id: channel,
    })
    .select("id")
    .single();
  if (inserted.error) fail(inserted.error, "The conversation could not be saved.");
  return inserted.data.id;
}

export async function insertLine(
  client: SupabaseClient,
  userId: string,
  channel: Channel,
  role: "person" | "macman",
  body: string,
  subject: string | null,
): Promise<Line> {
  const conversation = await conversationId(client, userId, channel);
  const content = packBody(channel, body, subject);
  const inserted = await client
    .from("messages")
    .insert({
      subscriber_id: userId,
      conversation_id: conversation,
      direction: role === "person" ? "inbound" : "outbound",
      sender: role,
      content,
      status: "stored",
    })
    .select("id, content, direction, created_at")
    .single();
  if (inserted.error) fail(inserted.error, "The line could not be saved.");
  const unpacked = unpackBody(channel, inserted.data.content);
  return {
    id: inserted.data.id,
    role: inserted.data.direction === "outbound" ? "macman" : "person",
    body: unpacked.body,
    subject: unpacked.subject,
    createdAt: inserted.data.created_at,
  };
}

export async function listChannelLines(client: SupabaseClient, userId: string, channel: Channel): Promise<Line[]> {
  const conversation = await client
    .from("conversations")
    .select("id")
    .eq("subscriber_id", userId)
    .eq("channel", DB_CHANNEL[channel])
    .order("created_at", { ascending: true })
    .limit(1);
  if (conversation.error) fail(conversation.error, "The conversation could not be opened.");
  const id = conversation.data?.[0]?.id;
  if (!id) return [];
  const rows = await client
    .from("messages")
    .select("id, content, direction, created_at")
    .eq("conversation_id", id)
    .eq("subscriber_id", userId)
    .order("created_at", { ascending: true })
    .limit(80);
  if (rows.error) fail(rows.error, "The lines could not be opened.");
  return (rows.data ?? []).map((row) => {
    const unpacked = unpackBody(channel, row.content);
    return {
      id: row.id,
      role: row.direction === "outbound" ? "macman" : "person",
      body: unpacked.body,
      subject: unpacked.subject,
      createdAt: row.created_at,
    };
  });
}

export async function listMemories(client: SupabaseClient): Promise<SavedMemory[]> {
  const rows = await client
    .from("memories")
    .select("id, content, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);
  if (rows.error) fail(rows.error, "The memories could not be opened.");
  return (rows.data ?? []).map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export async function forgetMemory(client: SupabaseClient, userId: string, memoryId: string): Promise<void> {
  const updated = await client
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("subscriber_id", userId)
    .select("id");
  if (updated.error) fail(updated.error, "The memory could not be removed.");
  if (!updated.data?.length) throw new Error("That memory is already gone.");
}

export async function readMemory(client: SupabaseClient): Promise<string | null> {
  const rows = await client
    .from("memories")
    .select("content")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (rows.error) fail(rows.error, "The memory could not be opened.");
  return rows.data?.[0]?.content ?? null;
}

export async function writeMemory(
  client: SupabaseClient,
  userId: string,
  channel: Channel,
  content: string,
): Promise<string | null> {
  const trimmed = content.trim().slice(0, 180);
  if (!trimmed) return readMemory(client);
  const inserted = await client.from("memories").insert({
    subscriber_id: userId,
    content: trimmed,
    source_channel: DB_CHANNEL[channel],
  });
  if (inserted.error) fail(inserted.error, "The memory could not be saved.");
  return trimmed;
}

export async function recordUsage(
  client: SupabaseClient,
  userId: string,
  channel: Channel,
): Promise<void> {
  const inserted = await client.from("usage_events").insert({
    subscriber_id: userId,
    channel: DB_CHANNEL[channel],
    units: 1,
    estimated_cost_usd: 0,
  });
  if (inserted.error) fail(inserted.error, "The usage event could not be saved.");
}

export async function readVoiceReply(client: SupabaseClient, userId: string, lineId: string): Promise<string | null> {
  const row = await client
    .from("messages")
    .select("content, direction, conversation_id")
    .eq("id", lineId)
    .eq("subscriber_id", userId)
    .maybeSingle();
  if (row.error) fail(row.error, "Nothing to hear.");
  if (!row.data || row.data.direction !== "outbound") return null;
  const conversation = await client
    .from("conversations")
    .select("channel")
    .eq("id", row.data.conversation_id)
    .eq("subscriber_id", userId)
    .maybeSingle();
  if (conversation.error || conversation.data?.channel !== "voice") return null;
  return unpackBody("voice", row.data.content).body.slice(0, 600);
}
