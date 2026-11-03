import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFrom(material: string): Buffer {
  return createHash("sha256").update(material).digest();
}

/** Server-side only. The caller keeps the key. The result does not include it. */
export function sealSecret(plain: string, material: string): string {
  if (!material) throw new Error("A mailbox key is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(material), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSecret(sealed: string, material: string): string {
  if (!material) throw new Error("A mailbox key is not configured.");
  const raw = Buffer.from(sealed, "base64url");
  if (raw.length < 29) throw new Error("The stored mailbox secret is not valid.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(material), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
