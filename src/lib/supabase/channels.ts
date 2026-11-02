import type { Channel } from "@/lib/desk-types";

export const DB_CHANNEL = {
  desk: "web",
  voice: "voice",
  mail: "email",
  text: "sms",
} as const;

export function packBody(channel: Channel, body: string, subject: string | null): string {
  if (channel === "mail" && subject) return `Subject: ${subject}\n${body}`;
  return body;
}

export function unpackBody(channel: Channel, content: string): { body: string; subject: string | null } {
  if (channel !== "mail" || !content.startsWith("Subject: ")) {
    return { body: content, subject: null };
  }
  const split = content.indexOf("\n");
  if (split === -1) return { body: "", subject: content.slice("Subject: ".length).trim() || "Letter" };
  const subject = content.slice("Subject: ".length, split).trim() || "Letter";
  return { body: content.slice(split + 1), subject };
}
