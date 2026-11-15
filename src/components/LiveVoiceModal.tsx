import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';
import type { StudioVoiceName } from '../types';

interface LiveVoiceModalProps {
  isOpen: boolean;
  sessionId: string;
  voiceName: StudioVoiceName;
  onClose: () => void;
}

interface TranscriptLine {
  id: string;
  speaker: 'You' | 'Studio' | 'Tool';
  text: string;
}

function pcmFloatToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32Pcm(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  sessionId,
  voiceName,
  onClose,
}) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [interactionState, setInteractionState] = useState<string>('IDLE');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  const mutedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMsg(null);
    setTranscript([]);

    const startLive = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;
        nextStartTimeRef.current = outputCtx.currentTime;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/api/studio/live?sessionId=${encodeURIComponent(
            sessionId
          )}`
        );
        wsRef.current = ws;

        const clearPlaybackQueue = () => {
          for (const src of activeSourcesRef.current) {
            try {
              src.stop();
            } catch {
              // ignore already stopped
            }
          }
          activeSourcesRef.current = [];
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
        };

        const schedulePcmChunk = (base64Audio: string) => {
          const ctx = outputCtxRef.current;
          if (!ctx) return;
          const samples = base64ToFloat32Pcm(base64Audio);
          const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
          audioBuffer.getChannelData(0).set(samples);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);

          const now = ctx.currentTime;
          if (nextStartTimeRef.current < now) {
            nextStartTimeRef.current = now + 0.02;
          }
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
          activeSourcesRef.current.push(source);
          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
          };
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.ready) {
              setStatus('connected');
            }
            if (msg.error) {
              setStatus('error');
              setErrorMsg(msg.error);
            }
            if (msg.audio) {
              schedulePcmChunk(msg.audio);
            }
            if (msg.interrupted) {
              clearPlaybackQueue();
            }
            if (msg.interactionStatus) {
              setInteractionState(String(msg.interactionStatus));
            }
            if (msg.inputTranscript) {
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'You') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text} ${msg.inputTranscript}`.trim() },
                  ];
                }
                return [
                  ...prev,
                  { id: `t-${Date.now()}`, speaker: 'You', text: msg.inputTranscript },
                ];
              });
            }
            if (msg.outputTranscript) {
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'Studio') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text}${msg.outputTranscript}` },
                  ];
                }
                return [
                  ...prev,
                  { id: `t-${Date.now()}`, speaker: 'Studio', text: msg.outputTranscript },
                ];
              });
            }
            if (msg.toolUsed) {
              setTranscript((prev) => [
                ...prev,
                {
                  id: `t-${Date.now()}-${Math.random()}`,
                  speaker: 'Tool',
                  text: `Executed ${msg.toolUsed}`,
                },
              ]);
            }
          } catch {
            // ignore malformed server frame
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus('error');
            setErrorMsg('WebSocket connection error.');
          }
        };

        ws.onopen = () => {
          const source = inputCtx.createMediaStreamSource(mediaStream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inputCtx.destination);
          processor.onaudioprocess = (e) => {
            if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const channel = e.inputBuffer.getChannelData(0);
            ws.send(JSON.stringify({ audio: pcmFloatToBase64(channel) }));
          };
        };
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Microphone permission is required for Live Voice.'
          );
        }
      }
    };

    startLive();

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        inputCtxRef.current?.close();
      } catch {}
      try {
        outputCtxRef.current?.close();
      } catch {}
    };
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-voice-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2
              id="live-voice-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Live Voice Conversation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Voice: {voiceName} · Thinking: Extended · Tools &amp; Skills.md active
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice session"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {status === 'connecting'
                    ? 'Connecting microphone & Gemini Live...'
                    : status === 'error'
                      ? 'Connection Issue'
                      : interactionState === 'IN_PROGRESS'
                        ? 'Thinking & speaking...'
                        : 'Listening — speak naturally'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {muted ? 'Microphone muted' : 'Microphone open'}
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2.5 min-h-[160px]">
            {transcript.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
                Say hello or ask anything — your Skills.md, Tools, Memory, and Connectors work in voice mode too.
              </p>
            ) : (
              transcript.map((item) => (
                <div
                  key={item.id}
                  className={`text-xs leading-relaxed p-2.5 rounded-lg ${
                    item.speaker === 'You'
                      ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100'
                      : item.speaker === 'Tool'
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono'
                        : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="font-semibold mr-2">{item.speaker}:</span>
                  <span>{item.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 bg-slate-50/70 dark:bg-[#0F131C]">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
              muted
                ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{muted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Voice Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
