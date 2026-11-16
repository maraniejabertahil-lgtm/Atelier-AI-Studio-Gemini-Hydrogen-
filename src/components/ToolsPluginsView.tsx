import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Database,
  Download,
  Package,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import type {
  Connector,
  CustomTool,
  ParamType,
  PluginConfig,
  PromptSession,
  SkillDoc,
  StudioMemoryNote,
  ToolParam,
} from '../types';

interface ToolsPluginsViewProps {
  tools: CustomTool[];
  plugins: PluginConfig[];
  skills: SkillDoc[];
  connectors: Connector[];
  memories: StudioMemoryNote[];
  activeSession: PromptSession;
  onSaveTools: (tools: CustomTool[]) => void;
  onSavePlugins: (plugins: PluginConfig[]) => void;
  onSaveMemories: (memories: StudioMemoryNote[]) => void;
  onToggleMountTool: (toolId: string) => void;
  onToggleMountPlugin: (pluginId: string) => void;
  onImportBundle: (payload: {
    skills?: SkillDoc[];
    tools?: CustomTool[];
    plugins?: PluginConfig[];
    connectors?: Connector[];
  }) => void;
}

const PARAM_TYPES: ParamType[] = [
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
];

export const ToolsPluginsView: React.FC<ToolsPluginsViewProps> = ({
  tools,
  plugins,
  skills,
  connectors,
  memories,
  activeSession,
  onSaveTools,
  onSavePlugins,
  onSaveMemories,
  onToggleMountTool,
  onToggleMountPlugin,
  onImportBundle,
}) => {
  const [subTab, setSubTab] = useState<'tools' | 'plugins' | 'memory'>('tools');
  const [selectedToolId, setSelectedToolId] = useState<string>(tools[0]?.id || '');
  const [query, setQuery] = useState('');
  const [testArgsJson, setTestArgsJson] = useState('{\n  "expression": "(1250 * 0.08) + 45"\n}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    result?: unknown;
    error?: string;
    durationMs: number;
  } | null>(null);

  // Memory add state
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemContent, setNewMemContent] = useState('');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tools, query]);

  const activeTool =
    tools.find((t) => t.id === selectedToolId) || filteredTools[0] || tools[0] || null;

  const isToolMounted = activeTool
    ? activeSession.activeToolIds.includes(activeTool.id)
    : false;

  const selectTool = (tool: CustomTool) => {
    setSelectedToolId(tool.id);
    setTestResult(null);
    const sample: Record<string, unknown> = {};
    for (const p of tool.parameters) {
      if (p.name === 'expression') sample[p.name] = '(1250 * 0.08) + 45';
      else if (p.name === 'itemsJson')
        sample[p.name] = JSON.stringify([{ name: 'Alpha', score: 9 }]);
      else if (p.type === 'NUMBER' || p.type === 'INTEGER') sample[p.name] = 10;
      else if (p.type === 'BOOLEAN') sample[p.name] = true;
      else sample[p.name] = 'sample';
    }
    setTestArgsJson(JSON.stringify(sample, null, 2));
  };

  const updateTool = (patch: Partial<CustomTool>) => {
    if (!activeTool) return;
    onSaveTools(
      tools.map((t) =>
        t.id === activeTool.id
          ? { ...t, ...patch, updatedAt: new Date().toISOString() }
          : t
      )
    );
  };

  const handleCreateTool = () => {
    const id = `tool-${Date.now()}`;
    const newTool: CustomTool = {
      id,
      name: `custom_tool_${tools.length + 1}`,
      description: 'Describe what this function computes or returns for Gemini.',
      handlerType: 'javascript',
      parameters: [
        {
          name: 'input',
          type: 'STRING',
          description: 'Input value passed by the model',
          required: true,
        },
      ],
      jsCode: `// Available: args\nreturn {\n  received: args.input,\n  length: String(args.input || '').length,\n  timestamp: new Date().toISOString()\n};`,
      updatedAt: new Date().toISOString(),
    };
    onSaveTools([newTool, ...tools]);
    selectTool(newTool);
  };

  const handleDeleteTool = () => {
    if (!activeTool) return;
    const remaining = tools.filter((t) => t.id !== activeTool.id);
    onSaveTools(remaining);
    if (remaining[0]) selectTool(remaining[0]);
    else setSelectedToolId('');
  };

  const handleAddParam = () => {
    if (!activeTool) return;
    updateTool({
      parameters: [
        ...activeTool.parameters,
        { name: '', type: 'STRING', description: '', required: true },
      ],
    });
  };

  const handleUpdateParam = (idx: number, patch: Partial<ToolParam>) => {
    if (!activeTool) return;
    updateTool({
      parameters: activeTool.parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  };

  const handleRemoveParam = (idx: number) => {
    if (!activeTool) return;
    updateTool({
      parameters: activeTool.parameters.filter((_, i) => i !== idx),
    });
  };

  const handleTestTool = async () => {
    if (!activeTool) return;
    setTesting(true);
    setTestResult(null);
    try {
      const parsedArgs = testArgsJson.trim() ? JSON.parse(testArgsJson) : {};
      const resp = await fetch('/api/studio/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: activeTool, args: parsedArgs }),
      });
      const data = await resp.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  // Custom Plugin Bundle helpers
  const handleCreateBundlePlugin = () => {
    const id = `plugin-bundle-${Date.now()}`;
    const newPlugin: PluginConfig = {
      id,
      name: `Custom Bundle ${plugins.filter((p) => p.kind === 'custom_bundle').length + 1}`,
      kind: 'custom_bundle',
      description: 'Packages Skills.md, Tools, and Connectors into a single toggleable plugin.',
      bundledSkillIds: [],
      bundledToolIds: [],
      bundledConnectorIds: [],
      updatedAt: new Date().toISOString(),
    };
    onSavePlugins([...plugins, newPlugin]);
  };

  const updatePlugin = (pluginId: string, patch: Partial<PluginConfig>) => {
    onSavePlugins(
      plugins.map((p) =>
        p.id === pluginId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      )
    );
  };

  const toggleBundleRef = (
    plugin: PluginConfig,
    field: 'bundledSkillIds' | 'bundledToolIds' | 'bundledConnectorIds',
    refId: string
  ) => {
    const current = plugin[field] || [];
    const next = current.includes(refId)
      ? current.filter((x) => x !== refId)
      : [...current, refId];
    updatePlugin(plugin.id, { [field]: next });
  };

  const handleExportStudioPack = () => {
    const pack = {
      exportedAt: new Date().toISOString(),
      skills,
      tools,
      plugins,
      connectors: connectors.map((c) => ({ ...c, authToken: '' })),
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atelier-studio-pack.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportStudioPack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      onImportBundle(parsed);
    } catch {
      // Ignore malformed JSON
    }
    e.target.value = '';
  };

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemKey.trim() || !newMemContent.trim()) return;
    const note: StudioMemoryNote = {
      id: `mem-${Date.now()}`,
      key: newMemKey.trim(),
      content: newMemContent.trim(),
      updatedAt: new Date().toISOString(),
    };
    onSaveMemories([note, ...memories]);
    setNewMemKey('');
    setNewMemContent('');
  };

  return (
    <div className="atelier-view-shell atelier-tools-view flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-[#0D1017]">
      {/* Sub-navigation strip */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setSubTab('tools')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'tools'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Custom Tools ({tools.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('plugins')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'plugins'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Plugins &amp; Bundles ({plugins.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('memory')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'memory'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Studio Memory ({memories.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Pack</span>
          </button>
          <button
            type="button"
            onClick={handleExportStudioPack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Pack</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImportStudioPack}
            className="hidden"
          />
        </div>
      </div>

      {/* TAB 1: CUSTOM TOOLS */}
      {subTab === 'tools' && (
        <div className="flex-1 min-h-0 flex">
          <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Function Tools
                </h2>
                <button
                  type="button"
                  onClick={handleCreateTool}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Tool</span>
                </button>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter tools..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredTools.map((tool) => {
                const selected = activeTool?.id === tool.id;
                const mounted = activeSession.activeToolIds.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => selectTool(tool)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30'
                        : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                        {tool.name}
                      </span>
                      {mounted && (
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                          Mounted
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {tool.handlerType === 'javascript'
                        ? 'JavaScript Sandbox'
                        : tool.handlerType === 'connector'
                          ? 'Linked Connector'
                          : 'JSON Template'}{' '}
                      · {tool.parameters.length} params
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          {activeTool ? (
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {activeTool.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Registered as a Gemini FunctionDeclaration and executed server-side.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleMountTool(activeTool.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isToolMounted
                          ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isToolMounted && <Check className="w-3.5 h-3.5" />}
                      <span>{isToolMounted ? 'Mounted in Lab' : 'Mount in Lab'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteTool}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Declaration fields */}
                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Function Name
                      </label>
                      <input
                        type="text"
                        value={activeTool.name}
                        onChange={(e) =>
                          updateTool({
                            name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
                          })
                        }
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Execution Handler
                      </label>
                      <select
                        value={activeTool.handlerType}
                        onChange={(e) =>
                          updateTool({
                            handlerType: e.target.value as CustomTool['handlerType'],
                          })
                        }
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="javascript">JavaScript Sandbox (Node VM)</option>
                        <option value="json_template">Static / Interpolated JSON</option>
                        <option value="connector">Delegate to API Connector</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={activeTool.description}
                      onChange={(e) => updateTool({ description: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </section>

                {/* Parameters */}
                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Parameters Schema
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddParam}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Parameter</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {activeTool.parameters.map((param, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017]"
                      >
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => handleUpdateParam(idx, { name: e.target.value })}
                          placeholder="name"
                          className="col-span-3 px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-slate-900 dark:text-slate-100"
                        />
                        <select
                          value={param.type}
                          onChange={(e) =>
                            handleUpdateParam(idx, { type: e.target.value as ParamType })
                          }
                          className="col-span-2 px-2 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-slate-900 dark:text-slate-100"
                        >
                          {PARAM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={param.description}
                          onChange={(e) =>
                            handleUpdateParam(idx, { description: e.target.value })
                          }
                          placeholder="Description..."
                          className="col-span-5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-slate-900 dark:text-slate-100"
                        />
                        <label className="col-span-1 flex items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(e) =>
                              handleUpdateParam(idx, { required: e.target.checked })
                            }
                          />
                          <span>Req</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveParam(idx)}
                          className="col-span-1 flex justify-end p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Implementation */}
                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Handler Implementation
                  </h3>
                  {activeTool.handlerType === 'javascript' && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Write a JavaScript function body receiving <code className="font-mono">args</code> and returning a JSON-serializable value.
                      </p>
                      <textarea
                        rows={8}
                        value={activeTool.jsCode || ''}
                        onChange={(e) => updateTool({ jsCode: e.target.value })}
                        spellCheck={false}
                        className="w-full p-3.5 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  {activeTool.handlerType === 'json_template' && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Return JSON with <code className="font-mono">{'{{param}}'}</code> template substitution.
                      </p>
                      <textarea
                        rows={6}
                        value={activeTool.jsonTemplate || ''}
                        onChange={(e) => updateTool({ jsonTemplate: e.target.value })}
                        spellCheck={false}
                        placeholder='{"status": "ok", "query": "{{input}}"}'
                        className="w-full p-3.5 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  {activeTool.handlerType === 'connector' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Select Connector Target
                      </label>
                      <select
                        value={activeTool.connectorId || ''}
                        onChange={(e) => updateTool({ connectorId: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
                      >
                        <option value="">Choose a connector...</option>
                        {connectors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.method} {c.url})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </section>

                {/* Live Tool Runner */}
                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Test Tool Execution
                    </h3>
                    <button
                      type="button"
                      onClick={handleTestTool}
                      disabled={testing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{testing ? 'Running...' : 'Run Test'}</span>
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={testArgsJson}
                    onChange={(e) => setTestArgsJson(e.target.value)}
                    className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {testResult && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden">
                      <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                        <span className={testResult.ok ? 'text-emerald-400' : 'text-rose-400'}>
                          {testResult.ok ? 'Returned JSON' : 'Execution Error'}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {testResult.durationMs} ms
                        </span>
                      </div>
                      <pre className="p-3.5 text-xs font-mono overflow-x-auto max-h-60">
                        {testResult.error
                          ? testResult.error
                          : JSON.stringify(testResult.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Wrench className="w-10 h-10 text-slate-400 mb-3" />
              <p className="text-sm text-slate-500">Create your first custom Function Tool.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLUGINS & BUNDLES */}
      {subTab === 'plugins' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Studio Plugins &amp; Extension Bundles
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Toggle built-in Gemini capabilities or package Skills.md, Tools, and Connectors into custom plugin bundles.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateBundlePlugin}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Plugin Bundle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plugins.map((plugin) => {
                const mounted = activeSession.activePluginIds.includes(plugin.id);
                const isCustomBundle = plugin.kind === 'custom_bundle';

                return (
                  <div
                    key={plugin.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {isCustomBundle ? (
                            <input
                              type="text"
                              value={plugin.name}
                              onChange={(e) =>
                                updatePlugin(plugin.id, { name: e.target.value })
                              }
                              className="w-full text-sm font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none"
                            />
                          ) : (
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {plugin.name}
                            </h3>
                          )}
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {plugin.kind === 'google_search'
                              ? 'Native Gemini Tool · googleSearch'
                              : plugin.kind === 'url_context'
                                ? 'Native Gemini Tool · urlContext'
                                : plugin.kind === 'studio_memory'
                                  ? 'Studio Extension · save_studio_note / read_studio_notes'
                                  : plugin.kind === 'skill_router'
                                    ? 'Studio Extension · load_studio_skill'
                                    : 'Custom Bundle Plugin'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleMountPlugin(plugin.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              mounted
                                ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {mounted && <Check className="w-3.5 h-3.5" />}
                            <span>{mounted ? 'Enabled' : 'Enable'}</span>
                          </button>

                          {isCustomBundle && (
                            <button
                              type="button"
                              onClick={() =>
                                onSavePlugins(plugins.filter((p) => p.id !== plugin.id))
                              }
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isCustomBundle ? (
                        <input
                          type="text"
                          value={plugin.description}
                          onChange={(e) =>
                            updatePlugin(plugin.id, { description: e.target.value })
                          }
                          className="w-full text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0D1017] px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800"
                        />
                      ) : (
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {plugin.description}
                        </p>
                      )}

                      {isCustomBundle && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                              Bundled Skills.md
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                              {[...skills]
                                .sort((a, b) => {
                                  const aBundled = plugin.bundledSkillIds?.includes(a.id) ? 0 : 1;
                                  const bBundled = plugin.bundledSkillIds?.includes(b.id) ? 0 : 1;
                                  return aBundled - bBundled;
                                })
                                .slice(0, 40)
                                .map((s) => {
                                  const checked = plugin.bundledSkillIds?.includes(s.id) || false;
                                  return (
                                    <label
                                      key={s.id}
                                      className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleBundleRef(plugin, 'bundledSkillIds', s.id)
                                        }
                                      />
                                      <span>{s.name}</span>
                                    </label>
                                  );
                                })}
                              {skills.length > 40 && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Showing first 40 of {skills.length.toLocaleString()} skills
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                              Bundled Tools
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {tools.map((t) => {
                                const checked = plugin.bundledToolIds?.includes(t.id) || false;
                                return (
                                  <label
                                    key={t.id}
                                    className="inline-flex items-center gap-1.5 font-mono text-slate-600 dark:text-slate-400 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleBundleRef(plugin, 'bundledToolIds', t.id)
                                      }
                                    />
                                    <span>{t.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                              Bundled Connectors
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {connectors.map((c) => {
                                const checked =
                                  plugin.bundledConnectorIds?.includes(c.id) || false;
                                return (
                                  <label
                                    key={c.id}
                                    className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleBundleRef(plugin, 'bundledConnectorIds', c.id)
                                      }
                                    />
                                    <span>{c.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STUDIO MEMORY */}
      {subTab === 'memory' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Studio Scratchpad Memory
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Persistent notes accessible by Gemini whenever the Studio Scratchpad Memory plugin is enabled.
              </p>
            </div>

            <form
              onSubmit={handleAddMemory}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newMemKey}
                  onChange={(e) => setNewMemKey(e.target.value)}
                  placeholder="Key (e.g. coding_style)"
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={newMemContent}
                  onChange={(e) => setNewMemContent(e.target.value)}
                  placeholder="Note value..."
                  className="sm:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] divide-y divide-slate-200 dark:divide-slate-800">
              {memories.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No saved notes yet. Ask Gemini to save a note or add one above.
                </div>
              ) : (
                memories.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {note.key}
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                        {note.content}
                      </p>
                      <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                        Updated {new Date(note.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onSaveMemories(memories.filter((m) => m.id !== note.id))
                      }
                      className="p-1.5 rounded text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
