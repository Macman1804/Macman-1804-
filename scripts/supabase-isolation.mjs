#!/usr/bin/env node
/**
 * Live Phase 1 check against the configured Supabase project.
 * Creates two disposable auth users, then checks owner writes and row isolation.
 * Refuses to run unless SUPABASE_RLS_TEST=1. Does not print tokens or passwords.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.env.SUPABASE_RLS_TEST !== "1") {
  console.log("skipped (set SUPABASE_RLS_TEST=1)");
  process.exit(0);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !url.includes("bexuyxicdxtviapavdwi")) {
  console.error("missing or unexpected public supabase env");
  process.exit(1);
}

const stamp = Date.now();
const password = `Macman-${stamp}-Test`;
const emails = [`macman-rls-a.${stamp}@example.org`, `macman-rls-b.${stamp}@example.org`];

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const report = [];

function shape(result) {
  return {
    rows: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
    error: result.error?.message ?? null,
    code: result.error?.code ?? null,
  };
}

async function signUp(email) {
  const supabase = client();
  const created = await supabase.auth.signUp({ email, password });
  if (created.error) return { email, error: created.error.message };
  if (!created.data.session) {
    return { email, user: created.data.user?.id ?? null, session: false, confirm: true };
  }
  const signedOut = await supabase.auth.signOut();
  const again = client();
  const signedIn = await again.auth.signInWithPassword({ email, password });
  return {
    email,
    user: signedIn.data.user?.id ?? created.data.user?.id ?? null,
    session: Boolean(signedIn.data.session),
    signOutError: signedOut.error?.message ?? null,
    signInError: signedIn.error?.message ?? null,
    access: signedIn.data.session?.access_token,
  };
}

const a = await signUp(emails[0]);
const b = await signUp(emails[1]);
report.push({
  step: "auth",
  a: { email: a.email, user: Boolean(a.user), session: Boolean(a.session), confirm: a.confirm ?? false, error: a.error ?? a.signInError ?? null },
  b: { email: b.email, user: Boolean(b.user), session: Boolean(b.session), confirm: b.confirm ?? false, error: b.error ?? b.signInError ?? null },
});

async function asUser(access) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  });
}

if (a.access && b.access && a.user && b.user) {
  const userA = await asUser(a.access);
  const userB = await asUser(b.access);

  const profileA = await userA.from("profiles").insert({
    id: a.user,
    email: a.email,
    status: "active",
  }).select("id").single();
  const profileB = await userB.from("profiles").insert({
    id: b.user,
    email: b.email,
    status: "active",
  }).select("id").single();

  const conversationA = await userA.from("conversations").insert({
    subscriber_id: a.user,
    channel: "web",
    external_thread_id: "desk",
  }).select("id").single();
  const messageA = conversationA.data?.id
    ? await userA.from("messages").insert({
        subscriber_id: a.user,
        conversation_id: conversationA.data.id,
        direction: "inbound",
        sender: "person",
        content: "Phase 1 desk line",
        status: "stored",
      }).select("id, content").single()
    : { data: null, error: { message: "no conversation", code: "skipped" } };
  const listedA = conversationA.data?.id
    ? await userA.from("messages").select("id, content").eq("conversation_id", conversationA.data.id).eq("subscriber_id", a.user)
    : { data: [], error: null };

  const memoryA = await userA.from("memories").insert({
    subscriber_id: a.user,
    content: "Phase 1 memory",
    source_channel: "web",
  }).select("id, content");
  const memoryReadA = await userA.from("memories").select("content").is("deleted_at", null).order("created_at", { ascending: false }).limit(1);

  const usageA = await userA.from("usage_events").insert({
    subscriber_id: a.user,
    channel: "web",
    units: 1,
    estimated_cost_usd: 0,
  }).select("id");
  const usageReadA = await userA.from("usage_events").select("id").eq("subscriber_id", a.user);

  const cross = {
    bProfiles: await userB.from("profiles").select("id").eq("id", a.user),
    bConversations: await userB.from("conversations").select("id").eq("subscriber_id", a.user),
    bMessages: conversationA.data?.id
      ? await userB.from("messages").select("id").eq("conversation_id", conversationA.data.id)
      : { data: [], error: null },
    bMemories: await userB.from("memories").select("id").eq("subscriber_id", a.user),
    bUsage: await userB.from("usage_events").select("id").eq("subscriber_id", a.user),
    bInsertsAProfile: await userB.from("profiles").insert({ id: a.user, email: a.email, status: "active" }),
    bInsertsAMessage: conversationA.data?.id
      ? await userB.from("messages").insert({
          subscriber_id: b.user,
          conversation_id: conversationA.data.id,
          direction: "inbound",
          content: "cross user",
          status: "stored",
        })
      : { data: null, error: { message: "no conversation", code: "skipped" } },
  };

  report.push({
    step: "owner-writes",
    profileA: shape(profileA),
    profileB: shape(profileB),
    conversationA: shape(conversationA),
    messageA: shape(messageA),
    listedA: shape(listedA),
    listedBody: listedA.data?.[0]?.content === "Phase 1 desk line",
    memoryA: shape(memoryA),
    memoryReadA: memoryReadA.data?.[0]?.content === "Phase 1 memory",
    memoryError: memoryReadA.error?.message ?? null,
    usageA: shape(usageA),
    usageReadA: shape(usageReadA),
  });
  report.push({
    step: "isolation",
    bProfiles: shape(cross.bProfiles),
    bConversations: shape(cross.bConversations),
    bMessages: shape(cross.bMessages),
    bMemories: shape(cross.bMemories),
    bUsage: shape(cross.bUsage),
    bInsertsAProfile: shape(cross.bInsertsAProfile),
    bInsertsAMessage: shape(cross.bInsertsAMessage),
  });

  await userA.auth.signOut();
  await userB.auth.signOut();
}

console.log(JSON.stringify(report, null, 2));
