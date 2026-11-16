import React, { useMemo, useState } from 'react';
import {
  Check,
  Globe,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { Connector, ParamType, PromptSession, ToolParam } from '../types';

interface ConnectorsViewProps {
  connectors: Connector[];
  activeSession: PromptSession;
  onSaveConnectors: (connectors: Connector[]) => void;
  onToggleMountConnector: (connectorId: string) => void;
}

const PARAM_TYPES: ParamType[] = [
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
];

export const ConnectorsView: React.FC<ConnectorsViewProps> = ({
  connectors,
  activeSession,
  onSaveConnectors,
  onToggleMountConnector,
}) => {
  const [selectedId, setSelectedId] = useState<string>(connectors[0]?.id || '');
  const [query, setQuery] = useState('');
  const [testArgsJson, setTestArgsJson] = useState('{}');
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<{
    ok: boolean;
    status: number;
    durationMs: number;
    data?: unknown;
    error?: string;
  } | null>(null);

  const filteredConnectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.toolName.toLowerCase().includes(q) ||
        c.url.toLowerCase().includes(q)
    );
  }, [connectors, query]);

  const activeConnector =
    connectors.find((c) => c.id === selectedId) ||
    filteredConnectors[0] ||
    connectors[0] ||
    null;

  const isMounted = activeConnector
    ? activeSession.activeConnectorIds.includes(activeConnector.id)
    : false;

  const selectConnector = (c: Connector) => {
    setSelectedId(c.id);
    setTestOutput(null);
    const sample: Record<string, unknown> = {};
    for (const p of c.parameters) {
      if (p.name === 'latitude') sample[p.name] = 51.5072;
      else if (p.name === 'longitude') sample[p.name] = -0.1276;
      else if (p.name === 'owner') sample[p.name] = 'googleapis';
      else if (p.name === 'repo') sample[p.name] = 'js-genai';
      else if (p.type === 'NUMBER' || p.type === 'INTEGER') sample[p.name] = 1;
      else if (p.type === 'BOOLEAN') sample[p.name] = true;
      else sample[p.name] = 'sample';
    }
    setTestArgsJson(JSON.stringify(sample, null, 2));
  };

  const updateConnector = (patch: Partial<Connector>) => {
    if (!activeConnector) return;
    const updated = connectors.map((c) =>
      c.id === activeConnector.id
        ? { ...c, ...patch, updatedAt: new Date().toISOString() }
        : c
    );
    onSaveConnectors(updated);
  };

  const handleCreateConnector = () => {
    const id = `conn-${Date.now()}`;
    const newConn: Connector = {
      id,
      name: 'Custom REST Connector',
      toolName: `call_api_${connectors.length + 1}`,
      description: 'Calls an external REST endpoint and returns JSON data.',
      url: 'https://jsonplaceholder.typicode.com/todos/{{todoId}}',
      method: 'GET',
      authType: 'none',
      headers: [{ key: 'Accept', value: 'application/json' }],
      parameters: [
        {
          name: 'todoId',
          type: 'INTEGER',
          description: 'Numeric ID of the resource to fetch',
          required: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    onSaveConnectors([newConn, ...connectors]);
    selectConnector(newConn);
  };

  const handleDeleteConnector = () => {
    if (!activeConnector) return;
    const remaining = connectors.filter((c) => c.id !== activeConnector.id);
    onSaveConnectors(remaining);
    if (remaining[0]) selectConnector(remaining[0]);
    else setSelectedId('');
  };

  const handleAddParam = () => {
    if (!activeConnector) return;
    updateConnector({
      parameters: [
        ...activeConnector.parameters,
        { name: '', type: 'STRING', description: '', required: true },
      ],
    });
  };

  const handleUpdateParam = (index: number, patch: Partial<ToolParam>) => {
    if (!activeConnector) return;
    const next = activeConnector.parameters.map((p, idx) =>
      idx === index ? { ...p, ...patch } : p
    );
    updateConnector({ parameters: next });
  };

  const handleRemoveParam = (index: number) => {
    if (!activeConnector) return;
    updateConnector({
      parameters: activeConnector.parameters.filter((_, idx) => idx !== index),
    });
  };

  const handleAddHeader = () => {
    if (!activeConnector) return;
    updateConnector({
      headers: [...activeConnector.headers, { key: '', value: '' }],
    });
  };

  const handleTestConnector = async () => {
    if (!activeConnector) return;
    setTesting(true);
    setTestOutput(null);
    try {
      const parsedArgs = testArgsJson.trim() ? JSON.parse(testArgsJson) : {};
      const resp = await fetch('/api/studio/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector: activeConnector, args: parsedArgs }),
      });
      const result = await resp.json();
      setTestOutput(result);
    } catch (err) {
      setTestOutput({
        ok: false,
        status: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="atelier-view-shell atelier-connectors-view flex-1 min-h-0 flex bg-slate-50 dark:bg-[#0D1017]">
      {/* Left Rail */}
      <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              API Connectors
            </h1>
            <button
              type="button"
              onClick={handleCreateConnector}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Connector</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter connectors..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConnectors.map((conn) => {
            const selected = activeConnector?.id === conn.id;
            const mounted = activeSession.activeConnectorIds.includes(conn.id);
            return (
              <button
                key={conn.id}
                type="button"
                onClick={() => selectConnector(conn)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30'
                    : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {conn.name}
                  </span>
                  {mounted && (
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                      Mounted
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {conn.method}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{conn.toolName}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Connector Inspector */}
      {activeConnector ? (
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {activeConnector.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Exposed to Gemini as function <code className="font-mono text-slate-700 dark:text-slate-300">{activeConnector.toolName}</code>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleMountConnector(activeConnector.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isMounted
                      ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {isMounted && <Check className="w-3.5 h-3.5" />}
                  <span>{isMounted ? 'Mounted in Lab' : 'Mount in Lab'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConnector}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            {/* Identity & Endpoint */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Endpoint &amp; Tool Definition
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Connector Display Name
                  </label>
                  <input
                    type="text"
                    value={activeConnector.name}
                    onChange={(e) => updateConnector({ name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Gemini Function Name (snake_case)
                  </label>
                  <input
                    type="text"
                    value={activeConnector.toolName}
                    onChange={(e) =>
                      updateConnector({
                        toolName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Description (tells Gemini when to invoke this connector)
                </label>
                <input
                  type="text"
                  value={activeConnector.description}
                  onChange={(e) => updateConnector({ description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="w-full sm:w-32 shrink-0">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Method
                  </label>
                  <select
                    value={activeConnector.method}
                    onChange={(e) =>
                      updateConnector({
                        method: e.target.value as Connector['method'],
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Endpoint URL (use {'{{param}}'} placeholders for parameters)
                  </label>
                  <input
                    type="text"
                    value={activeConnector.url}
                    onChange={(e) => updateConnector({ url: e.target.value })}
                    placeholder="https://api.example.com/v1/items/{{id}}"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            {/* Authentication & Headers */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Authentication &amp; Headers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Auth Mode
                  </label>
                  <select
                    value={activeConnector.authType}
                    onChange={(e) =>
                      updateConnector({
                        authType: e.target.value as Connector['authType'],
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">None (Public API)</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="header">Custom Header Key</option>
                  </select>
                </div>
                {activeConnector.authType === 'header' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Header Name
                    </label>
                    <input
                      type="text"
                      value={activeConnector.authHeaderName || ''}
                      onChange={(e) => updateConnector({ authHeaderName: e.target.value })}
                      placeholder="X-API-Key"
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {activeConnector.authType !== 'none' && (
                  <div className={activeConnector.authType === 'bearer' ? 'md:col-span-2' : ''}>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Token / Secret (stored server-side)
                    </label>
                    <input
                      type="password"
                      value={activeConnector.authToken || ''}
                      onChange={(e) => updateConnector({ authToken: e.target.value })}
                      placeholder="Enter token..."
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Custom HTTP Headers
                  </span>
                  <button
                    type="button"
                    onClick={handleAddHeader}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Header</span>
                  </button>
                </div>
                {activeConnector.headers.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={h.key}
                      onChange={(e) => {
                        const next = [...activeConnector.headers];
                        next[idx] = { ...h, key: e.target.value };
                        updateConnector({ headers: next });
                      }}
                      placeholder="Header name"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      value={h.value}
                      onChange={(e) => {
                        const next = [...activeConnector.headers];
                        next[idx] = { ...h, value: e.target.value };
                        updateConnector({ headers: next });
                      }}
                      placeholder="Header value"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateConnector({
                          headers: activeConnector.headers.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Parameters & Body Template */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Input Parameters Schema
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

              {activeConnector.parameters.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No parameters defined. Gemini will invoke this endpoint with zero arguments.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {activeConnector.parameters.map((param, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017]"
                    >
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) => handleUpdateParam(idx, { name: e.target.value })}
                        placeholder="paramName"
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
                        onChange={(e) => handleUpdateParam(idx, { description: e.target.value })}
                        placeholder="Parameter description for Gemini..."
                        className="col-span-5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-slate-900 dark:text-slate-100"
                      />
                      <label className="col-span-1 flex items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => handleUpdateParam(idx, { required: e.target.checked })}
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
              )}

              {activeConnector.method !== 'GET' && activeConnector.method !== 'DELETE' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    JSON Body Template (optional, defaults to tool arguments JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={activeConnector.bodyTemplate || ''}
                    onChange={(e) => updateConnector({ bodyTemplate: e.target.value })}
                    placeholder='{"query": "{{query}}"}'
                    className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </section>

            {/* Live Connection Tester */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Endpoint Test
                </h3>
                <button
                  type="button"
                  onClick={handleTestConnector}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{testing ? 'Testing...' : 'Test Request'}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Sample Arguments (JSON)
                </label>
                <textarea
                  rows={3}
                  value={testArgsJson}
                  onChange={(e) => setTestArgsJson(e.target.value)}
                  className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {testOutput && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span
                      className={
                        testOutput.ok ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {testOutput.ok ? 'Success' : 'Failed'} · HTTP {testOutput.status}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {testOutput.durationMs} ms
                    </span>
                  </div>
                  <pre className="p-3.5 text-xs font-mono overflow-x-auto max-h-64">
                    {testOutput.error
                      ? testOutput.error
                      : JSON.stringify(testOutput.data, null, 2)}
                  </pre>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Globe className="w-10 h-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Connectors Configured
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Connect any REST API or webhook and expose it directly to Gemini as an executable function tool.
          </p>
          <button
            type="button"
            onClick={handleCreateConnector}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Connector</span>
          </button>
        </div>
      )}
    </div>
  );
};
