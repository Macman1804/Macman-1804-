const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Stable mailbox like `xrbfe5nysv.n6brji@macman.desk`, derived from the user id. */
export function aliasFor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const chunk = (seed: number, len: number) => {
    let x = seed >>> 0;
    let s = "";
    for (let i = 0; i < len; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      s += ALPHABET[x % ALPHABET.length];
    }
    return s;
  };
  return `${chunk(h, 10)}.${chunk(h ^ 0x9e3779b9, 6)}@macman.desk`;
}
