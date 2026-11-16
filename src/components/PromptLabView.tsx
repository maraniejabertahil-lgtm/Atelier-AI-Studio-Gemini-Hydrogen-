import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  Edit3,
  ExternalLink,
  FileText,
  Film,
  Globe,
  Mic,
  Moon,
  Paperclip,
  PhoneCall,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Volume2,
  Wrench,
  X,
  Code2,
  Eye,
  Terminal,
  Plug,
  Cable,
  Monitor,
} from 'lucide-react';
import type {
  ChatAttachment,
  ChatMessage,
  GeminiModelId,
  GroundingSource,
  PromptSession,
  StudioState,
  StudioView,
  StudioVoiceName,
  ThinkingLevelOption,
  TokenUsageStats,
  ToolExecutionTrace,
} from '../types';
import { getLocalModelSpec, isLocalModel, LOCAL_MODEL_SPECS } from '../lib/localModels';
import { extractSkillBody, selectAutoRoutedSkills } from '../lib/skillRouter';
import { extractFramesFromVideoFile, extractFramesFromZipFile } from '../lib/videoFrames';
import { MarkdownRenderer } from './MarkdownRenderer';
import { LiveVoiceModal } from './LiveVoiceModal';
import { VisionaryModal } from './VisionaryModal';

interface PromptLabViewProps {
  state: StudioState;
  activeSession: PromptSession;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSession: (patch: Partial<PromptSession>) => void;
  onNavigateView: (view: StudioView) => void;
  onMemoriesUpdated: (memories: StudioState['memories']) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Live Weather Connector',
    prompt: 'Check the current weather in Tokyo (35.6762, 139.6503) and London (51.5072, -0.1276) using the weather connector, and present a comparison table.',
  },
  {
    title: 'GitHub API Connector',
    prompt: 'Inspect the googleapis/js-genai repository on GitHub and summarize its stars, open issues, and primary focus.',
  },
  {
    title: 'Custom Tool + Studio Memory',
    prompt: 'Calculate the compound growth of $15,000 at 7.2% annual return over 12 years using evaluate_calculation, then save the result to Studio memory.',
  },
  {
    title: 'Skills.md Self-Check',
    prompt: 'Summarize the active Skills.md instructions currently mounted in this session and show how you will apply them.',
  },
];

function ToolTraceCard({ trace }: { trace: ToolExecutionTrace }) {
  const [expanded, setExpanded] = useState(false);

  const sourceLabel =
    trace.source === 'connector'
      ? 'Connector'
      : trace.source === 'plugin_memory'
        ? 'Studio Memory'
        : trace.source === 'skill_router'
          ? 'Skill Router'
          : 'Custom Tool';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#11151E] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
            {trace.toolName}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
            · {sourceLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums shrink-0">
          <span className={trace.error ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}>
            {trace.error ? 'Error' : 'OK'}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 dark:text-slate-400">{trace.durationMs} ms</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-2.5 bg-white dark:bg-[#0D1017] text-xs font-mono">
          <div>
            <div className="text-[11px] font-sans font-medium text-slate-500 dark:text-slate-400 mb-1">
              Arguments
            </div>
            <pre className="p-2.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-x-auto">
              {JSON.stringify(trace.args, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[11px] font-sans font-medium text-slate-500 dark:text-slate-400 mb-1">
              {trace.error ? 'Error' : 'Result'}
            </div>
            <pre className="p-2.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-x-auto max-h-56">
              {trace.error
                ? trace.error
                : JSON.stringify(trace.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ThoughtAccordion({
  thoughts,
  isStreaming,
}: {
  thoughts: string;
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!thoughts.trim()) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#11151E] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{isStreaming ? 'Thinking...' : 'Thoughts'}</span>
        </div>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
          {thoughts.length} chars
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3.5 bg-white dark:bg-[#0D1017] text-xs leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
          {thoughts}
        </div>
      )}
    </div>
  );
}

export const PromptLabView: React.FC<PromptLabViewProps> = ({
  state,
  activeSession,
  theme,
  onToggleTheme,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onUpdateSession,
  onNavigateView,
  onMemoriesUpdated,
}) => {
  const [sessionFilter, setSessionFilter] = useState('');
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingThoughts, setStreamingThoughts] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [streamingTraces, setStreamingTraces] = useState<ToolExecutionTrace[]>([]);
  const [streamingSources, setStreamingSources] = useState<GroundingSource[]>([]);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'preview' | 'code'>('preview');
  const [composerMode, setComposerMode] = useState<'chat' | 'terminal'>('chat');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalToken, setTerminalToken] = useState('');
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const [visionaryOpen, setVisionaryOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [localStatus, setLocalStatus] = useState<'idle' | 'loading' | 'ready' | 'generating'>('idle');
  const [localProgressPct, setLocalProgressPct] = useState<number | null>(null);
  const [localStatusMsg, setLocalStatusMsg] = useState('');
  const [localBackend, setLocalBackend] = useState<'webgpu' | 'wasm' | null>(null);
  const [localLoadedKey, setLocalLoadedKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const localWorkerRef = useRef<Worker | null>(null);
  const localRunRejectRef = useRef<((err: Error) => void) | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isStreaming ? 'auto' : 'smooth',
    });
  }, [activeSession.messages.length, streamingText, streamingTraces.length, isStreaming]);

  useEffect(() => {
    return () => {
      localWorkerRef.current?.terminate();
      localWorkerRef.current = null;
    };
  }, []);

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.trim().toLowerCase();
    if (!q) return state.sessions;
    return state.sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [state.sessions, sessionFilter]);

  const mountedSkills = state.skills.filter((s) =>
    activeSession.activeSkillIds.includes(s.id)
  );

  const toggleIdInSession = (
    field:
      | 'activeSkillIds'
      | 'activeToolIds'
      | 'activePluginIds'
      | 'activeConnectorIds',
    id: string
  ) => {
    const current = activeSession[field];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onUpdateSession({ [field]: next });
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const next: ChatAttachment[] = [];
    setStreamError(null);

    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        try {
          const res = await extractFramesFromZipFile(file, 16);
          next.push(...res.frames);
        } catch (err) {
          setStreamError(
            err instanceof Error ? err.message : `Could not extract images from ${file.name}.`
          );
        }
        continue;
      }

      if (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) {
        try {
          const res = await extractFramesFromVideoFile(file, { fps: 1, maxFrames: 12 });
          next.push(...res.frames);
        } catch (err) {
          setStreamError(
            err instanceof Error ? err.message : `Could not extract frames from ${file.name}.`
          );
        }
        continue;
      }

      const isText =
        file.type.startsWith('text/') ||
        /\.(md|markdown|json|ts|tsx|js|jsx|py|csv|yaml|yml|xml|sql)$/i.test(file.name);

      if (isText) {
        const text = await file.text();
        next.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          data: text,
          isText: true,
          size: file.size,
        });
      } else {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || '');
            resolve(res.split(',')[1] || '');
          };
          reader.readAsDataURL(file);
        });
        next.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64,
          isText: false,
          size: file.size,
        });
      }
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  };

  const ensureLocalWorker = () => {
    if (!localWorkerRef.current) {
      localWorkerRef.current = new Worker(
        new URL('../workers/localAiWorker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return localWorkerRef.current;
  };

  const handleUnloadLocalModel = () => {
    if (localWorkerRef.current) {
      localWorkerRef.current.postMessage({ type: 'unload' });
    }
    setLocalStatus('idle');
    setLocalProgressPct(null);
    setLocalStatusMsg('Unloaded from iPad/browser RAM.');
    setLocalLoadedKey(null);
    setLocalBackend(null);
  };

  const handleModelChange = (nextModel: GeminiModelId) => {
    const nextThinking =
      nextModel === 'gemini-3.1-flash-lite' && activeSession.thinkingLevel === 'XHIGH'
        ? 'HIGH'
        : activeSession.thinkingLevel;
    onUpdateSession({ model: nextModel, thinkingLevel: nextThinking });
  };

  const runLocalPrompt = async (
    textToSend: string,
    filesToSend: ChatAttachment[],
    replaceFromMessageId?: string
  ) => {
    const spec = getLocalModelSpec(activeSession.model);
    if (!spec) return;

    if (filesToSend.some((f) => !f.isText)) {
      setStreamError(
        'In-browser models only support text/code attachments (switch to a Gemini cloud model for images).'
      );
      setIsStreaming(false);
      return;
    }

    const baseMessages = replaceFromMessageId
      ? activeSession.messages.slice(
          0,
          Math.max(
            0,
            activeSession.messages.findIndex((m) => m.id === replaceFromMessageId)
          )
        )
      : activeSession.messages;

    const textAttachmentBlock = filesToSend
      .filter((f) => f.isText)
      .map((f) => `\n[Attached file: ${f.name}]\n${f.data.slice(0, 2500)}`)
      .join('\n');

    const combinedUserPrompt = `${textToSend}${textAttachmentBlock}`.trim();

    // Keep system prompt + skills + recent history compact so 4 GB iPad 10 KV-cache never overflows RAM
    const customSys = activeSession.systemInstruction.trim();
    const baseSys = customSys
      ? customSys.slice(0, 550)
      : 'You are a helpful plain-English assistant. Define technical terms simply and organize answers with short steps.';

    const mountedIds = new Set(activeSession.activeSkillIds);
    const mountedSkills = state.skills.filter((s) => mountedIds.has(s.id));
    const hasSkillRouter = activeSession.activePluginIds.includes('plugin-skill-router');
    const autoLocalSkills = hasSkillRouter
      ? selectAutoRoutedSkills(textToSend, state.skills, mountedIds, 1)
      : [];

    const skillSnippetParts = [...autoLocalSkills, ...mountedSkills]
      .slice(0, 2)
      .map((skill) => {
        const body = extractSkillBody(skill.content) || skill.content.trim();
        return `[Skill: ${skill.name}]\n${body.slice(0, 450)}`;
      });

    const compactSystem =
      skillSnippetParts.length > 0
        ? `${baseSys}\n\n${skillSnippetParts.join('\n\n')}`
        : baseSys;

    const localSkillTraces: ToolExecutionTrace[] = autoLocalSkills.map((skill) => ({
      id: `trace-local-skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolName: `auto_skill: ${skill.filename}`,
      source: 'skill_router',
      args: { skillName: skill.name, mode: 'local-auto-matched' },
      result: { applied: true, description: skill.description },
      durationMs: 0,
    }));

    const recentTurns = baseMessages.slice(-4).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: (m.text || '').slice(0, 900),
    }));

    const workerMessages = [
      { role: 'system' as const, content: compactSystem },
      ...recentTurns,
      { role: 'user' as const, content: combinedUserPrompt },
    ];

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      text: textToSend,
      attachments: filesToSend.length > 0 ? filesToSend : undefined,
      createdAt: new Date().toISOString(),
    };

    const worker = ensureLocalWorker();
    let accumulated = '';
    const startedAt = Date.now();

    try {
      const result = await new Promise<{
        backend: 'webgpu' | 'wasm';
        latencyMs: number;
        approxTokens: number;
      }>((resolvePromise, rejectPromise) => {
        localRunRejectRef.current = rejectPromise;
        setLocalStatus(localLoadedKey === spec.id ? 'generating' : 'loading');
        setLocalProgressPct(localLoadedKey === spec.id ? 100 : 0);
        setLocalStatusMsg(
          localLoadedKey === spec.id
            ? `Running locally on ${localBackend === 'webgpu' ? 'WebGPU' : 'WASM'}...`
            : `Downloading ${spec.shortLabel} (${spec.downloadLabel})...`
        );

        const onMessage = (ev: MessageEvent) => {
          const data = ev.data as {
            type: string;
            text?: string;
            progress?: number;
            message?: string;
            backend?: 'webgpu' | 'wasm';
            modelKey?: string;
            latencyMs?: number;
            approxTokens?: number;
          };

          if (data.type === 'progress') {
            if (typeof data.progress === 'number') setLocalProgressPct(data.progress);
            setLocalStatus('loading');
            setLocalStatusMsg(
              `Downloading weights: ${typeof data.progress === 'number' ? `${data.progress}%` : '...'}`
            );
          } else if (data.type === 'status') {
            setLocalStatus('loading');
            if (data.message) setLocalStatusMsg(data.message);
          } else if (data.type === 'ready') {
            setLocalLoadedKey(data.modelKey || spec.id);
            if (data.backend) setLocalBackend(data.backend);
            setLocalProgressPct(100);
            setLocalStatus('generating');
            setLocalStatusMsg(
              `Generating locally (${data.backend === 'webgpu' ? 'WebGPU' : 'WASM'})...`
            );
          } else if (data.type === 'delta' && data.text) {
            accumulated += data.text;
            setStreamingText((prev) => prev + data.text);
          } else if (data.type === 'done') {
            worker.removeEventListener('message', onMessage);
            localRunRejectRef.current = null;
            setLocalStatus('ready');
            setLocalStatusMsg(
              `Ready on device (${data.backend === 'webgpu' ? 'WebGPU' : 'WASM'})`
            );
            resolvePromise({
              backend: data.backend || 'wasm',
              latencyMs: data.latencyMs || Date.now() - startedAt,
              approxTokens: data.approxTokens || Math.max(1, Math.round(accumulated.length / 4)),
            });
          } else if (data.type === 'error') {
            worker.removeEventListener('message', onMessage);
            localRunRejectRef.current = null;
            setLocalStatus('idle');
            rejectPromise(new Error(data.message || 'In-browser model execution failed.'));
          }
        };

        worker.addEventListener('message', onMessage);
        worker.postMessage({
          type: 'generate',
          modelKey: spec.id,
          hfModelId: spec.hfModelId,
          messages: workerMessages,
        });
      });

      const approxPromptTokens = Math.max(
        1,
        Math.round(workerMessages.reduce((sum, m) => sum + m.content.length, 0) / 4)
      );
      const modelMessage: ChatMessage = {
        id: `msg-${Date.now()}-m`,
        role: 'model',
        text: accumulated.trim() || '(Stopped before generating text.)',
        toolTraces: localSkillTraces.length > 0 ? localSkillTraces : undefined,
        tokenUsage: {
          promptTokens: approxPromptTokens,
          candidatesTokens: result.approxTokens,
          totalTokens: approxPromptTokens + result.approxTokens,
          latencyMs: result.latencyMs,
        },
        createdAt: new Date().toISOString(),
      };

      const nextTitle =
        baseMessages.length === 0 && textToSend.trim()
          ? textToSend.trim().slice(0, 44) + (textToSend.trim().length > 44 ? '…' : '')
          : activeSession.title;

      onUpdateSession({
        title: nextTitle,
        messages: [...baseMessages, userMessage, modelMessage],
      });
      setEditingMessageId(null);
    } catch (err) {
      if ((err as Error).message !== 'Stopped by user') {
        setStreamError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      localRunRejectRef.current = null;
    }
  };

  const runPrompt = async (
    overridePrompt?: string,
    replaceFromMessageId?: string,
    overrideAttachments?: ChatAttachment[],
    overrideModel?: GeminiModelId
  ) => {
    const textToSend = (overridePrompt ?? promptText).trim();
    const filesToSend = overrideAttachments ?? attachments;
    const effectiveModel = overrideModel ?? activeSession.model;
    if ((!textToSend && filesToSend.length === 0) || isStreaming) return;

    setStreamError(null);
    setFallbackNotice(null);
    setStreamingThoughts('');
    setStreamingText('');
    setStreamingTraces([]);
    setStreamingSources([]);
    setIsStreaming(true);

    if (!overridePrompt) {
      setPromptText('');
      setAttachments([]);
    }

    if (isLocalModel(effectiveModel)) {
      await runLocalPrompt(textToSend, filesToSend, replaceFromMessageId);
      return;
    }

    // Optimistic preview user message if not replacing
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/studio/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: activeSession.id,
          prompt: textToSend,
          attachments: filesToSend,
          replaceFromMessageId,
          sessionOverride: {
            model: effectiveModel,
            thinkingLevel: activeSession.thinkingLevel,
            systemInstruction: activeSession.systemInstruction,
            activeSkillIds: activeSession.activeSkillIds,
            activeToolIds: activeSession.activeToolIds,
            activePluginIds: activeSession.activePluginIds,
            activeConnectorIds: activeSession.activeConnectorIds,
            responseFormat: activeSession.responseFormat,
            responseSchemaJson: activeSession.responseSchemaJson,
          },
        }),
      });

      if (!resp.ok || !resp.body) {
        const errPayload = await resp.json().catch(() => ({}));
        throw new Error(errPayload.error || `Request failed with status ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const rawBlock of chunks) {
          const lines = rawBlock.split('\n');
          let eventName = 'message';
          let dataLine = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }

          if (!dataLine) continue;
          const payload = JSON.parse(dataLine);

          if (eventName === 'thought_delta') {
            setStreamingThoughts((prev) => prev + (payload.text || ''));
          } else if (eventName === 'text_delta') {
            setStreamingText((prev) => prev + (payload.text || ''));
          } else if (eventName === 'tool_trace') {
            setStreamingTraces((prev) => [...prev, payload as ToolExecutionTrace]);
          } else if (eventName === 'grounding') {
            setStreamingSources((payload.sources || []) as GroundingSource[]);
          } else if (eventName === 'memories_updated') {
            onMemoriesUpdated(payload.memories || []);
          } else if (eventName === 'model_fallback') {
            setFallbackNotice(
              payload.reason ||
                `Switched automatically from ${payload.from} to ${payload.to} due to rate limit.`
            );
          } else if (eventName === 'error') {
            setStreamError(payload.message || 'Model execution error.');
          } else if (eventName === 'done') {
            const { sessionTitle, userMessage, modelMessage } = payload as {
              sessionTitle: string;
              userMessage: ChatMessage;
              modelMessage: ChatMessage;
            };
            const baseMessages = replaceFromMessageId
              ? activeSession.messages.slice(
                  0,
                  Math.max(
                    0,
                    activeSession.messages.findIndex((m) => m.id === replaceFromMessageId)
                  )
                )
              : activeSession.messages;
            onUpdateSession({
              title: sessionTitle || activeSession.title,
              messages: [...baseMessages, userMessage, modelMessage],
            });
            setEditingMessageId(null);
            if (activeSession.autoSpeak && modelMessage.text) {
              speakText(modelMessage.id, modelMessage.text);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreamError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsStreaming(false);
      setStreamingThoughts('');
      setStreamingText('');
      setStreamingTraces([]);
      setStreamingSources([]);
      abortRef.current = null;
    }
  };

  const speakText = async (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      audioPlayerRef.current?.pause();
      setSpeakingMsgId(null);
      return;
    }
    try {
      audioPlayerRef.current?.pause();
      setSpeakingMsgId(msgId);
      const resp = await fetch('/api/studio/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName: activeSession.voiceName || 'Zephyr',
        }),
      });
      const data = (await resp.json()) as { audioBase64?: string; error?: string };
      if (!resp.ok || !data.audioBase64) {
        setSpeakingMsgId(null);
        return;
      }
      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      audioPlayerRef.current = audio;
      audio.onended = () => setSpeakingMsgId(null);
      audio.onerror = () => setSpeakingMsgId(null);
      await audio.play();
    } catch {
      setSpeakingMsgId(null);
    }
  };

  const toggleDictation = async () => {
    if (isDictating) {
      mediaRecorderRef.current?.stop();
      setIsDictating(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(String(reader.result || '').split(',')[1] || '');
            };
            reader.readAsDataURL(blob);
          });
          const resp = await fetch('/api/studio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          const data = (await resp.json()) as { text?: string };
          if (data.text) {
            setPromptText((prev) => (prev ? `${prev} ${data.text}` : data.text!));
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsDictating(true);
    } catch {
      setStreamError('Microphone permission is required for voice dictation.');
    }
  };

  const handleStopStream = () => {
    abortRef.current?.abort();
    if (isLocalModel(activeSession.model) && localWorkerRef.current) {
      localWorkerRef.current.postMessage({ type: 'interrupt' });
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setPromptText(msg.text);
    setAttachments(msg.attachments || []);
  };

  const handleRerunFromModelMsg = (modelIdx: number) => {
    const prevUserMsg = activeSession.messages[modelIdx - 1];
    if (!prevUserMsg || prevUserMsg.role !== 'user') return;
    runPrompt(prevUserMsg.text, prevUserMsg.id, prevUserMsg.attachments);
  };

  const lastUsage: TokenUsageStats | undefined = [...activeSession.messages]
    .reverse()
    .find((m) => m.role === 'model' && m.tokenUsage)?.tokenUsage;

  const hasBuiltInSearchOrUrl = state.plugins
    .filter((p) => activeSession.activePluginIds.includes(p.id))
    .some((p) => p.kind === 'google_search' || p.kind === 'url_context');

  const hasAutoSkillRouter = state.plugins
    .filter((p) => activeSession.activePluginIds.includes(p.id))
    .some((p) => p.kind === 'skill_router');

  const activeLocalSpec = getLocalModelSpec(activeSession.model);
  const latestModelText = [...activeSession.messages].reverse().find((m) => m.role === 'model')?.text || '';
  const generatedCodeBlocks = Array.from(latestModelText.matchAll(/```([a-zA-Z0-9_+#.-]*)\s*\n([\s\S]*?)```/g)).map((match, index) => ({ language: (match[1] || 'text').toLowerCase(), code: match[2].trim(), index }));
  const previewHtml = generatedCodeBlocks.find((block) => block.language === 'html' || block.language === 'htm')?.code || '';
  const runTerminalCommand = async () => {
    const command = promptText.trim();
    if (!command || terminalBusy) return;
    if (!terminalToken.trim()) {
      setTerminalOutput((current) => current + 'Enter your terminal access token first.\n');
      return;
    }
    setTerminalBusy(true);
    setTerminalOutput((current) => current + (current ? '\n' : '') + '$ ' + command + '\n');
    setPromptText('');
    try {
      const response = await fetch('/api/studio/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + terminalToken.trim() },
        body: JSON.stringify({ command }),
      });
      const data = await response.json() as { output?: string; error?: string };
      if (response.status === 401) setTerminalToken('');
      setTerminalOutput((current) => current + (data.output || data.error || 'Command completed.') + '\n');
    } catch (error) {
      setTerminalOutput((current) => current + (error instanceof Error ? error.message : 'Terminal request failed.') + '\n');
    } finally { setTerminalBusy(false); }
  };

  return (
    <div className="atelier-view-shell atelier-prompt-lab atelier-split-workspace flex-1 min-h-0 flex bg-slate-50 dark:bg-[#0D1017]">
      {/* LEFT RAIL: Prompt History & Quick Extension Summary */}
      <aside className="atelier-history-rail hidden lg:flex w-64 shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] flex-col">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={onCreateSession}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New prompt</span>
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              placeholder="Search prompts..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.map((sess) => {
            const selected = sess.id === activeSession.id;
            return (
              <div
                key={sess.id}
                className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg transition-colors ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(sess.id)}
                  className="flex-1 min-w-0 text-left text-xs font-medium truncate cursor-pointer"
                >
                  {sess.title}
                </button>
                {state.sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteSession(sess.id)}
                    aria-label="Delete prompt session"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Mounted Extensions Quick Overview */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            Studio Extensions
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('skills')}
            className="w-full flex items-center justify-between py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Skills.md</span>
            </span>
            <span className="font-mono tabular-nums">
              {activeSession.activeSkillIds.length}/{state.skills.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('tools')}
            className="w-full flex items-center justify-between py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              <span>Tools &amp; Plugins</span>
            </span>
            <span className="font-mono tabular-nums">
              {activeSession.activeToolIds.length + activeSession.activePluginIds.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('connectors')}
            className="w-full flex items-center justify-between py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>Connectors</span>
            </span>
            <span className="font-mono tabular-nums">
              {activeSession.activeConnectorIds.length}/{state.connectors.length}
            </span>
          </button>
        </div>
      </aside>

      {/* CENTER WORKBENCH: System Instructions + Prompt Stream + Composer */}
      <main className="atelier-chat-pane flex-1 min-w-0 flex flex-col">
        <div className="atelier-chat-heading px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Chatting with AI</div><div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{activeSession.title}</div></div>
          <select aria-label="Conversation history" value={activeSession.id} onChange={(e) => onSelectSession(e.target.value)} className="atelier-session-select max-w-[44%] min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#141820] text-[11px]">
            {state.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
          </select>
        </div>
        {/* System Instructions & Skills.md Drawer */}
        <div className="border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E]">
          <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setSystemExpanded((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer min-w-0"
            >
              {systemExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span className="truncate">System Instructions &amp; Skills.md</span>
              <span className="hidden sm:inline font-normal text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                · {activeLocalSpec ? 'Local compact mode' : hasAutoSkillRouter ? 'Auto-routed' : `${mountedSkills.length} mounted`}
              </span>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <select
                aria-label="Select AI Model"
                value={activeSession.model}
                onChange={(e) => handleModelChange(e.target.value as GeminiModelId)}
                className="max-w-[205px] sm:max-w-[260px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <optgroup label="Cloud Gemini (Smartest)">
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (Cloud)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Cloud)</option>
                </optgroup>
                <optgroup label="In-Browser iPad-Safe (Free · Zero Limits)">
                  <option value="local-smollm2-360m">SmolLM2 360M (~230 MB · Safest)</option>
                  <option value="local-qwen25-500m">Qwen 2.5 0.5B (~380 MB · Balanced)</option>
                </optgroup>
              </select>

              <button
                type="button"
                onClick={() => setMobileSettingsOpen(true)}
                aria-label="Open Run Settings"
                className="xl:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateView('skills')}
                className="hidden sm:inline-block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Edit Skills.md
              </button>
            </div>
          </div>

          {activeLocalSpec && (
            <div className="px-4 sm:px-5 py-2 border-t border-slate-200/80 dark:border-slate-800/80 bg-emerald-50/60 dark:bg-emerald-500/5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {activeLocalSpec.shortLabel}
                </span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">Download: {activeLocalSpec.downloadLabel}</span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">{activeLocalSpec.ramEstimateLabel} ({activeLocalSpec.ipad10Note})</span>
                {localStatusMsg && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {localStatusMsg}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {localStatus === 'loading' && typeof localProgressPct === 'number' && (
                  <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, Math.max(5, localProgressPct))}%` }}
                    />
                  </div>
                )}
                {localLoadedKey && (
                  <button
                    type="button"
                    onClick={handleUnloadLocalModel}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Free RAM
                  </button>
                )}
              </div>
            </div>
          )}

          {systemExpanded && (
            <div className="px-5 pb-4 space-y-3">
              {/* Quick Skills.md mount toggles (capped at 40 for fast iPad rendering) */}
              <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
                {[...state.skills]
                  .sort((a, b) => {
                    const aMounted = activeSession.activeSkillIds.includes(a.id) ? 0 : 1;
                    const bMounted = activeSession.activeSkillIds.includes(b.id) ? 0 : 1;
                    return aMounted - bMounted;
                  })
                  .slice(0, 40)
                  .map((skill) => {
                    const mounted = activeSession.activeSkillIds.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => toggleIdInSession('activeSkillIds', skill.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          mounted
                            ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {mounted && <Check className="w-3 h-3" />}
                        <span className="font-mono">{skill.filename}</span>
                      </button>
                    );
                  })}
                {state.skills.length > 40 && (
                  <button
                    type="button"
                    onClick={() => onNavigateView('skills')}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Manage all {state.skills.length.toLocaleString()} skills →
                  </button>
                )}
              </div>

              <textarea
                rows={4}
                value={activeSession.systemInstruction}
                onChange={(e) =>
                  onUpdateSession({ systemInstruction: e.target.value })
                }
                placeholder="Optional session-specific system instructions (automatically combined with your mounted Skills.md files)..."
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          )}
        </div>

        {/* Prompt / Response Stream */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {activeSession.messages.length === 0 && !isStreaming ? (
              <div className="py-10 space-y-8">
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    Personal AI Studio
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                    Just ask anything naturally—your <code className="font-mono text-xs">Skills.md</code> modules, custom Tools, Memory, and Connectors engage automatically when needed.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => runPrompt(item.prompt)}
                      className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] hover:border-blue-500/40 dark:hover:border-blue-500/40 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {item.title}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {item.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {activeSession.messages.map((msg, idx) => (
                  <div key={msg.id} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {msg.role === 'user' ? 'User' : 'Model'}
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.role === 'user' && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(msg)}
                            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                        {msg.role === 'model' && (
                          <>
                            <button
                              type="button"
                              onClick={() => speakText(msg.id, msg.text)}
                              className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer ${
                                speakingMsgId === msg.id ? 'text-blue-600 dark:text-blue-400' : ''
                              }`}
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>{speakingMsgId === msg.id ? 'Stop' : 'Speak'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRerunFromModelMsg(idx)}
                              disabled={isStreaming}
                              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Re-run</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.text)}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {msg.role === 'user' ? (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131824] p-4 space-y-3">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att) =>
                              att.mimeType.startsWith('image/') && !att.isText ? (
                                <img
                                  key={att.id}
                                  src={`data:${att.mimeType};base64,${att.data}`}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="h-24 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
                                />
                              ) : (
                                <div
                                  key={att.id}
                                  className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] text-xs font-mono text-slate-600 dark:text-slate-300"
                                >
                                  {att.name}
                                </div>
                              )
                            )}
                          </div>
                        )}
                        <div className="text-[14.5px] leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {msg.thoughts && <ThoughtAccordion thoughts={msg.thoughts} />}

                        {msg.toolTraces && msg.toolTraces.length > 0 && (
                          <div className="space-y-2">
                            {msg.toolTraces.map((trace) => (
                              <ToolTraceCard key={trace.id} trace={trace} />
                            ))}
                          </div>
                        )}

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#11151E] p-4">
                          <MarkdownRenderer content={msg.text} />

                          {msg.groundingSources && msg.groundingSources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Sources
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {msg.groundingSources.map((src) => (
                                  <a
                                    key={src.uri}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <span className="truncate max-w-xs">{src.title}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {msg.tokenUsage && (
                          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>Input: {msg.tokenUsage.promptTokens}</span>
                            <span aria-hidden="true">·</span>
                            <span>Output: {msg.tokenUsage.candidatesTokens}</span>
                            {msg.tokenUsage.thoughtsTokens ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Thoughts: {msg.tokenUsage.thoughtsTokens}</span>
                              </>
                            ) : null}
                            <span aria-hidden="true">·</span>
                            <span>{msg.tokenUsage.latencyMs} ms</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Active Streaming Turn */}
                {isStreaming && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Model · Generating
                    </div>

                    {streamingThoughts && (
                      <ThoughtAccordion thoughts={streamingThoughts} isStreaming />
                    )}

                    {streamingTraces.length > 0 && (
                      <div className="space-y-2">
                        {streamingTraces.map((trace) => (
                          <ToolTraceCard key={trace.id} trace={trace} />
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#11151E] p-4 min-h-[52px]">
                      {streamingText ? (
                        <MarkdownRenderer content={streamingText} />
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Running model &amp; tools...
                        </div>
                      )}

                      {streamingSources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Sources
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {streamingSources.map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <span className="truncate max-w-xs">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {fallbackNotice && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                    {fallbackNotice}
                  </div>
                )}

                {streamError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
                    <div className="font-semibold mb-1">Run Error</div>
                    <div>{streamError}</div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {composerMode === 'terminal' && <div className="atelier-terminal-output mx-3 mb-2 rounded-lg border border-slate-700 bg-[#0b1018] p-3 text-[11px] font-mono text-emerald-300 whitespace-pre-wrap max-h-48 overflow-y-auto"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400"><span>Authenticated project shell · bash · project-root working directory</span><button type="button" onClick={() => setTerminalOutput('')} className="text-slate-300 hover:text-white">Clear output</button></div>{terminalOutput || 'Full shell commands are enabled after terminal authentication. Each command starts in the project root; use cd path && command to work in a subfolder.'}</div>}
        {/* Bottom Prompt Composer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E]">
          <div className="max-w-3xl mx-auto space-y-2.5">
            {editingMessageId && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-300/60 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200">
                <span>Editing an earlier turn — running will branch from this message.</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessageId(null);
                    setPromptText('');
                    setAttachments([]);
                  }}
                  className="hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1017] text-xs text-slate-700 dark:text-slate-300"
                  >
                    <span className="font-mono truncate max-w-[180px]">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                      }
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-[#0D1017] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              {showInsertMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131824] shadow-xl p-2 z-20 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Insert Tool / Connector Reference
                  </div>
                  {state.tools.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPromptText((p) => `${p}${p ? ' ' : ''}Use ${t.name} to `);
                        setShowInsertMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {t.name}
                    </button>
                  ))}
                  {state.connectors.map((c) => <button key={c.id} type="button" onClick={() => toggleIdInSession('activeConnectorIds', c.id)} className="w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md text-xs text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><span><Cable className="inline w-3 h-3 mr-1.5"/>{c.name}</span><span>{activeSession.activeConnectorIds.includes(c.id) ? '✓ Mounted' : '＋ Mount'}</span></button>)}
                  <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">Plugins</div>
                  {state.plugins.map((plugin) => <button key={plugin.id} type="button" onClick={() => toggleIdInSession('activePluginIds', plugin.id)} className="w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><span><Plug className="inline w-3 h-3 mr-1.5"/>{plugin.name}</span><span>{activeSession.activePluginIds.includes(plugin.id) ? '✓ Mounted' : '＋ Mount'}</span></button>)}
                </div>
              )}

              <div className="flex items-center justify-between px-3 pt-2">
                <div className="inline-flex items-center rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5">
                  <button type="button" onClick={() => setComposerMode('chat')} className={composerMode === 'chat' ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-[#252c38] text-slate-900 dark:text-white shadow-sm' : 'px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-500'}>Chat</button>
                  <button type="button" onClick={() => setComposerMode('terminal')} className={composerMode === 'terminal' ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-[#252c38] text-emerald-600 dark:text-emerald-300 shadow-sm' : 'px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-500'}><Terminal className="inline w-3 h-3 mr-1"/>Terminal</button>
                </div>
                <span className="text-[10px] text-slate-500">{composerMode === 'terminal' ? 'Private project shell' : 'AI assistant'}</span>
              </div>
              {composerMode === 'terminal' && (
                <div className="px-3 pt-2">
                  <input
                    type="password"
                    value={terminalToken}
                    onChange={(e) => setTerminalToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Terminal access token (STUDIO_TERMINAL_TOKEN)"
                    aria-label="Terminal access token"
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1018] px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Set this secret in your hosting environment. Commands run on the server with your app's permissions.</p>
                </div>
              )}
              <textarea
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                    e.preventDefault();
                    if (composerMode === 'terminal') runTerminalCommand();
                    else runPrompt(undefined, editingMessageId || undefined);
                  }
                }}
                placeholder={composerMode === 'terminal' ? 'Enter a project command… (e.g. npm run build)' : 'Message your assistant... (Enter to send, Shift+Enter for new line)'}
                className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none resize-none"
              />

              <div className="px-3 pb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image, video, .zip frames, or text/markdown file"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Attach</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisionaryOpen(true)}
                    title="Visionary Module: slice video, ZIP frames, or inspect YouTube links"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Visionary</span>
                  </button>
                  <button type="button" onClick={() => setShowInsertMenu((v) => !v)} title="Mount plugins and connectors" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer">
                    <Plug className="w-3.5 h-3.5"/><span>Plugins &amp; Connectors</span>
                    <span className="text-[10px] opacity-70">{activeSession.activePluginIds.length + activeSession.activeConnectorIds.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleDictation}
                    disabled={isTranscribing}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                      isDictating
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      {isTranscribing ? 'Transcribing...' : isDictating ? 'Stop Mic' : 'Dictate'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveVoiceOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Talk Live</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFilePick}
                    className="hidden"
                  />
                </div>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStream}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => composerMode === 'terminal' ? runTerminalCommand() : runPrompt(undefined, editingMessageId || undefined)} disabled={composerMode === 'terminal' ? (!promptText.trim() || terminalBusy) : (!promptText.trim() && attachments.length === 0)} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors cursor-pointer">
                    {composerMode === 'terminal' ? <Terminal className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}<span>{composerMode === 'terminal' ? (terminalBusy ? 'Running' : 'Run') : 'Send'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>


      <section className="atelier-preview-pane min-w-0 flex flex-col border-l border-slate-200 dark:border-slate-800 bg-[#111318]">
        <div className="atelier-preview-toolbar h-14 shrink-0 px-5 flex items-center justify-between border-b border-[#292e38] bg-[#191c23]">
          <div className="flex items-center gap-2"><Monitor className="w-4 h-4 text-[#9ca3af]"/><div><div className="text-xs font-semibold text-[#f5f5f5]">Workspace</div><div className="text-[10px] text-[#9ca3af]">Generated project · Live output</div></div></div>
          <div className="flex items-center gap-1 rounded-lg border border-[#303642] bg-[#11151b] p-1">
            <button type="button" onClick={() => setWorkspaceTab('preview')} className={workspaceTab === 'preview' ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2b3442] text-white' : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#9ca3af]'}><Eye className="w-3.5 h-3.5"/>Preview</button>
            <button type="button" onClick={() => setWorkspaceTab('code')} className={workspaceTab === 'code' ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2b3442] text-white' : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#9ca3af]'}><Code2 className="w-3.5 h-3.5"/>Code <span className="text-[10px] opacity-70">{generatedCodeBlocks.length || ''}</span></button>
          </div>
        </div>
        <div className="atelier-preview-content flex-1 min-h-0 overflow-auto">
          {workspaceTab === 'preview' ? (previewHtml ? <iframe title="Generated application preview" sandbox="allow-scripts" srcDoc={previewHtml} className="w-full h-full min-h-[520px] bg-white border-0"/> : <div className="h-full min-h-[420px] flex items-center justify-center p-8"><div className="max-w-md text-center space-y-3"><div className="mx-auto w-14 h-14 rounded-2xl bg-[#222630] border border-[#303642] flex items-center justify-center"><Monitor className="w-6 h-6 text-[#8baef5]"/></div><h2 className="text-base font-semibold text-[#f5f5f5]">Your preview will appear here</h2><p className="text-sm leading-relaxed text-[#9ca3af]">Ask the assistant to build an HTML page or app. When its reply includes an HTML code block, it will render here. Switch to Code to inspect generated source.</p>{generatedCodeBlocks.length > 0 && <button type="button" onClick={() => setWorkspaceTab('code')} className="px-3 py-2 rounded-lg bg-[#222630] text-xs text-white border border-[#303642]">View generated code</button>}</div></div>) : <div className="p-4 space-y-3">{generatedCodeBlocks.length ? generatedCodeBlocks.map((block) => <div key={block.index} className="rounded-xl overflow-hidden border border-[#292e38] bg-[#151920]"><div className="px-3 py-2 flex items-center justify-between border-b border-[#292e38] text-[11px] text-[#9ca3af]"><span>{block.language.toUpperCase()} · Block {block.index + 1}</span><button type="button" onClick={() => handleCopyText('workspace-code-' + block.index, block.code)} className="inline-flex items-center gap-1 hover:text-white"><Copy className="w-3 h-3"/>{copiedId === 'workspace-code-' + block.index ? 'Copied' : 'Copy'}</button></div><pre className="m-0 p-4 overflow-x-auto text-xs leading-relaxed text-[#d5deeb] whitespace-pre"><code>{block.code}</code></pre></div>) : <div className="p-8 text-center text-sm text-[#9ca3af]">No code blocks found yet. Ask the assistant to generate code and it will appear here.</div>}</div>}
        </div>
      </section>

            {/* RIGHT INSPECTOR: Run Settings & Live Capability Mounts */}
      <aside className="atelier-run-inspector hidden xl:flex w-80 shrink-0 border-l border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Run Settings
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSession({ messages: [] })}
              title="Clear conversation messages"
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5 text-xs">
          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700 dark:text-slate-300">
              Model
            </label>
            <select
              value={activeSession.model}
              onChange={(e) => handleModelChange(e.target.value as GeminiModelId)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <optgroup label="Cloud Gemini (Best Reasoning &amp; Coding)">
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
              </optgroup>
              <optgroup label="In-Browser iPad 10 Safe (Zero Limits)">
                <option value="local-smollm2-360m">SmolLM2 360M (~230 MB · Safest)</option>
                <option value="local-qwen25-500m">Qwen 2.5 0.5B (~380 MB · Balanced)</option>
              </optgroup>
            </select>

            {activeLocalSpec && (
              <div className="mt-2 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300">
                  <span>{activeLocalSpec.shortLabel}</span>
                  <span className="font-mono">{activeLocalSpec.ramEstimateLabel}</span>
                </div>
                <div className="text-slate-600 dark:text-slate-300 leading-snug">
                  Download: <strong>{activeLocalSpec.downloadLabel}</strong> · {activeLocalSpec.ipad10Note}. {activeLocalSpec.summary}
                </div>
                {localLoadedKey && (
                  <button
                    type="button"
                    onClick={handleUnloadLocalModel}
                    className="w-full py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Unload from RAM ({localBackend === 'webgpu' ? 'WebGPU' : 'WASM'})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Thinking Level */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Thinking Level
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {activeSession.thinkingLevel}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              {(['LOW', 'MEDIUM', 'HIGH', 'XHIGH'] as ThinkingLevelOption[]).map((lvl) => {
                const disabled =
                  lvl === 'XHIGH' && activeSession.model === 'gemini-3.1-flash-lite';
                const active = activeSession.thinkingLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    disabled={disabled}
                    onClick={() => onUpdateSession({ thinkingLevel: lvl })}
                    className={`py-1 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              MEDIUM keeps long chats fast &amp; quota-safe; HIGH/XHIGH unlocks maximum deep reasoning on gemini-4-hydrogen.
            </p>
          </div>

          {/* Structured Output Format */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Output Format
              </span>
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80">
                {(['text', 'json'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => onUpdateSession({ responseFormat: fmt })}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase cursor-pointer ${
                      activeSession.responseFormat === fmt
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {activeSession.responseFormat === 'json' && (
              <div className="space-y-1.5">
                {hasBuiltInSearchOrUrl && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Note: JSON response mode is skipped while Search or URL Context is active.
                  </p>
                )}
                <textarea
                  rows={5}
                  value={activeSession.responseSchemaJson}
                  onChange={(e) =>
                    onUpdateSession({ responseSchemaJson: e.target.value })
                  }
                  spellCheck={false}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                />
              </div>
            )}
          </div>

          {/* Voice & Speech Persona */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Human Voice
              </span>
              <select
                value={activeSession.voiceName || 'Zephyr'}
                onChange={(e) =>
                  onUpdateSession({ voiceName: e.target.value as StudioVoiceName })
                }
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                {(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as StudioVoiceName[]).map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  )
                )}
              </select>
            </div>
            <label className="flex items-center justify-between gap-2 py-0.5 cursor-pointer text-slate-600 dark:text-slate-400">
              <span>Auto-speak replies</span>
              <input
                type="checkbox"
                checked={Boolean(activeSession.autoSpeak)}
                onChange={(e) => onUpdateSession({ autoSpeak: e.target.checked })}
              />
            </label>
          </div>

          {/* Mounted Skills.md */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Skills.md ({activeSession.activeSkillIds.length}/{state.skills.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigateView('skills')}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {[...state.skills]
                .sort((a, b) => {
                  const aMounted = activeSession.activeSkillIds.includes(a.id) ? 0 : 1;
                  const bMounted = activeSession.activeSkillIds.includes(b.id) ? 0 : 1;
                  return aMounted - bMounted;
                })
                .slice(0, 40)
                .map((skill) => (
                  <label
                    key={skill.id}
                    className="flex items-center justify-between gap-2 py-1 cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <span className="truncate">{skill.name}</span>
                    <input
                      type="checkbox"
                      checked={activeSession.activeSkillIds.includes(skill.id)}
                      onChange={() => toggleIdInSession('activeSkillIds', skill.id)}
                    />
                  </label>
                ))}
              {state.skills.length > 40 && (
                <button
                  type="button"
                  onClick={() => onNavigateView('skills')}
                  className="w-full text-left py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Browse all {state.skills.length.toLocaleString()} skills →
                </button>
              )}
            </div>
          </div>

          {/* Mounted Custom Tools */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Custom Tools
              </span>
              <button
                type="button"
                onClick={() => onNavigateView('tools')}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            <div className="space-y-1.5">
              {state.tools.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center justify-between gap-2 py-1 cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <span className="font-mono truncate">{tool.name}</span>
                  <input
                    type="checkbox"
                    checked={activeSession.activeToolIds.includes(tool.id)}
                    onChange={() => toggleIdInSession('activeToolIds', tool.id)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Mounted Plugins */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Plugins
              </span>
              <button
                type="button"
                onClick={() => onNavigateView('tools')}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            <div className="space-y-1.5">
              {state.plugins.map((plugin) => (
                <label
                  key={plugin.id}
                  className="flex items-center justify-between gap-2 py-1 cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <span className="truncate">{plugin.name}</span>
                  <input
                    type="checkbox"
                    checked={activeSession.activePluginIds.includes(plugin.id)}
                    onChange={() => toggleIdInSession('activePluginIds', plugin.id)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Mounted Connectors */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Connectors
              </span>
              <button
                type="button"
                onClick={() => onNavigateView('connectors')}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            <div className="space-y-1.5">
              {state.connectors.map((conn) => (
                <label
                  key={conn.id}
                  className="flex items-center justify-between gap-2 py-1 cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <span className="truncate">{conn.name}</span>
                  <input
                    type="checkbox"
                    checked={activeSession.activeConnectorIds.includes(conn.id)}
                    onChange={() => toggleIdInSession('activeConnectorIds', conn.id)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Last Run Token Summary */}
          {lastUsage && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 tabular-nums">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Last Run Usage
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Prompt tokens</span>
                <span className="font-mono">{lastUsage.promptTokens}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Output tokens</span>
                <span className="font-mono">{lastUsage.candidatesTokens}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Total latency</span>
                <span className="font-mono">{lastUsage.latencyMs} ms</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Tablet / iPad 10 Run Settings Drawer (< xl screens) */}
      {mobileSettingsOpen && (
        <div className="fixed inset-0 z-50 xl:hidden flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="w-80 max-w-[88vw] h-full bg-white dark:bg-[#11151E] border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Run Settings
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSession({ messages: [] })}
                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSettingsOpen(false)}
                  aria-label="Close Run Settings"
                  className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-5 text-xs">
              <div className="space-y-2">
                <span className="block font-medium text-slate-700 dark:text-slate-300">
                  In-Browser iPad 10 Models (Free · Zero Limits)
                </span>
                {Object.values(LOCAL_MODEL_SPECS).map((spec) => {
                  const selected = activeSession.model === spec.id;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => handleModelChange(spec.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                        <span>{spec.shortLabel}</span>
                        <span className="font-mono text-[11px]">{spec.downloadLabel}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {spec.ramEstimateLabel} · {spec.ipad10Note}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Thinking Level (Cloud Gemini)
                </span>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                  {(['LOW', 'MEDIUM', 'HIGH', 'XHIGH'] as ThinkingLevelOption[]).map((lvl) => {
                    const disabled =
                      lvl === 'XHIGH' && activeSession.model === 'gemini-3.1-flash-lite';
                    const active = activeSession.thinkingLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={disabled}
                        onClick={() => onUpdateSession({ thinkingLevel: lvl })}
                        className={`py-1 rounded text-[11px] font-mono font-medium cursor-pointer disabled:opacity-35 ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Quick Navigation
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSettingsOpen(false);
                      onNavigateView('skills');
                    }}
                    className="py-1.5 px-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Skills.md
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSettingsOpen(false);
                      onNavigateView('tools');
                    }}
                    className="py-1.5 px-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Tools
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSettingsOpen(false);
                      onNavigateView('connectors');
                    }}
                    className="py-1.5 px-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Connectors
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <LiveVoiceModal
        isOpen={liveVoiceOpen}
        sessionId={activeSession.id}
        voiceName={activeSession.voiceName || 'Zephyr'}
        onClose={() => setLiveVoiceOpen(false)}
      />

      <VisionaryModal
        isOpen={visionaryOpen}
        onClose={() => setVisionaryOpen(false)}
        currentModel={activeSession.model}
        onSwitchToVisionModel={() => handleModelChange('gemini-4-hydrogen')}
        onSendToStudio={(visionPrompt, frameAttachments) => {
          const targetModel: GeminiModelId = isLocalModel(activeSession.model)
            ? 'gemini-4-hydrogen'
            : activeSession.model;
          if (isLocalModel(activeSession.model)) {
            handleModelChange('gemini-4-hydrogen');
          }
          runPrompt(visionPrompt, undefined, frameAttachments, targetModel);
        }}
      />
    </div>
  );
};
