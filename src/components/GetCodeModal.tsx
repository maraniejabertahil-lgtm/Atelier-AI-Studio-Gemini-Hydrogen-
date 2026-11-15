import React, { useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { PromptSession, StudioState } from '../types';
import { getLocalModelSpec } from '../lib/localModels';

interface GetCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: PromptSession;
  state: StudioState;
}

export const GetCodeModal: React.FC<GetCodeModalProps> = ({
  isOpen,
  onClose,
  session,
  state,
}) => {
  const [tab, setTab] = useState<'typescript' | 'curl'>('typescript');
  const [copied, setCopied] = useState(false);

  const codeSnippet = useMemo(() => {
    const activePlugins = state.plugins.filter((p) => session.activePluginIds.includes(p.id));
    const skillIds = new Set(session.activeSkillIds);
    const toolIds = new Set(session.activeToolIds);
    const connectorIds = new Set(session.activeConnectorIds);

    for (const p of activePlugins) {
      if (p.kind === 'custom_bundle') {
        p.bundledSkillIds?.forEach((id) => skillIds.add(id));
        p.bundledToolIds?.forEach((id) => toolIds.add(id));
        p.bundledConnectorIds?.forEach((id) => connectorIds.add(id));
      }
    }

    const activeSkills = state.skills.filter((s) => skillIds.has(s.id));
    const activeTools = state.tools.filter((t) => toolIds.has(t.id));
    const activeConnectors = state.connectors.filter((c) => connectorIds.has(c.id));
    const hasSearch = activePlugins.some((p) => p.kind === 'google_search');
    const hasUrl = activePlugins.some((p) => p.kind === 'url_context');

    const systemParts: string[] = [];
    if (session.systemInstruction.trim()) systemParts.push(session.systemInstruction.trim());
    for (const sk of activeSkills) {
      systemParts.push(`<!-- Skill: ${sk.filename} -->\n${sk.content.trim()}`);
    }
    const combinedSystem = systemParts.join('\n\n---\n\n');

    const lastUserPrompt =
      [...session.messages].reverse().find((m) => m.role === 'user')?.text ||
      'Hello! How can you help with my mounted skills and tools today?';

    const localSpec = getLocalModelSpec(session.model);
    if (localSpec && tab === 'typescript') {
      return `import { pipeline, TextStreamer } from "@huggingface/transformers";

// Runs 100% inside your browser (${localSpec.downloadLabel}, ${localSpec.ramEstimateLabel})
const generator = await pipeline("text-generation", "${localSpec.hfModelId}", {
  device: "webgpu", // falls back cleanly to "wasm" on Safari/iPadOS if needed
  dtype: "q4",
});

const messages = [
  ${combinedSystem ? `{ role: "system", content: ${JSON.stringify(combinedSystem.slice(0, 600))} },\n  ` : ''}{ role: "user", content: ${JSON.stringify(lastUserPrompt)} },
];

const streamer = new TextStreamer(generator.tokenizer, {
  skip_prompt: true,
  skip_special_tokens: true,
  callback_function: (chunk) => process.stdout.write(chunk),
});

await generator(messages, {
  max_new_tokens: 512,
  do_sample: true,
  temperature: 0.6,
  streamer,
});`;
    }

    if (tab === 'curl') {
      const payload = {
        sessionId: session.id,
        prompt: lastUserPrompt,
      };
      return `curl -N -X POST http://localhost:3000/api/studio/run \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
    }

    const fnDecls = [
      ...activeTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters.length
          ? {
              type: 'Type.OBJECT',
              properties: Object.fromEntries(
                t.parameters.map((p) => [
                  p.name,
                  { type: `Type.${p.type}`, description: p.description },
                ])
              ),
              required: t.parameters.filter((p) => p.required).map((p) => p.name),
            }
          : undefined,
      })),
      ...activeConnectors.map((c) => ({
        name: c.toolName,
        description: `${c.description} (Connector: ${c.method} ${c.url})`,
        parameters: c.parameters.length
          ? {
              type: 'Type.OBJECT',
              properties: Object.fromEntries(
                c.parameters.map((p) => [
                  p.name,
                  { type: `Type.${p.type}`, description: p.description },
                ])
              ),
              required: c.parameters.filter((p) => p.required).map((p) => p.name),
            }
          : undefined,
      })),
    ];

    const toolsLines: string[] = [];
    if (hasSearch) toolsLines.push('      { googleSearch: {} },');
    if (hasUrl) toolsLines.push('      { urlContext: {} },');
    if (fnDecls.length > 0) {
      toolsLines.push(
        `      { functionDeclarations: ${JSON.stringify(fnDecls, null, 2)
          .replace(/"Type\.([A-Z]+)"/g, 'Type.$1')
          .split('\n')
          .map((l, idx) => (idx === 0 ? l : '      ' + l))
          .join('\n')} },`
      );
    }

    const thinkingEnum =
      session.model === 'gemini-3.1-flash-lite' && session.thinkingLevel === 'XHIGH'
        ? 'HIGH'
        : session.thinkingLevel;

    const needsHybridConfig = (hasSearch || hasUrl) && fnDecls.length > 0;

    return `import { GoogleGenAI, ThinkingLevel${fnDecls.length > 0 ? ', Type' : ''} } from "@google/genai";

// Server-side @google/genai usage
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { "User-Agent": "aistudio-build" },
  },
});

const response = await ai.models.generateContent({
  model: "${session.model}",
  contents: ${JSON.stringify(lastUserPrompt)},
  config: {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.${thinkingEnum},
    },${
      combinedSystem
        ? `\n    systemInstruction: ${JSON.stringify(combinedSystem)},`
        : ''
    }${
      toolsLines.length > 0
        ? `\n    tools: [\n${toolsLines.join('\n')}\n    ],`
        : ''
    }${
      needsHybridConfig
        ? `\n    toolConfig: { includeServerSideToolInvocations: true },`
        : ''
    }${
      session.responseFormat === 'json' && !hasSearch && !hasUrl
        ? `\n    responseMimeType: "application/json",`
        : ''
    }
  },
});

console.log(response.text);`;
  }, [session, state, tab]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="get-code-title"
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 id="get-code-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Export Studio Configuration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Includes your active model, Skills.md instructions, Tools, Plugins, and Connectors.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-[#0F131C]">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setTab('typescript')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                tab === 'typescript'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              TypeScript (@google/genai)
            </button>
            <button
              type="button"
              onClick={() => setTab('curl')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                tab === 'curl'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Studio API (cURL)
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-950 p-5">
          <pre className="text-[13px] leading-relaxed font-mono text-slate-200 whitespace-pre">
            <code>{codeSnippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
