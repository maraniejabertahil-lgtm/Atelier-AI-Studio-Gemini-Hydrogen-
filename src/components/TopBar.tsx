import React from 'react';
import { Code2 } from 'lucide-react';
import type { StudioView } from '../types';

interface TopBarProps {
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  onOpenGetCode: () => void;
}

const NAV_ITEMS: Array<{ id: StudioView; label: string }> = [
  { id: 'lab', label: 'Prompt Lab' },
  { id: 'skills', label: 'Skills.md' },
  { id: 'tools', label: 'Tools & Plugins' },
  { id: 'connectors', label: 'Connectors' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  onOpenGetCode,
}) => {
  return (
    <header className="h-13 shrink-0 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] px-5 flex items-center justify-between gap-8">
      {/* Zone 1: Single-line brand title */}
      <button
        type="button"
        onClick={() => onSelectView('lab')}
        className="text-[16px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        Atelier AI Studio
      </button>

      {/* Zone 2: Clean text nav links */}
      <nav aria-label="Primary studio navigation" className="flex items-center gap-6 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`relative py-3.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenGetCode}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#11151E]"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Get Code</span>
        </button>
      </div>
    </header>
  );
};
