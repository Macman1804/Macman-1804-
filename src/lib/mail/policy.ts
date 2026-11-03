export type MailProvider = "gmail" | "outlook";

export type MailboxLink = {
  ownerId: string;
  provider: MailProvider;
  address: string;
};

export type OutsideAction = "read" | "search" | "summarize" | "draft" | "send" | "delete";

const PROVIDERS = new Set<MailProvider>(["gmail", "outlook"]);

export function isMailProvider(value: string): value is MailProvider {
  return PROVIDERS.has(value as MailProvider);
}

/** A pending OAuth return is valid only for the same account, provider, and state. */
export function acceptMailboxLink(input: {
  actorId: string;
  provider: string;
  expectedState: string;
  returnedState: string;
  address: string;
}): { ok: true; link: MailboxLink } | { ok: false; reason: string } {
  if (!input.actorId) return { ok: false, reason: "Sign in before connecting a mailbox." };
  if (!isMailProvider(input.provider)) return { ok: false, reason: "That mailbox is not supported." };
  if (!input.expectedState || input.expectedState !== input.returnedState) {
    return { ok: false, reason: "The mailbox connection did not match this account." };
  }
  const address = input.address.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, reason: "That mailbox address is not valid." };
  return { ok: true, link: { ownerId: input.actorId, provider: input.provider, address } };
}

export function readMailbox(actorId: string, link: MailboxLink | null): MailboxLink | null {
  if (!link || link.ownerId !== actorId) return null;
  return link;
}

/**
 * Drafts stay on the desk. Sending or deleting an outside message needs the
 * owner's mailbox and an explicit confirmation. This never contacts a provider.
 */
export function outsideMail(input: {
  actorId: string;
  link: MailboxLink | null;
  action: OutsideAction;
  confirmed: boolean;
}): { ok: true; delivered: false; action: OutsideAction } | { ok: false; delivered: false; reason: string } {
  const link = readMailbox(input.actorId, input.link);
  if (!link) return { ok: false, delivered: false, reason: "No mailbox is connected to this account." };
  if (input.action === "send" || input.action === "delete") {
    if (!input.confirmed) {
      return { ok: false, delivered: false, reason: "Confirm before that message is sent or deleted." };
    }
  }
  return { ok: true, delivered: false, action: input.action };
}

export function authorizeUrl(input: {
  provider: MailProvider;
  clientId: string;
  redirectUri: string;
  state: string;
}): string | null {
  if (!input.clientId || !input.state) return null;
  let redirect: URL;
  try {
    redirect = new URL(input.redirectUri);
  } catch {
    return null;
  }
  if (redirect.protocol !== "https:") return null;
  const base =
    input.provider === "gmail"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const scope =
    input.provider === "gmail"
      ? "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
      : "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite";
  const url = new URL(base);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", redirect.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set(input.provider === "gmail" ? "access_type" : "response_mode", input.provider === "gmail" ? "offline" : "query");
  return url.toString();
}
