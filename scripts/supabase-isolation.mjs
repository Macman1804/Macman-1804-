#!/usr/bin/env node
/**
 * Live check against the configured Supabase project.
 * Creates two disposable auth users, then checks session and row isolation.
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
if (!url || !key) {
  console.error("missing public supabase env");
  process.exit(1);
}

const stamp = Date.now();
const password = `Macman-${stamp}-Test`;
const emails = [`macman-rls-a.${stamp}@example.com`, `macman-rls-b.${stamp}@example.com`];

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const report = [];

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
  const user = signedIn.data.user;
  const access = signedIn.data.session?.access_token;
  return {
    email,
    user: user?.id ?? null,
    session: Boolean(signedIn.data.session),
    signOutError: signedOut.error?.message ?? null,
    signInError: signedIn.error?.message ?? null,
    access,
  };
}

const a = await signUp(emails[0]);
const b = await signUp(emails[1]);
report.push({
  step: "auth",
  a: { email: a.email, user: a.user, session: a.session, confirm: a.confirm ?? false, error: a.error ?? a.signInError ?? null },
  b: { email: b.email, user: b.user, session: b.session, confirm: b.confirm ?? false, error: b.error ?? b.signInError ?? null },
});

async function asUser(access) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  });
}

if (a.access && b.access) {
  const userA = await asUser(a.access);
  const userB = await asUser(b.access);
  const checks = {};
  checks.aProfiles = await userA.from("profiles").select("id");
  checks.bProfiles = await userB.from("profiles").select("id");
  checks.aMessages = await userA.from("messages").select("id");
  checks.aInsertProfile = await userA.from("profiles").insert({
    id: a.user,
    email: a.email,
    status: "active",
  });
  checks.aInsertMessage = await userA.from("messages").insert({
    subscriber_id: a.user,
    conversation_id: "00000000-0000-0000-0000-000000000000",
    direction: "inbound",
    content: "isolation probe",
    status: "stored",
  });
  checks.aUpdateProfiles = await userA.from("profiles").update({ locale: "en" }).neq("id", a.user);
  checks.aDeleteProfiles = await userA.from("profiles").delete().neq("id", a.user);
  checks.bSeesA = a.user
    ? await userB.from("profiles").select("id").eq("id", a.user)
    : { data: null, error: { message: "no user" } };

  const shape = (result) => ({
    rows: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
    error: result.error?.message ?? null,
    code: result.error?.code ?? null,
  });
  report.push({
    step: "rls",
    aProfiles: shape(checks.aProfiles),
    bProfiles: shape(checks.bProfiles),
    aMessages: shape(checks.aMessages),
    aInsertProfile: shape(checks.aInsertProfile),
    aInsertMessage: shape(checks.aInsertMessage),
    aUpdateProfiles: shape(checks.aUpdateProfiles),
    aDeleteProfiles: shape(checks.aDeleteProfiles),
    bSeesA: shape(checks.bSeesA),
  });

  await userA.auth.signOut();
  await userB.auth.signOut();
  const after = await client().auth.getUser(a.access);
  report.push({
    step: "after-signout",
    getUserError: after.error?.message ?? null,
    stillHasUser: Boolean(after.data.user),
  });
}

console.log(JSON.stringify(report, null, 2));
