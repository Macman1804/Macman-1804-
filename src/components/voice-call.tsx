import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { transcribeSpeech } from "@/lib/desk.functions";
import { SETUP_CHECKLIST } from "@/lib/telephony/exchange";
import { reduceCall, type CallPhase } from "@/lib/voice/call-machine";
import { MIN_BYTES, nextUtterance } from "@/lib/voice/utterance";
import { VOICES, voiceId, type VoiceId } from "@/lib/voice/voices";

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Browser call is ready",
  listening: "Listening",
  thinking: "The desk is answering",
  speaking: "Speaking",
  muted: "Muted",
};

function recorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function VoiceCall({
  busy,
  onAsk,
  onPractice,
  onHear,
  onStop,
}: {
  busy: boolean;
  onAsk: (body: string) => Promise<string | null>;
  onPractice: (body: string) => Promise<void>;
  onHear: (lineId: string, voice: VoiceId) => Promise<void>;
  onStop: () => void;
}) {
  const [phase, setPhaseState] = useState<CallPhase>("idle");
  const [voice, setVoice] = useState<VoiceId>("eve");
  const [note, setNote] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [pickingUp, setPickingUp] = useState(false);
  const [draft, setDraft] = useState("");
  const phaseRef = useRef<CallPhase>("idle");
  const live = useRef(false);
  const muted = useRef(false);
  const taking = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechRef = useRef({ heard: false, quietMs: 0, bytes: 0 });
  const flushRef = useRef(false);

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

  function stopTimer() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function releaseMic() {
    stopTimer();
    stopRecorder();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioRef.current?.close();
    audioRef.current = null;
  }

  function beginRecording() {
    if (!live.current || muted.current || taking.current || !streamRef.current) return;
    if (typeof MediaRecorder === "undefined") {
      setNote("This phone cannot record audio for transcription. Type the line instead.");
      return;
    }
    const mime = recorderMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    } catch {
      setNote("This phone cannot record audio for transcription. Type the line instead.");
      return;
    }
    chunksRef.current = [];
    speechRef.current = { heard: false, quietMs: 0, bytes: 0 };
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunksRef.current.push(event.data);
      speechRef.current.bytes += event.data.size;
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
      chunksRef.current = [];
      if (!flushRef.current) return;
      flushRef.current = false;
      void finishRecording(blob);
    };
    recorderRef.current = recorder;
    recorder.start(200);
  }

  async function finishRecording(blob: Blob) {
    if (!live.current || muted.current) return;
    if (blob.size < MIN_BYTES) {
      setNote("No words were captured. Speak a little closer and try again.");
      resumeListening();
      return;
    }
    setHeard("Transcribing…");
    setNote(null);
    try {
      const audio = await blobToBase64(blob);
      const result = await transcribeSpeech({ data: { audio, mime: blob.type } });
      if (!live.current) return;
      if (!result.ok) {
        setHeard("");
        setNote(result.error);
        resumeListening();
        return;
      }
      setHeard(result.text);
      await turn(result.text);
    } catch (error) {
      setHeard("");
      setNote(error instanceof Error && error.message ? error.message : "Transcription failed. Speak the line again.");
      resumeListening();
    }
  }

  function resumeListening() {
    taking.current = false;
    if (live.current && !muted.current) beginRecording();
  }

  function watchLevel(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);
    stopTimer();
    timerRef.current = window.setInterval(() => {
      if (!live.current || muted.current || taking.current) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      const level = Math.sqrt(sum / samples.length);
      const next = nextUtterance({ ...speechRef.current, level, frameMs: 100 });
      if (next.heard !== speechRef.current.heard) setPickingUp(next.heard);
      speechRef.current = { heard: next.heard, quietMs: next.quietMs, bytes: speechRef.current.bytes };
      if (next.action === "wait") return;
      flushRecording();
    }, 100);
  }

  function flushRecording() {
    if (!live.current || muted.current || taking.current) return;
    setPickingUp(false);
    flushRef.current = true;
    taking.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    flushRef.current = false;
    taking.current = false;
    setNote("Nothing was recorded yet. Speak, then send it.");
  }

  async function turn(said: string) {
    if (!said.trim()) return;
    taking.current = true;
    stopRecorder();
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
      if (live.current && !muted.current) beginRecording();
    }
  }

  async function start() {
    if (phaseRef.current !== "idle") return;
    setNote(null);
    setHeard("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const context = new AudioContext();
      await context.resume();
      audioRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      context.createMediaStreamSource(stream).connect(analyser);
      live.current = true;
      muted.current = false;
      apply({ type: "start" });
      beginRecording();
      watchLevel(analyser);
    } catch {
      releaseMic();
      apply({ type: "denied" });
      setNote("The microphone was not allowed. You can still type a line.");
    }
  }

  function mute() {
    if (phaseRef.current === "idle" || muted.current) return;
    muted.current = true;
    streamRef.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    stopTimer();
    stopRecorder();
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
    if (analyserRef.current) {
      beginRecording();
      watchLevel(analyserRef.current);
    }
  }

  function end() {
    live.current = false;
    muted.current = false;
    taking.current = false;
    setPickingUp(false);
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
        {phase === "listening" && pickingUp
          ? "Hearing you. Pause, or tap Send what I said."
          : phase === "listening"
            ? "Listening. Speak, then pause."
            : phase === "muted"
              ? "Muted. Tap Unmute to speak again."
              : `${PHASE_LABEL[phase]}.`}{" "}
        Your microphone stays on this device. This is not a phone call.
      </p>
      {heard ? <p className="mt-3 text-base leading-relaxed text-cream">Heard: {heard}</p> : null}
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
              onClick={phase === "muted" ? unmute : mute}
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
      {phase === "listening" ? (
        <button
          type="button"
          onClick={flushRecording}
          className="mt-2 min-h-12 w-full rounded-full border border-copper text-base text-copper"
        >
          Send what I said
        </button>
      ) : null}
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
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body || busy) return;
          setDraft("");
          setHeard(body);
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
      {note ? <p className="mt-3 text-sm leading-relaxed text-copper">{note}</p> : null}
      <div className="mt-4 rounded-2xl border border-edge bg-card px-4 py-3">
        <p className="text-xs font-medium tracking-widest text-copper uppercase">Telephone</p>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Not connected. No credentials are stored, no number is attached, and no call or text is sent.
        </p>
        <ol className="mt-3 flex flex-col gap-2">
          {SETUP_CHECKLIST.map((step, index) => (
            <li key={step.id} className="text-sm leading-relaxed text-mute">
              <span className="text-copper">{index + 1}. {step.title}. </span>
              {step.detail}
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => {
            const body = draft.trim();
            if (!body) return;
            setDraft("");
            setHeard(body);
            void onPractice(body);
          }}
          className="mt-3 min-h-12 w-full rounded-full border border-copper text-base text-copper disabled:opacity-50"
        >
          Practice on the desk
        </button>
        <p className="mt-2 text-sm leading-relaxed text-mute">This practice stays in your voice memory. It is not a telephone call.</p>
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.readAsDataURL(blob);
  });
}
