import { useEffect, useRef, useState } from "react";
import { Mail, MessageSquare, Mic, Pencil, Volume2 } from "lucide-react";
import { AccountGate, signOutMacman, useMacmanSession } from "@/components/account-gate";
import { AccountDesk } from "@/components/account-desk";
import { VoiceCall } from "@/components/voice-call";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  forgetSavedMemory,
  getDesk,
  hearLine,
  listLines,
  practiceCarrier,
  saveMail,
  saveText,
  sendDesk,
  sendVoice,
} from "@/lib/desk.functions";
import type { Channel, DeskHome, Line, SavedMemory } from "@/lib/desk-types";
import { publicError } from "@/lib/security/public-error";
import type { VoiceId } from "@/lib/voice/voices";

type View = "home" | "account" | Channel;

const CARDS: { id: Channel; title: string; hint: string; icon: typeof Pencil }[] = [
  { id: "desk", title: "Desk", hint: "Write it here", icon: Pencil },
  { id: "voice", title: "Voice", hint: "Speak, then hear it", icon: Mic },
  { id: "mail", title: "Mail", hint: "A letter answered here", icon: Mail },
  { id: "text", title: "Text", hint: "A short line, answered here", icon: MessageSquare },
];

function errorText(error: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "The connection dropped. Try that line again.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "The connection dropped. Try that line again.";
  }
  return publicError(message, "The desk could not keep that.");
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export function DeskApp() {
  const account = useMacmanSession();
  const user = useCurrentUser();
  const [home, setHome] = useState<DeskHome | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    if (!account.session) return;
    let cancel = false;
    getDesk()
      .then((next) => {
        if (!cancel) setHome(next);
      })
      .catch((error: unknown) => {
        if (!cancel) setHomeError(errorText(error));
      });
    return () => {
      cancel = true;
    };
  }, [account.session]);

  if (!account.session) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-ink">
        <AccountGate>{null}</AccountGate>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mark font-serif text-lg text-cream">
            M
          </span>
          <div className="min-w-0">
            <p className="text-lg font-medium leading-tight">Macman</p>
            <p className="max-w-48 text-xs leading-snug break-all text-mute">
              {home?.alias ?? "Opening your desk"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="grid size-8 place-items-center rounded-full bg-card text-xs font-medium">
                G
              </span>
              Grok user
            </>
          ) : (
            <span className="text-mute">Signed in</span>
          )}
        </div>
      </header>

      {view === "home" ? (
        <Home
          home={home}
          error={homeError}
          onOpen={setView}
          onAccount={() => setView("account")}
          onMemories={(memories) =>
            setHome((current) =>
              current
                ? { ...current, memories, memory: memories[0]?.content ?? null }
                : current,
            )
          }
        />
      ) : view === "account" ? (
        <AccountDesk onBack={() => setView("home")} />
      ) : (
        <ChannelView
          channel={view}
          alias={home?.alias ?? ""}
          onBack={() => setView("home")}
          onMemory={(memory, memories) =>
            setHome((current) =>
              current ? { ...current, memory, memories: memories ?? current.memories } : current,
            )
          }
        />
      )}
    </div>
  );
}

function Home({
  home,
  error,
  onOpen,
  onAccount,
  onMemories,
}: {
  home: DeskHome | null;
  error: string | null;
  onOpen: (view: Channel) => void;
  onAccount: () => void;
  onMemories: (memories: SavedMemory[]) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [memoryNote, setMemoryNote] = useState<string | null>(null);
  const memories = home?.memories ?? [];

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    setMemoryNote(null);
    try {
      const next = await forgetSavedMemory({ data: { id } });
      onMemories(next);
    } catch (error) {
      setMemoryNote(errorText(error));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-medium tracking-widest text-copper uppercase">Your desk</p>
      <h1 className="mt-4 font-serif text-5xl leading-none font-medium tracking-tight text-cream">
        Four lines.
        <br />
        One memory.
      </h1>
      <p className="mt-5 max-w-md text-base leading-relaxed text-cream/90">
        All four lines answer here. Mail and text stay on this account
        {home?.alias ? (
          <>
            {" "}
            under <span className="break-all text-mute">{home.alias}</span>
          </>
        ) : null}
        . They are not delivered to a phone or outside inbox.
      </p>
      {memories.length > 0 ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-xs font-medium tracking-widest text-copper uppercase">Saved memories</p>
          {memories.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-l-2 border-copper pl-4">
              <p className="text-sm leading-relaxed text-mute">{item.content}</p>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={removing === item.id}
                className="min-h-11 shrink-0 text-sm text-copper disabled:opacity-50"
              >
                {removing === item.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {memoryNote ? <p className="mt-4 text-sm text-copper">{memoryNote}</p> : null}
      {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
      <div className="mt-8 flex flex-col gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const primary = card.id === "desk";
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onOpen(card.id)}
              className={
                "flex min-h-20 items-center gap-4 rounded-3xl bg-card px-5 py-4 text-left transition " +
                (primary ? "border-2 border-copper" : "border-2 border-transparent hover:border-edge")
              }
            >
              <Icon className="size-6 shrink-0 text-copper" strokeWidth={1.75} />
              <span>
                <span className="block text-lg font-medium leading-tight">{card.title}</span>
                <span className="mt-1 block text-sm text-mute">{card.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-10 flex items-center justify-between text-sm text-mute">
        <UserButton />
        <button type="button" onClick={onAccount} className="min-h-11">
          Account
        </button>
        <button type="button" onClick={() => void signOutMacman()} className="min-h-11">
          Sign out
        </button>
      </div>
    </div>
  );
}

function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return path && path.length < 32 ? `${host}${path}` : host;
  } catch {
    return "Source";
  }
}

function MessageBody({ body }: { body: string }) {
  const [prose, listed] = body.split("\n\nSources\n");
  const sources = [...new Set((listed ?? "").split("\n").map((line) => line.trim()))].filter((line) =>
    /^https:\/\/\S+$/.test(line),
  );
  return (
    <>
      <p className="mt-1 text-base leading-relaxed whitespace-pre-wrap">{prose}</p>
      {sources.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {sources.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="text-sm text-copper underline">
                {sourceLabel(url)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ChannelView({
  channel,
  alias,
  onBack,
  onMemory,
}: {
  channel: Channel;
  alias: string;
  onBack: () => void;
  onMemory: (memory: string | null, memories?: SavedMemory[]) => void;
}) {
  const card = CARDS.find((item) => item.id === channel)!;
  const [lines, setLines] = useState<Line[] | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hearing, setHearing] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancel = false;
    listLines({ data: { channel } })
      .then((rows) => {
        if (!cancel) setLines(rows);
      })
      .catch((error: unknown) => {
        if (!cancel) {
          setLines([]);
          setNote(errorText(error));
        }
      });
    return () => {
      cancel = true;
    };
  }, [channel]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    if (channel === "text" && !optedIn && body.toUpperCase() !== "STOP") {
      setNote("Opt in before a simulated text. STOP is always accepted.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      if (channel === "desk" || channel === "voice") {
        const result =
          channel === "desk"
            ? await sendDesk({ data: { body, timeZone: localZone() } })
            : await sendVoice({ data: { body, timeZone: localZone() } });
        setLines((current) => [
          ...(current ?? []),
          result.line,
          ...(result.reply ? [result.reply] : []),
        ]);
        onMemory(result.memory, result.memories);
        if (!result.reply) setNote("Kept. The desk has no answer yet.");
      } else if (channel === "mail") {
        const result = await saveMail({ data: { subject, body, timeZone: localZone() } });
        setLines((current) => [...(current ?? []), result.line, ...(result.reply ? [result.reply] : [])]);
        onMemory(result.memory, result.memories);
        setSubject("");
        setNote(result.reply ? "Answered here. Not delivered." : "Kept. The desk has no answer yet.");
      } else {
        const result = await saveText({ data: { body, timeZone: localZone() } });
        setLines((current) => [...(current ?? []), result.line, ...(result.reply ? [result.reply] : [])]);
        onMemory(result.memory, result.memories);
        setNote(result.reply ? "Answered here. Not sent." : "Kept. The desk has no answer yet.");
      }
      setDraft("");
    } catch (error) {
      setNote(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function practiceVoice(body: string): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const result = await practiceCarrier({
        data: { kind: "voice", body, simulated: true, timeZone: localZone() },
      });
      setLines((current) => [...(current ?? []), result.line, ...(result.reply ? [result.reply] : [])]);
      onMemory(result.memory, result.memories);
      setNote("Simulated. Nothing was dialed.");
    } catch (error) {
      setNote(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function askVoice(body: string): Promise<string | null> {
    setBusy(true);
    setNote(null);
    try {
      const result = await sendVoice({ data: { body, timeZone: localZone() } });
      setLines((current) => [...(current ?? []), result.line, ...(result.reply ? [result.reply] : [])]);
      onMemory(result.memory, result.memories);
      if (!result.reply) setNote("Kept. The desk has no answer yet.");
      return result.reply?.id ?? null;
    } catch (error) {
      setNote(errorText(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function stopHear() {
    audioRef.current?.pause();
    audioRef.current = null;
    setHearing(null);
  }

  async function hear(lineId: string, selected: VoiceId = "eve") {
    if (hearing) return;
    setHearing(lineId);
    setNote(null);
    try {
      const result = await hearLine({ data: { lineId, voiceId: selected } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      const src = "url" in result && result.url ? result.url : `data:audio/mpeg;base64,${result.audio}`;
      const audio = new Audio(src);
      audioRef.current = audio;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        audio.onended = done;
        audio.onpause = done;
        void audio.play().catch(() => {
          setNote("Tap Hear it to play that reply.");
          done();
        });
      });
    } catch (error) {
      setNote(errorText(error));
    } finally {
      setHearing(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-5 pt-5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-full px-3 text-sm text-mute hover:text-cream"
        >
          Desk
        </button>
        <h2 className="font-serif text-3xl">{card.title}</h2>
      </div>
      <p className="px-5 pt-2 text-sm leading-relaxed text-mute">
        {channel === "desk" && "Write it here. A current question is checked on the web. A private one stays on the desk."}
        {channel === "voice" && "A browser call listens, answers aloud, then listens again. A phone call is not connected."}
        {channel === "mail" &&
          `A letter on ${alias || "your alias"}. Answered here. An outside inbox is not connected, and nothing is sent without your confirmation.`}
        {channel === "text" &&
          "A short line, answered here. Simulated only. Reply STOP to opt out. Nothing is sent to a phone."}
      </p>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
        {lines === null ? (
          <p className="text-sm text-mute">Opening…</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-mute">Nothing kept yet.</p>
        ) : (
          lines.map((line) => (
            <article key={line.id}>
              <p className="text-xs tracking-widest text-copper uppercase">
                {line.role === "person" ? "You" : "Macman"}
              </p>
              {line.subject ? <p className="mt-1 text-sm text-mute">{line.subject}</p> : null}
              <MessageBody body={line.body} />
              {line.role === "macman" ? (
                <button
                  type="button"
                  onClick={() => hear(line.id)}
                  disabled={hearing === line.id}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-copper px-4 text-sm text-copper disabled:opacity-60"
                >
                  <Volume2 className="size-4" />
                  {hearing === line.id ? "Playing…" : "Hear it"}
                </button>
              ) : null}
            </article>
          ))
        )}
        {busy ? <p className="text-sm text-copper">The desk is writing…</p> : null}
        {note ? <p className="text-sm text-mute">{note}</p> : null}
      </div>
      {channel === "voice" ? (
        <VoiceCall busy={busy} onAsk={askVoice} onPractice={practiceVoice} onHear={hear} onStop={stopHear} />
      ) : (
      <form
        className="border-t border-line px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {channel === "text" ? (
          <label className="mb-2 flex min-h-11 items-start gap-3 text-sm leading-relaxed text-cream">
            <input
              type="checkbox"
              checked={optedIn}
              onChange={(event) => setOptedIn(event.target.checked)}
              className="mt-1 size-4"
            />
            Allow simulated texts on this account. STOP opts out. Nothing is sent to a phone.
          </label>
        ) : null}
        {channel === "mail" ? (
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            maxLength={120}
            className="mb-2 w-full rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
          />
        ) : null}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={channel === "text" ? 2 : 3}
          maxLength={channel === "text" ? 160 : channel === "mail" ? 4000 : 2000}
          placeholder={card.hint}
          className="min-h-12 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="mt-3 min-h-12 w-full rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
        >
          {channel === "mail" ? "Ask in the letter" : channel === "text" ? "Ask by text" : "Ask the desk"}
        </button>
      </form>
      )}
    </div>
  );
}
