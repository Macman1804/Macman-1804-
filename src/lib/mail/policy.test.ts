import assert from "node:assert/strict";
import test from "node:test";
import { acceptMailboxLink, authorizeUrl, outsideMail, readMailbox } from "./policy.ts";

test("a mailbox link must match the signed-in account and hides another account", () => {
  const linked = acceptMailboxLink({
    actorId: "owner-a",
    provider: "gmail",
    expectedState: "state-a",
    returnedState: "state-a",
    address: "Ada@Example.com",
  });
  assert.equal(linked.ok, true);
  if (!linked.ok) return;
  assert.equal(linked.link.address, "ada@example.com");
  assert.equal(readMailbox("owner-b", linked.link), null);
  assert.equal(
    acceptMailboxLink({
      actorId: "owner-a",
      provider: "gmail",
      expectedState: "state-a",
      returnedState: "state-b",
      address: "ada@example.com",
    }).ok,
    false,
  );
});

test("sending or deleting needs confirmation and still is not delivered", () => {
  const link = { ownerId: "owner-a", provider: "outlook" as const, address: "ada@example.com" };
  const draft = outsideMail({ actorId: "owner-a", link, action: "draft", confirmed: false });
  assert.equal(draft.ok, true);
  assert.equal(draft.delivered, false);
  const send = outsideMail({ actorId: "owner-a", link, action: "send", confirmed: false });
  assert.equal(send.ok, false);
  if (!send.ok) assert.match(send.reason, /Confirm/);
  const sent = outsideMail({ actorId: "owner-a", link, action: "send", confirmed: true });
  assert.equal(sent.ok, true);
  assert.equal(sent.delivered, false);
  const stranger = outsideMail({ actorId: "owner-b", link, action: "read", confirmed: true });
  assert.equal(stranger.ok, false);
  const removed = outsideMail({ actorId: "owner-a", link, action: "delete", confirmed: false });
  assert.equal(removed.ok, false);
});

test("the authorize URL omits the client secret and refuses a plain http redirect", () => {
  const url = authorizeUrl({
    provider: "gmail",
    clientId: "client-id",
    redirectUri: "https://example.com/api/mail/callback",
    state: "state-a",
  });
  assert.equal(url?.startsWith("https://accounts.google.com/"), true);
  assert.equal(url?.includes("client_secret"), false);
  assert.equal(url?.includes("client-id"), true);
  assert.equal(
    authorizeUrl({
      provider: "outlook",
      clientId: "client-id",
      redirectUri: "http://example.com/callback",
      state: "state-a",
    }),
    null,
  );
});
