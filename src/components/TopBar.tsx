import React from 'react';
import {
  BookOpen,
  Code2,
  LayoutDashboard,
  PlugZap,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import type { StudioView } from '../types';

interface TopBarProps {
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  onOpenGetCode: () => void;
}

const NAV_ITEMS = [
  { id: 'lab' as StudioView, label: 'Prompt Lab', Icon: LayoutDashboard },
  { id: 'skills' as StudioView, label: 'Skills.md', Icon: BookOpen },
  { id: 'tools' as StudioView, label: 'Tools & Plugins', Icon: Puzzle },
  { id: 'connectors' as StudioView, label: 'Connectors', Icon: PlugZap },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  onOpenGetCode,
}) => {
  return (
    <header className="atelier-topbar relative z-20 flex h-[68px] shrink-0 items-center justify-between gap-5 border-b border-slate-200 bg-white px-6 dark:border-[#292E38] dark:bg-[#191C23]">
      <button
        type="button"
        onClick={() => onSelectView('lab')}
        aria-label="Go to Prompt Lab"
        className="atelier-brand group inline-flex shrink-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4285F4] text-white shadow-lg shadow-blue-500/20 transition-transform group-hover:scale-[1.04]">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[14px] font-bold tracking-[-0.025em] text-slate-900 dark:text-[#F5F5F5]">
            Atelier
          </span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-[#8993A3]">
            AI Studio
          </span>
        </span>
      </button>

      <nav
        aria-label="Primary studio navigation"
        className="flex min-w-0 items-center justify-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/80 p-1 dark:border-[#292E38] dark:bg-[#11151B]"
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`atelier-nav-button inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'bg-white text-[#4285F4] shadow-sm ring-1 ring-black/[0.04] dark:bg-[#252B36] dark:text-[#78A9FF] dark:ring-white/[0.06]'
                  : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C222C] dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onOpenGetCode}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/15 transition-all hover:-translate-y-px hover:bg-[#3478E5] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#191C23]"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Get Code</span>
        </button>
      </div>
    </header>
  );
};
