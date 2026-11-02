import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { reduceCall, type CallPhase } from "@/lib/voice/call-machine";
import { VOICES, voiceId, type VoiceId } from "@/lib/voice/voices";
import { telephoneLine } from "@/lib/telephony/line";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Browser call is ready",
  listening: "Listening",
  thinking: "The desk is answering",
  speaking: "Speaking",
  muted: "Muted",
};

export function VoiceCall({
  busy,
  onAsk,
  onHear,
  onStop,
}: {
  busy: boolean;
  onAsk: (body: string) => Promise<string | null>;
  onHear: (lineId: string, voice: VoiceId) => Promise<void>;
  onStop: () => void;
}) {
  const line = telephoneLine();
  const [phase, setPhaseState] = useState<CallPhase>("idle");
  const [voice, setVoice] = useState<VoiceId>("eve");
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const phaseRef = useRef<CallPhase>("idle");
  const live = useRef(false);
  const muted = useRef(false);
  const taking = useRef(false);
  const recogRef = useRef<SpeechRec | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setVoice(voiceId(window.localStorage.getItem("macman-voice")));
  }, []);

  function setPhase(next: CallPhase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  function apply(event: Parameters<typeof reduceCall>[1]) {
    setPhase(reduceCall(phaseRef.current, event));
  }

  function stopRecog() {
    const recog = recogRef.current;
    recogRef.current = null;
    try {
      recog?.stop();
    } catch {
      /* already stopped */
    }
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function listen() {
    if (!live.current || muted.current || taking.current) return;
    const Recognition = (
      window as Window & {
        SpeechRecognition?: new () => SpeechRec;
        webkitSpeechRecognition?: new () => SpeechRec;
      }
    ).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!Recognition) {
      setNote("This browser cannot turn speech into text. Type the line instead.");
      return;
    }
    const recog = new Recognition();
    recog.lang = "en";
    recog.interimResults = false;
    recog.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (said) void turn(said);
    };
    recog.onerror = () => {
      if (live.current) setNote("Could not hear that. The call is still open.");
    };
    recog.onend = () => {
      if (recogRef.current === recog && live.current && !muted.current && !taking.current) listen();
    };
    recogRef.current = recog;
    try {
      recog.start();
    } catch {
      setNote("Could not start listening. Type the line instead.");
    }
  }

  async function turn(said: string) {
    if (taking.current) return;
    taking.current = true;
    stopRecog();
    apply({ type: "heard" });
    setNote(null);
    try {
      const replyId = await onAsk(said);
      if (replyId && !muted.current) {
        if (live.current) apply({ type: "reply" });
        await onHear(replyId, voice);
        if (live.current && !muted.current) apply({ type: "spoken" });
      } else if (live.current && !muted.current && phaseRef.current === "thinking") {
        apply({ type: "spoken" });
      }
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : "The desk could not answer.");
      if (!live.current) setPhase("idle");
      else if (muted.current) setPhase("muted");
      else setPhase("listening");
    } finally {
      taking.current = false;
      if (live.current && !muted.current) listen();
    }
  }

  async function start() {
    if (phaseRef.current !== "idle") return;
    setNote(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      apply({ type: "denied" });
      setNote("The microphone was not allowed. You can still type a line.");
      return;
    }
    live.current = true;
    muted.current = false;
    apply({ type: "start" });
    listen();
  }

  function mute() {
    if (phaseRef.current === "idle" || muted.current) return;
    muted.current = true;
    streamRef.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    stopRecog();
    onStop();
    apply({ type: "mute" });
  }

  function unmute() {
    if (!muted.current) return;
    muted.current = false;
    streamRef.current?.getTracks().forEach((track) => {
      track.enabled = true;
    });
    apply({ type: "unmute" });
    listen();
  }

  function end() {
    live.current = false;
    muted.current = false;
    taking.current = false;
    stopRecog();
    releaseMic();
    onStop();
    apply({ type: "end" });
  }

  useEffect(() => () => end(), []);

  function choose(next: VoiceId) {
    setVoice(next);
    window.localStorage.setItem("macman-voice", next);
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <p className="text-xs font-medium tracking-widest text-copper uppercase">Browser call</p>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        {PHASE_LABEL[phase]}. Your microphone stays on this device. This is not a phone call.
      </p>
      <label className="mt-3 block text-sm text-mute">
        Voice
        <select
          value={voice}
          onChange={(event) => choose(voiceId(event.target.value))}
          className="mt-1 min-h-12 w-full rounded-2xl border border-edge bg-card px-4 text-base text-cream"
        >
          {VOICES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} — {item.tone}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex gap-2">
        {phase === "idle" ? (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-copper px-4 text-base font-medium text-ink"
          >
            <Mic className="size-4" />
            Start browser call
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={muted.current || phase === "muted" ? unmute : mute}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-copper px-4 text-sm text-copper"
            >
              <MicOff className="size-4" />
              {phase === "muted" ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={end}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-copper px-4 text-base font-medium text-ink"
            >
              <PhoneOff className="size-4" />
              End call
            </button>
          </>
        )}
      </div>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body || busy) return;
          setDraft("");
          void turn(body);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Or type a line"
          className="min-h-12 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="mt-2 min-h-12 w-full rounded-full border border-edge text-base text-cream disabled:opacity-50"
        >
          Ask the desk
        </button>
      </form>
      {note ? <p className="mt-3 text-sm text-mute">{note}</p> : null}
      <div className="mt-4 rounded-2xl border border-edge bg-card px-4 py-3">
        <p className="text-xs font-medium tracking-widest text-copper uppercase">Telephone</p>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Not connected. A phone call still needs {line.missing.join(", ")}. None of those are turned on, and no call is placed.
        </p>
      </div>
    </div>
  );
}
