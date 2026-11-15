import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  ClipboardPaste,
  Download,
  FileText,
  PackagePlus,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { PromptSession, SkillDoc } from '../types';
import { parseSkillFrontmatter } from '../lib/skillRouter';
import { MarkdownRenderer } from './MarkdownRenderer';

const MAX_SKILLS = 1000;
const SIDEBAR_PAGE_SIZE = 80;

interface SkillsStudioViewProps {
  skills: SkillDoc[];
  activeSession: PromptSession;
  onSaveSkills: (skills: SkillDoc[]) => void;
  onSyncSkills: (skills: SkillDoc[]) => void;
  onToggleMountSkill: (skillId: string) => void;
  onOpenInLab: (skillId: string) => void;
}

const DEFAULT_SKILL_TEMPLATE = `---
name: custom-skill
description: Describe when and how the model should apply this skill
---

# Custom Skill Instructions

1. **Objective**: Define the primary behavior or workflow this skill enforces.
2. **Rules & Constraints**: Specify formatting, tone, or verification steps.
3. **Output Structure**: Clarify the expected headings, code blocks, or tables.`;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export const SkillsStudioView: React.FC<SkillsStudioViewProps> = ({
  skills,
  activeSession,
  onSaveSkills,
  onSyncSkills,
  onToggleMountSkill,
  onOpenInLab,
}) => {
  const [selectedId, setSelectedId] = useState<string>(skills[0]?.id || '');
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(SIDEBAR_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [loadingPack, setLoadingPack] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setVisibleLimit(SIDEBAR_PAGE_SIZE);
  }, [query]);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.filename.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [skills, query]);

  const visibleSkills = useMemo(
    () => filteredSkills.slice(0, visibleLimit),
    [filteredSkills, visibleLimit]
  );

  const remainingFiltered = Math.max(0, filteredSkills.length - visibleSkills.length);

  const activeSkill =
    skills.find((s) => s.id === selectedId) || filteredSkills[0] || skills[0] || null;

  const isMounted = activeSkill
    ? activeSession.activeSkillIds.includes(activeSkill.id)
    : false;

  const updateSkill = (patch: Partial<SkillDoc>) => {
    if (!activeSkill) return;
    const updated = skills.map((s) =>
      s.id === activeSkill.id
        ? { ...s, ...patch, updatedAt: new Date().toISOString() }
        : s
    );
    onSaveSkills(updated);
  };

  const handleCreateSkill = () => {
    if (skills.length >= MAX_SKILLS) {
      setStatusBanner({
        type: 'error',
        text: `Maximum limit of ${MAX_SKILLS.toLocaleString()} skills reached. Delete unused skills to add more.`,
      });
      return;
    }

    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newSkill: SkillDoc = {
      id,
      name: 'Untitled Skill',
      filename: `skill-${skills.length + 1}.skills.md`,
      description: 'Custom Skills.md instruction module',
      tags: ['Custom'],
      content: DEFAULT_SKILL_TEMPLATE,
      updatedAt: new Date().toISOString(),
    };

    setQuery('');
    setVisibleLimit(SIDEBAR_PAGE_SIZE);
    onSaveSkills([newSkill, ...skills]);
    setSelectedId(id);
    setStatusBanner({
      type: 'success',
      text: `Created new skill (${skills.length + 1} / ${MAX_SKILLS.toLocaleString()}).`,
    });
  };

  const handleDeleteSkill = () => {
    if (!activeSkill) return;
    const remaining = skills.filter((s) => s.id !== activeSkill.id);
    onSaveSkills(remaining);
    setSelectedId(remaining[0]?.id || '');
    setStatusBanner({
      type: 'success',
      text: `Removed "${activeSkill.name}" (${remaining.length} / ${MAX_SKILLS.toLocaleString()}).`,
    });
  };

  const persistNewSkillsToServer = async (incoming: SkillDoc[], sourceLabel: string) => {
    const resp = await fetch('/api/studio/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: incoming }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      added?: number;
      total?: number;
      skills?: SkillDoc[];
      error?: string;
    };
    if (!resp.ok || !data.skills) {
      throw new Error(data.error || `Failed to save ${sourceLabel}.`);
    }
    onSyncSkills(data.skills);
    setQuery('');
    setVisibleLimit(SIDEBAR_PAGE_SIZE);
    if (data.skills[0]) {
      setSelectedId(data.skills[0].id);
    }
    setStatusBanner({
      type: 'success',
      text: `Added ${data.added ?? incoming.length} skill${(data.added ?? incoming.length) === 1 ? '' : 's'} (${(data.total ?? data.skills.length).toLocaleString()} / ${MAX_SKILLS.toLocaleString()}).`,
    });
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0) return;

    if (skills.length >= MAX_SKILLS) {
      setStatusBanner({
        type: 'error',
        text: `Maximum limit of ${MAX_SKILLS.toLocaleString()} skills reached.`,
      });
      return;
    }

    setIsImporting(true);
    setStatusBanner(null);

    try {
      const zipFiles = fileList.filter((f) => /\.zip$/i.test(f.name));
      const textFiles = fileList.filter((f) => !/\.zip$/i.test(f.name));

      let latestSkills = skills;
      let totalAdded = 0;

      // 1. Handle any .md / .markdown / .txt files selected (supports multi-select on iPadOS & desktop)
      if (textFiles.length > 0) {
        const parsedBatch: SkillDoc[] = [];
        for (const file of textFiles) {
          if (latestSkills.length + parsedBatch.length >= MAX_SKILLS) break;
          const text = await file.text();
          if (!text.trim()) continue;
          const meta = parseSkillFrontmatter(text, file.name);
          parsedBatch.push({
            id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: meta.name,
            filename: meta.filename,
            description: meta.description,
            tags: meta.tags,
            content: text,
            updatedAt: new Date().toISOString(),
          });
        }

        if (parsedBatch.length > 0) {
          const resp = await fetch('/api/studio/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skills: parsedBatch }),
          });
          const data = (await resp.json()) as {
            added?: number;
            skills?: SkillDoc[];
            error?: string;
          };
          if (!resp.ok || !data.skills) {
            throw new Error(data.error || 'Failed to import Markdown skills.');
          }
          latestSkills = data.skills;
          totalAdded += data.added ?? parsedBatch.length;
        }
      }

      // 2. Handle any .zip archives selected
      for (const zipFile of zipFiles) {
        if (latestSkills.length >= MAX_SKILLS) break;
        const zipBase64 = await readFileAsBase64(zipFile);
        const resp = await fetch('/api/studio/skills/import-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zipBase64 }),
        });
        const data = (await resp.json()) as {
          added?: number;
          skills?: SkillDoc[];
          error?: string;
        };
        if (!resp.ok || !data.skills) {
          throw new Error(data.error || `Failed to import ${zipFile.name}.`);
        }
        latestSkills = data.skills;
        totalAdded += data.added ?? 0;
      }

      if (totalAdded > 0) {
        onSyncSkills(latestSkills);
        setQuery('');
        setVisibleLimit(SIDEBAR_PAGE_SIZE);
        if (latestSkills[0]) {
          setSelectedId(latestSkills[0].id);
        }
        setStatusBanner({
          type: 'success',
          text: `Imported ${totalAdded} skill${totalAdded === 1 ? '' : 's'} (${latestSkills.length.toLocaleString()} / ${MAX_SKILLS.toLocaleString()}).`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          text: 'No valid Markdown (.md / .txt) or ZIP skill files found in selection.',
        });
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to import skills.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = pasteContent.trim();
    if (!raw) return;

    if (skills.length >= MAX_SKILLS) {
      setStatusBanner({
        type: 'error',
        text: `Maximum limit of ${MAX_SKILLS.toLocaleString()} skills reached.`,
      });
      setPasteModalOpen(false);
      return;
    }

    setIsImporting(true);
    setStatusBanner(null);

    try {
      // Allow pasting multiple skills separated by a line containing only ===
      const chunks = raw
        .split(/\r?\n===\r?\n/)
        .map((c) => c.trim())
        .filter(Boolean);

      const batch: SkillDoc[] = [];
      const ts = new Date().toISOString();

      chunks.forEach((chunk, index) => {
        const headingMatch = chunk.match(/^#\s+(.+)$/m);
        const fallbackTitle =
          chunks.length === 1 && pasteTitle.trim()
            ? pasteTitle.trim()
            : headingMatch?.[1]?.trim() || `Pasted Skill ${skills.length + index + 1}`;
        const meta = parseSkillFrontmatter(
          chunk,
          `${fallbackTitle}.skills.md`,
          chunks.length === 1 ? pasteTitle : undefined
        );
        batch.push({
          id: `skill-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
          name: meta.name,
          filename: meta.filename,
          description: meta.description,
          tags: meta.tags,
          content: chunk,
          updatedAt: ts,
        });
      });

      await persistNewSkillsToServer(batch, 'pasted skills');
      setPasteTitle('');
      setPasteContent('');
      setPasteModalOpen(false);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save pasted skills.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadSkill = () => {
    if (!activeSkill) return;
    const blob = new Blob([activeSkill.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeSkill.filename || 'SKILL.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadPack = async () => {
    if (skills.length >= MAX_SKILLS) {
      setStatusBanner({
        type: 'error',
        text: `Maximum limit of ${MAX_SKILLS.toLocaleString()} skills reached.`,
      });
      return;
    }

    setLoadingPack(true);
    setStatusBanner(null);
    try {
      const resp = await fetch('/api/studio/skills/pack');
      const data = (await resp.json()) as { skills: SkillDoc[] };
      if (Array.isArray(data.skills)) {
        const existingIds = new Set(skills.map((s) => s.id));
        const remainingCapacity = Math.max(0, MAX_SKILLS - skills.length);
        const additions = data.skills
          .filter((s) => !existingIds.has(s.id))
          .slice(0, remainingCapacity);

        if (additions.length > 0) {
          const next = [...skills, ...additions];
          onSaveSkills(next);
          if (!selectedId && additions[0]) setSelectedId(additions[0].id);
          setStatusBanner({
            type: 'success',
            text: `Loaded ${additions.length} starter skills (${next.length.toLocaleString()} / ${MAX_SKILLS.toLocaleString()}).`,
          });
        } else {
          setStatusBanner({
            type: 'success',
            text: `All 21 starter skills are already in your library (${skills.length.toLocaleString()} / ${MAX_SKILLS.toLocaleString()}).`,
          });
        }
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load starter pack.',
      });
    } finally {
      setLoadingPack(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-slate-50 dark:bg-[#0D1017]">
      {/* Left Sidebar: Skills.md Library */}
      <aside className="w-full md:w-72 shrink-0 max-h-[40vh] md:max-h-none border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#11151E] flex flex-col">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Skills.md Library
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {skills.length.toLocaleString()} / {MAX_SKILLS.toLocaleString()} skills
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                disabled={isImporting}
                title="Paste single or bulk skills"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Import .md or .zip files"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCreateSkill}
                disabled={isImporting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Skill</span>
              </button>
            </div>
            {/* No restrictive `accept` filter so iPadOS Files never grays out .md or .zip */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleImportFiles}
              className="hidden"
            />
          </div>

          {statusBanner && (
            <div
              className={`flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11px] border ${
                statusBanner.type === 'error'
                  ? 'border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <span className="leading-snug">{statusBanner.text}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${skills.length.toLocaleString()} skills...`}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSkills.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching Skills.md files.
            </div>
          ) : (
            <>
              {visibleSkills.map((skill) => {
                const selected = activeSkill?.id === skill.id;
                const mounted = activeSession.activeSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelectedId(skill.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30'
                        : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {skill.name}
                      </span>
                      {mounted && (
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                          Mounted
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{skill.filename}</span>
                    </div>
                  </button>
                );
              })}

              {remainingFiltered > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + SIDEBAR_PAGE_SIZE)}
                  className="w-full mt-1 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer tabular-nums"
                >
                  Show {Math.min(SIDEBAR_PAGE_SIZE, remainingFiltered)} more ({remainingFiltered.toLocaleString()} left)
                </button>
              )}
            </>
          )}
        </div>

        {/* ZIP Export & 21-Skill Pack Controls */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-[#0F131C]">
          <a
            href="/api/studio/skills/export.zip?source=pack"
            download="gemini-21-skills-pack.zip"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Download 21 Skills (.zip)</span>
          </a>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleLoadPack}
              disabled={loadingPack}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>{loadingPack ? 'Loading...' : 'Load 21 Pack'}</span>
            </button>

            <a
              href="/api/studio/skills/export.zip"
              download="atelier-skills-library.zip"
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Mine</span>
            </a>
          </div>
        </div>
      </aside>

      {/* Main Editor + Preview */}
      {activeSkill ? (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Metadata Toolbar */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px] grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Skill Title
                </label>
                <input
                  type="text"
                  value={activeSkill.name}
                  onChange={(e) => updateSkill({ name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Filename (.md)
                </label>
                <input
                  type="text"
                  value={activeSkill.filename}
                  onChange={(e) => updateSkill({ filename: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={activeSkill.tags.join(', ')}
                  onChange={(e) =>
                    updateSkill({
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                {(['split', 'edit', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize cursor-pointer ${
                      viewMode === mode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onToggleMountSkill(activeSkill.id)}
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
                onClick={() => onOpenInLab(activeSkill.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Test in Lab</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSkill}
                title="Download .md"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDeleteSkill}
                title="Delete skill"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Description + Unboxed Metadata Line */}
          <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0F131C] flex flex-wrap items-center justify-between gap-4">
            <input
              type="text"
              value={activeSkill.description}
              onChange={(e) => updateSkill({ description: e.target.value })}
              placeholder="Short description of when this skill applies..."
              className="flex-1 min-w-[220px] bg-transparent text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-2 shrink-0">
              <span>{activeSkill.tags.join(' · ') || 'No tags'}</span>
              <span aria-hidden="true">·</span>
              <span>{activeSkill.content.length.toLocaleString()} chars</span>
            </div>
          </div>

          {/* Editor / Preview Split */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {(viewMode === 'split' || viewMode === 'edit') && (
              <div
                className={`flex-1 min-w-0 min-h-0 flex flex-col ${
                  viewMode === 'split'
                    ? 'border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800'
                    : ''
                }`}
              >
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-[#11151E]">
                  Markdown Source ({activeSkill.filename})
                </div>
                <textarea
                  value={activeSkill.content}
                  onChange={(e) => updateSkill({ content: e.target.value })}
                  spellCheck={false}
                  className="flex-1 w-full p-5 bg-white dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 font-mono text-[13.5px] leading-relaxed resize-none focus:outline-none"
                  placeholder="Write your Skills.md system instructions here..."
                />
              </div>
            )}

            {(viewMode === 'split' || viewMode === 'preview') && (
              <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-50/50 dark:bg-[#0F131C]">
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-[#11151E]">
                  Rendered Preview
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <MarkdownRenderer content={activeSkill.content} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <FileText className="w-10 h-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Skills.md modules yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Create reusable Markdown instruction files, paste text directly, or import .md / .zip packs (up to 1,000 skills).
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleCreateSkill}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Skill.md</span>
            </button>
            <button
              type="button"
              onClick={() => setPasteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Paste Skill Text</span>
            </button>
          </div>
        </div>
      )}

      {/* Paste / Bulk Add Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handlePasteSubmit}
            className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Paste Single or Bulk Skills
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Paste one Markdown skill, or separate multiple skills with a line containing{' '}
                  <code className="font-mono">===</code> ({skills.length.toLocaleString()} / {MAX_SKILLS.toLocaleString()} stored).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close paste modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Title (optional for single skill)
                </label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. Crop Disease Advisor or React Landing Page"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Skills.md Markdown Content
                </label>
                <textarea
                  rows={10}
                  required
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder={`# Skill One\nWrite instructions here...\n\n===\n\n# Skill Two\nPaste another skill below === to add many at once!`}
                  className="w-full px-3 py-2 text-xs font-mono leading-relaxed rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0F131C] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting || !pasteContent.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
              >
                {isImporting ? 'Saving...' : 'Save to Library'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
