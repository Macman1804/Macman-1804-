/** A message safe to show. Raw database and credential text stays on the server. */
const SPANISH: Record<string, string> = {
  "That email or password is not right.": "Ese correo o esa contraseña no son correctos.",
  "Confirm the email, then sign in.": "Confirma el correo y luego entra.",
  "Wait a moment, then try again.": "Espera un momento y vuelve a intentarlo.",
  "That email already has an account. Sign in instead.": "Ese correo ya tiene una cuenta. Entra en su lugar.",
  "Wait a moment before the next line.": "Espera un momento antes de la siguiente línea.",
  "Write a shorter line.": "Escribe una línea más corta.",
  "That language is not supported.": "Ese idioma no está admitido.",
  "Keep the letter shorter.": "Acorta la carta.",
  "Keep it to one short line.": "Déjala en una línea corta.",
  "Unknown line.": "Línea desconocida.",
  "Only a simulated call can be practiced.": "Solo se puede practicar una llamada simulada.",
  "That memory is already gone.": "Esa memoria ya no está.",
  "Nothing to hear.": "No hay nada que escuchar.",
  "Voice is not available right now.": "La voz no está disponible ahora.",
  "The voice is quiet right now.": "La voz está en silencio ahora.",
  "That recording format is not supported.": "Ese formato de grabación no está admitido.",
  "That recording is too long. Speak a shorter line.": "Esa grabación es demasiado larga. Di una línea más corta.",
  "The recording could not be read.": "No se pudo leer la grabación.",
  "I could not verify current information for that.": "No pude verificar la información actual.",
  "The search limit for this account was reached. Current information was not checked.":
    "Se alcanzó el límite de búsqueda de esta cuenta. No se consultó la información actual.",
};

function say(english: string, language?: string): string {
  if (language !== "es") return english;
  return SPANISH[english] ?? english;
}

export function publicError(message: string | undefined, fallback: string, language?: string): string {
  const text = (message ?? "").trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return say("That email or password is not right.", language);
  }
  if (lower.includes("email not confirmed")) return say("Confirm the email, then sign in.", language);
  if (lower.includes("rate limit") || lower.includes("too many")) return say("Wait a moment, then try again.", language);
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return say("That email already has an account. Sign in instead.", language);
  }
  if (/jwt|bearer|stack trace|schema|relation "|duplicate key|api[_ -]?key|service_role|sk-/i.test(text)) {
    return fallback;
  }
  if (text.length > 160) return fallback;
  return say(text, language);
}