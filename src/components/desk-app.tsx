import { useEffect, useState } from "react";
import { Mail, MessageSquare, Mic, Pencil, Volume2 } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  getDesk,
  hearLine,
  listLines,
  saveMail,
  saveText,
  sendDesk,
  sendVoice,
} from "@/lib/desk.functions";
import type { Channel, DeskHome, Line } from "@/lib/desk-types";

type View = "home" | Channel;

const CARDS: { id: Channel; title: string; hint: string; icon: typeof Pencil }[] = [
  { id: "desk", title: "Desk", hint: "Write it here", icon: Pencil },
  { id: "voice", title: "Voice", hint: "Speak, then hear it", icon: Mic },
  { id: "mail", title: "Mail", hint: "A letter on your alias", icon: Mail },
  { id: "text", title: "Text", hint: "A short line, kept here", icon: MessageSquare },
];

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The desk could not keep that.";
}

export function DeskApp() {
  const user = useCurrentUser();
  const [home, setHome] = useState<DeskHome | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    if (!user?.id) return;
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
  }, [user?.id]);

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
          <span className="grid size-8 place-items-center rounded-full bg-card text-xs font-medium">
            G
          </span>
          Grok user
        </div>
      </header>

      {view === "home" ? (
        <Home
          home={home}
          error={homeError}
          onOpen={setView}
        />
      ) : (
        <ChannelView
          channel={view}
          alias={home?.alias ?? ""}
          onBack={() => setView("home")}
          onMemory={(memory) => setHome((current) => (current ? { ...current, memory } : current))}
        />
      )}
    </div>
  );
}

function Home({
  home,
  error,
  onOpen,
}: {
  home: DeskHome | null;
  error: string | null;
  onOpen: (view: View) => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-medium tracking-widest text-copper uppercase">Your desk</p>
      <h1 className="mt-4 font-serif text-5xl leading-none font-medium tracking-tight text-cream">
        Four lines.
        <br />
        One memory.
      </h1>
      <p className="mt-5 max-w-md text-base leading-relaxed text-cream/90">
        Web and voice answer here. Mail and text are stored on this account
        {home?.alias ? (
          <>
            {" "}
            under <span className="break-all text-mute">{home.alias}</span>
          </>
        ) : null}
        . They are not delivered to a phone or inbox yet.
      </p>
      {home?.memory ? (
        <p className="mt-6 border-l-2 border-copper pl-4 text-sm leading-relaxed text-mute">
          <span className="mb-1 block text-xs font-medium tracking-widest text-copper uppercase">
            The memory
          </span>
          {home.memory}
        </p>
      ) : null}
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
      <div className="mt-10 text-sm text-mute">
        <UserButton />
      </div>
    </div>
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
  onMemory: (memory: string | null) => void;
}) {
  const card = CARDS.find((item) => item.id === channel)!;
  const [lines, setLines] = useState<Line[] | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hearing, setHearing] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

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
    setBusy(true);
    setNote(null);
    try {
      if (channel === "desk" || channel === "voice") {
        const result =
          channel === "desk"
            ? await sendDesk({ data: { body } })
            : await sendVoice({ data: { body } });
        setLines((current) => [
          ...(current ?? []),
          result.line,
          ...(result.reply ? [result.reply] : []),
        ]);
        onMemory(result.memory);
        if (!result.reply) setNote("Kept. The desk has no answer yet.");
      } else if (channel === "mail") {
        const result = await saveMail({ data: { subject, body } });
        setLines((current) => [...(current ?? []), result.line]);
        onMemory(result.memory);
        setSubject("");
        setNote("Kept on your alias. Not delivered.");
      } else {
        const result = await saveText({ data: { body } });
        setLines((current) => [...(current ?? []), result.line]);
        onMemory(result.memory);
        setNote("Kept here. Not sent.");
      }
      setDraft("");
    } catch (error) {
      setNote(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function speak() {
    const Recognition = (
      window as Window & {
        SpeechRecognition?: new () => SpeechRec;
        webkitSpeechRecognition?: new () => SpeechRec;
      }
    ).SpeechRecognition ?? (
      window as Window & { webkitSpeechRecognition?: new () => SpeechRec }
    ).webkitSpeechRecognition;
    if (!Recognition) {
      setNote("This browser cannot listen. Write the line instead.");
      return;
    }
    const recog = new Recognition();
    recog.lang = "en";
    recog.interimResults = false;
    recog.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      if (said) setDraft(said);
    };
    recog.onerror = () => setNote("Could not hear that. Write the line instead.");
    recog.onend = () => setListening(false);
    setListening(true);
    recog.start();
  }

  async function hear(lineId: string) {
    if (hearing) return;
    setHearing(lineId);
    setNote(null);
    try {
      const result = await hearLine({ data: { lineId } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      const src = "url" in result && result.url ? result.url : `data:audio/mpeg;base64,${result.audio}`;
      const audio = new Audio(src);
      await audio.play();
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
        {channel === "desk" && "Write it here. A reply takes a few seconds."}
        {channel === "voice" && "Speak, then hear it. Playback runs only when you tap Hear it."}
        {channel === "mail" &&
          `A letter on ${alias || "your alias"}. Stored on this account. Not delivered.`}
        {channel === "text" && "A short line, kept here. Not sent to a phone."}
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
              <p className="mt-1 text-base leading-relaxed whitespace-pre-wrap">{line.body}</p>
              {channel === "voice" && line.role === "macman" ? (
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
      <form
        className="border-t border-line px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {channel === "mail" ? (
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            maxLength={120}
            className="mb-2 w-full rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
          />
        ) : null}
        <div className="flex items-end gap-2">
          {channel === "voice" ? (
            <button
              type="button"
              onClick={speak}
              className="grid size-12 shrink-0 place-items-center rounded-full border border-copper text-copper"
              aria-label={listening ? "Listening" : "Speak"}
            >
              <Mic className="size-5" />
            </button>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={channel === "text" ? 2 : 3}
            maxLength={channel === "text" ? 160 : channel === "mail" ? 4000 : 2000}
            placeholder={card.hint}
            className="min-h-12 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="mt-3 min-h-12 w-full rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
        >
          {channel === "mail" ? "Keep the letter" : channel === "text" ? "Keep the line" : "Ask the desk"}
        </button>
      </form>
    </div>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
