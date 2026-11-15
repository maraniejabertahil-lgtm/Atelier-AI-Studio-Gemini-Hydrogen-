import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Connector,
  CustomTool,
  PluginConfig,
  PromptSession,
  SkillDoc,
  StudioMemoryNote,
  StudioState,
  StudioView,
} from './types';
import { TopBar } from './components/TopBar';
import { PromptLabView } from './components/PromptLabView';
import { SkillsStudioView } from './components/SkillsStudioView';
import { ToolsPluginsView } from './components/ToolsPluginsView';
import { ConnectorsView } from './components/ConnectorsView';
import { GetCodeModal } from './components/GetCodeModal';

export const App: React.FC = () => {
  const [state, setState] = useState<StudioState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<StudioView>('lab');
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/studio/state')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load studio state (${res.status})`);
        return res.json() as Promise<StudioState>;
      })
      .then((data) => {
        if (active) setState(data);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const persistState = useCallback((next: StudioState) => {
    setState(next);
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      fetch('/api/studio/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch((err) => console.error('Failed to persist studio state:', err));
    }, 250);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('atelier.theme', next);
    } catch {
      // Ignore storage errors
    }
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0D1017] p-6">
        <div className="max-w-md w-full rounded-xl border border-rose-500/40 bg-white dark:bg-[#11151E] p-6 space-y-3">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Unable to load Atelier AI Studio
          </h1>
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0D1017]">
        <div className="h-13 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] px-5 flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-7 w-20 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-500 dark:text-slate-400">
          Loading studio workspace...
        </div>
      </div>
    );
  }

  const activeSession =
    state.sessions.find((s) => s.id === state.activeSessionId) || state.sessions[0];

  const updateActiveSession = (patch: Partial<PromptSession>) => {
    persistState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, ...patch, updatedAt: new Date().toISOString() }
          : s
      ),
    });
  };

  const toggleMount = (
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
    updateActiveSession({ [field]: next });
  };

  const handleCreateSession = () => {
    const id = `session-${Date.now()}`;
    const newSession: PromptSession = {
      ...activeSession,
      id,
      title: 'Untitled Prompt',
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    persistState({
      ...state,
      sessions: [newSession, ...state.sessions],
      activeSessionId: id,
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    if (state.sessions.length <= 1) return;
    const remaining = state.sessions.filter((s) => s.id !== sessionId);
    const nextActiveId =
      state.activeSessionId === sessionId ? remaining[0].id : state.activeSessionId;
    persistState({
      ...state,
      sessions: remaining,
      activeSessionId: nextActiveId,
    });
  };

  const handleImportBundle = (payload: {
    skills?: SkillDoc[];
    tools?: CustomTool[];
    plugins?: PluginConfig[];
    connectors?: Connector[];
  }) => {
    const mergeById = <T extends { id: string }>(existing: T[], incoming?: T[]) => {
      if (!Array.isArray(incoming)) return existing;
      const map = new Map(existing.map((item) => [item.id, item]));
      for (const item of incoming) {
        if (item && item.id) map.set(item.id, item);
      }
      return Array.from(map.values());
    };

    persistState({
      ...state,
      skills: mergeById(state.skills, payload.skills),
      tools: mergeById(state.tools, payload.tools),
      plugins: mergeById(state.plugins, payload.plugins),
      connectors: mergeById(state.connectors, payload.connectors),
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenGetCode={() => setCodeModalOpen(true)}
      />

      {activeView === 'lab' && (
        <PromptLabView
          state={state}
          activeSession={activeSession}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSelectSession={(id) =>
            persistState({ ...state, activeSessionId: id })
          }
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onUpdateSession={updateActiveSession}
          onNavigateView={setActiveView}
          onMemoriesUpdated={(memories: StudioMemoryNote[]) =>
            setState((prev) => (prev ? { ...prev, memories } : prev))
          }
        />
      )}

      {activeView === 'skills' && (
        <SkillsStudioView
          skills={state.skills}
          activeSession={activeSession}
          onSaveSkills={(skills) => persistState({ ...state, skills })}
          onSyncSkills={(skills) =>
            setState((prev) => (prev ? { ...prev, skills } : prev))
          }
          onToggleMountSkill={(id) => toggleMount('activeSkillIds', id)}
          onOpenInLab={(skillId) => {
            if (!activeSession.activeSkillIds.includes(skillId)) {
              updateActiveSession({
                activeSkillIds: [...activeSession.activeSkillIds, skillId],
              });
            }
            setActiveView('lab');
          }}
        />
      )}

      {activeView === 'tools' && (
        <ToolsPluginsView
          tools={state.tools}
          plugins={state.plugins}
          skills={state.skills}
          connectors={state.connectors}
          memories={state.memories}
          activeSession={activeSession}
          onSaveTools={(tools) => persistState({ ...state, tools })}
          onSavePlugins={(plugins) => persistState({ ...state, plugins })}
          onSaveMemories={(memories) => persistState({ ...state, memories })}
          onToggleMountTool={(id) => toggleMount('activeToolIds', id)}
          onToggleMountPlugin={(id) => toggleMount('activePluginIds', id)}
          onImportBundle={handleImportBundle}
        />
      )}

      {activeView === 'connectors' && (
        <ConnectorsView
          connectors={state.connectors}
          activeSession={activeSession}
          onSaveConnectors={(connectors) => persistState({ ...state, connectors })}
          onToggleMountConnector={(id) => toggleMount('activeConnectorIds', id)}
        />
      )}

      <GetCodeModal
        isOpen={codeModalOpen}
        onClose={() => setCodeModalOpen(false)}
        session={activeSession}
        state={state}
      />
    </div>
  );
};

export default App;
