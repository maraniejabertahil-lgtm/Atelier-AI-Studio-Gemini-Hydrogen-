import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StudioState } from '../src/types.ts';
import { parseSkillFrontmatter } from '../src/lib/skillRouter.ts';
import { getTwentyOneSkillPack } from './skillPack.ts';

const DATA_PATH = resolve(process.cwd(), 'data', 'studio-state.json');

function nowIso(): string {
  return new Date().toISOString();
}

const DEFAULT_SYSTEM_INSTRUCTION = `You are a general-purpose assistant for a licensed agriculturist who is also a serious hobbyist in website and web app development. Explain everything in plain English, avoiding jargon, and define any technical term the first time you use it.

For reasoning and complex problems, work through the problem step by step, state your assumptions, check your logic, and say clearly how confident you are in the answer. If a question is unclear, ask one focused question before guessing.

For website and coding help: when the change is small, give exact instructions showing where to click or what line to change. When the change is major or any code is longer than 50 lines, give the complete code in one block, ready to copy. Explain what each important part does in one or two sentences.

Keep answers well organized with short headings or numbered steps. Avoid unnecessary filler. If you are unsure of a fact, say so instead of guessing.`;

export function createDefaultStudioState(): StudioState {
  const ts = nowIso();
  const packSkills = getTwentyOneSkillPack();

  return {
    studioVersion: 6,
    skills: [
      ...packSkills,
      {
        id: 'skill-architect-review',
        name: 'System Architect & Code Reviewer',
        filename: 'architect-review.skills.md',
        description: 'Reviews architecture, security boundaries, and code quality with actionable diffs.',
        tags: ['Engineering', 'Architecture', 'Review'],
        updatedAt: ts,
        content: `---
name: architect-review
description: Principal software architect review protocol
---

# System Architect & Code Reviewer

When reviewing code, specifications, or architecture proposals:

1. **Correctness & Edge Cases First**: Identify race conditions, null/boundary failures, and error-handling gaps before style comments.
2. **Boundary Clarity**: Evaluate coupling, data flow direction, and state ownership.
3. **Concrete Remediation**: Every critique must include a brief, copy-ready fix or structural alternative.
4. **Concise Summary**: End with a prioritized checklist (Critical, Recommended, Optional).`,
      },
      {
        id: 'skill-concise-analyst',
        name: 'Structured Research & Data Analyst',
        filename: 'concise-analyst.skills.md',
        description: 'Synthesizes web/API findings into structured briefs with explicit sources and units.',
        tags: ['Research', 'Synthesis', 'Analysis'],
        updatedAt: ts,
        content: `---
name: concise-analyst
description: Evidence-backed synthesis and structured briefing
---

# Structured Research & Data Analyst

Follow these rules for analytical and research questions:

- Lead with a clear executive answer, then provide thorough supporting breakdown and evidence.
- Present comparisons in crisp Markdown tables with explicit units and timeframes.
- Whenever a tool or connector returns live data, quote exact returned figures rather than rounding loosely.
- Clearly distinguish verified tool/search outputs from general reasoning.`,
      },
      {
        id: 'skill-schema-designer',
        name: 'API & Schema Designer',
        filename: 'schema-designer.skills.md',
        description: 'Designs clean TypeScript interfaces, JSON Schemas, and REST contracts.',
        tags: ['API', 'TypeScript', 'JSON Schema'],
        updatedAt: ts,
        content: `---
name: schema-designer
description: Clean contract-first API and data modeling
---

# API & Schema Designer

- Prefer explicit, self-documenting field names and ISO-8601 timestamps.
- Distinguish required vs. optional properties clearly.
- Provide realistic sample payloads alongside TypeScript types.
- Highlight pagination, idempotency, and error payload shapes.`,
      },
    ],
    tools: [
      {
        id: 'tool-math-eval',
        name: 'evaluate_calculation',
        description: 'Safely evaluates a mathematical formula or unit conversion in JavaScript and returns exact numeric output.',
        handlerType: 'javascript',
        parameters: [
          {
            name: 'expression',
            type: 'STRING',
            description: 'JavaScript Math expression to evaluate, e.g. "(1450 * 0.18) + 42" or "Math.pow(1.07, 10)"',
            required: true,
          },
          {
            name: 'precision',
            type: 'INTEGER',
            description: 'Decimal places to round to (default 4)',
            required: false,
          },
        ],
        jsCode: `// args.expression and args.precision are provided
const expr = String(args.expression || '');
if (!/^[0-9+\\-*/().,\\sMathpowsqrabsroundceilflmaxminPIE]+$/.test(expr)) {
  return { error: 'Only numeric arithmetic and Math.* functions are allowed.' };
}
const raw = Function('"use strict"; return (' + expr + ')')();
const digits = typeof args.precision === 'number' ? Math.min(Math.max(args.precision, 0), 12) : 4;
const rounded = typeof raw === 'number' && Number.isFinite(raw) ? Number(raw.toFixed(digits)) : raw;
return { expression: expr, result: rounded };`,
        updatedAt: ts,
      },
      {
        id: 'tool-text-analyzer',
        name: 'analyze_text_and_json',
        description: 'Inspects long text, code, or JSON strings deterministically: counts lines/words/chars, validates JSON syntax, and extracts headings or URLs.',
        handlerType: 'javascript',
        parameters: [
          {
            name: 'text',
            type: 'STRING',
            description: 'The text or JSON content to analyze',
            required: true,
          },
        ],
        jsCode: `const txt = String(args.text || '');
const lines = txt.split('\\n');
const words = txt.trim() ? txt.trim().split(/\\s+/).length : 0;
const urls = Array.from(new Set(txt.match(/https?:\\/\\/[^\\s)]+/g) || []));
const headings = lines.filter((l) => /^#{1,4}\\s+/.test(l)).slice(0, 20);
let validJson = false;
let jsonKeys = [];
try {
  const parsed = JSON.parse(txt);
  validJson = true;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    jsonKeys = Object.keys(parsed).slice(0, 30);
  }
} catch {}
return {
  characters: txt.length,
  words,
  lines: lines.length,
  validJson,
  jsonKeys,
  urls: urls.slice(0, 20),
  headings
};`,
        updatedAt: ts,
      },
      {
        id: 'tool-plan-steps',
        name: 'plan_execution_steps',
        description: 'Structures a complex multi-step task into ordered phases with goals and verification checks before executing.',
        handlerType: 'javascript',
        parameters: [
          {
            name: 'goal',
            type: 'STRING',
            description: 'Overall objective of the task',
            required: true,
          },
          {
            name: 'stepsJson',
            type: 'STRING',
            description: 'JSON array of step strings or objects describing each phase',
            required: true,
          },
        ],
        jsCode: `let steps = [];
try {
  steps = JSON.parse(String(args.stepsJson || '[]'));
} catch {
  steps = [String(args.stepsJson || '')];
}
return {
  goal: args.goal,
  totalSteps: Array.isArray(steps) ? steps.length : 0,
  steps,
  createdAt: new Date().toISOString()
};`,
        updatedAt: ts,
      },
      {
        id: 'tool-json-formatter',
        name: 'build_comparison_matrix',
        description: 'Converts items and criteria into a normalized score summary object for clean comparison.',
        handlerType: 'javascript',
        parameters: [
          {
            name: 'title',
            type: 'STRING',
            description: 'Title of the comparison matrix',
            required: true,
          },
          {
            name: 'itemsJson',
            type: 'STRING',
            description: 'JSON string array of objects, e.g. [{"name":"Option A","cost":10,"speed":8}]',
            required: true,
          },
        ],
        jsCode: `const items = JSON.parse(String(args.itemsJson || '[]'));
return {
  title: args.title,
  count: Array.isArray(items) ? items.length : 0,
  items,
  generatedAt: new Date().toISOString()
};`,
        updatedAt: ts,
      },
    ],
    plugins: [
      {
        id: 'plugin-skill-router',
        name: 'Autonomous Skill Router',
        kind: 'skill_router',
        description: 'Gives Gemini awareness of every Skills.md in your library and registers load_studio_skill so it loads specialized skills on demand.',
        updatedAt: ts,
      },
      {
        id: 'plugin-google-search',
        name: 'Google Search Grounding',
        kind: 'google_search',
        description: 'Native Gemini Search grounding for real-time web facts, documentation lookups, and citations.',
        updatedAt: ts,
      },
      {
        id: 'plugin-url-context',
        name: 'URL Context Reader',
        kind: 'url_context',
        description: 'Allows Gemini to directly fetch and reason over web page URLs pasted in your prompt.',
        updatedAt: ts,
      },
      {
        id: 'plugin-studio-memory',
        name: 'Studio Scratchpad Memory',
        kind: 'studio_memory',
        description: 'Registers save_studio_note and read_studio_notes tools backed by your persistent Studio memory store.',
        updatedAt: ts,
      },
    ],
    connectors: [
      {
        id: 'conn-wikipedia',
        name: 'Wikipedia Knowledge Lookup',
        toolName: 'lookup_wikipedia',
        description: 'Fetches verified encyclopedic summary and facts for any topic, person, technology, or concept from Wikipedia.',
        url: 'https://en.wikipedia.org/api/rest_v1/page/summary/{{topic}}',
        method: 'GET',
        authType: 'none',
        headers: [
          { key: 'Accept', value: 'application/json' },
          { key: 'User-Agent', value: 'Atelier-AI-Studio/1.0' },
        ],
        parameters: [
          {
            name: 'topic',
            type: 'STRING',
            description: 'Wikipedia page title using underscores for spaces, e.g. "Transformer_(deep_learning_architecture)" or "Quantum_computing"',
            required: true,
          },
        ],
        updatedAt: ts,
      },
      {
        id: 'conn-open-meteo',
        name: 'Open-Meteo Live Weather',
        toolName: 'get_live_weather',
        description: 'Fetches current real-time temperature and wind speed for given latitude and longitude coordinates.',
        url: 'https://api.open-meteo.com/v1/forecast?latitude={{latitude}}&longitude={{longitude}}&current=temperature_2m,wind_speed_10m,weather_code',
        method: 'GET',
        authType: 'none',
        headers: [{ key: 'Accept', value: 'application/json' }],
        parameters: [
          {
            name: 'latitude',
            type: 'NUMBER',
            description: 'Latitude coordinate, e.g. 51.5072 for London or 37.7749 for San Francisco',
            required: true,
          },
          {
            name: 'longitude',
            type: 'NUMBER',
            description: 'Longitude coordinate, e.g. -0.1276 for London or -122.4194 for San Francisco',
            required: true,
          },
        ],
        updatedAt: ts,
      },
      {
        id: 'conn-github-repo',
        name: 'GitHub Repository Inspector',
        toolName: 'get_github_repo',
        description: 'Fetches live stars, forks, open issues, description, and default branch for any public GitHub repository.',
        url: 'https://api.github.com/repos/{{owner}}/{{repo}}',
        method: 'GET',
        authType: 'none',
        headers: [
          { key: 'Accept', value: 'application/vnd.github+json' },
          { key: 'User-Agent', value: 'Atelier-AI-Studio' },
        ],
        parameters: [
          {
            name: 'owner',
            type: 'STRING',
            description: 'GitHub organization or username, e.g. googleapis',
            required: true,
          },
          {
            name: 'repo',
            type: 'STRING',
            description: 'Repository name, e.g. js-genai',
            required: true,
          },
        ],
        updatedAt: ts,
      },
    ],
    memories: [
      {
        id: 'mem-welcome',
        key: 'studio_preferences',
        content: 'Adapt depth to the question: natural and direct for quick chats, thorough and complete for deep technical or long-form requests. Prefer TypeScript examples with strict types.',
        updatedAt: ts,
      },
      {
        id: 'mem-profile',
        key: 'user_profile',
        content: 'User is a licensed agriculturist and serious hobbyist in website and web app development. Explain in plain English, define technical terms on first use, state reasoning assumptions and confidence, give line-by-line instructions for small edits, and full copy-ready code blocks when changes are major or over 50 lines.',
        updatedAt: ts,
      },
    ],
    sessions: [
      {
        id: 'session-default',
        title: 'Personal Assistant',
        model: 'gemini-4-hydrogen',
        thinkingLevel: 'MEDIUM',
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        activeSkillIds: ['skill-human-partner'],
        activeToolIds: ['tool-math-eval', 'tool-text-analyzer', 'tool-plan-steps'],
        activePluginIds: [
        'plugin-skill-router',
        'plugin-studio-memory',
        'plugin-google-search',
        'plugin-url-context',
        ],
        activeConnectorIds: ['conn-wikipedia', 'conn-open-meteo', 'conn-github-repo'],
        responseFormat: 'text',
        responseSchemaJson: JSON.stringify(
          {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING', description: 'Concise answer summary' },
              keyPoints: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                description: 'Supporting key points',
              },
            },
            required: ['summary', 'keyPoints'],
          },
          null,
          2
        ),
        voiceName: 'Zephyr',
        autoSpeak: false,
        messages: [],
        updatedAt: ts,
      },
    ],
    activeSessionId: 'session-default',
  };
}

function migrateStudioState(parsed: StudioState): { state: StudioState; changed: boolean } {
  let changed = false;
  const defaults = createDefaultStudioState();

  const existingSkillIds = new Set(parsed.skills.map((s) => s.id));
  for (const s of defaults.skills) {
    const idx = parsed.skills.findIndex((existing) => existing.id === s.id);
    if (!existingSkillIds.has(s.id)) {
      parsed.skills.push(s);
      changed = true;
    } else if (s.id === 'skill-human-partner' && idx !== -1 && (parsed.studioVersion ?? 1) < 3) {
      parsed.skills[idx] = s;
      changed = true;
    }
  }

  const existingToolIds = new Set(parsed.tools.map((t) => t.id));
  for (const t of defaults.tools) {
    if (!existingToolIds.has(t.id)) {
      parsed.tools.push(t);
      changed = true;
    }
  }

  const existingConnectorIds = new Set(parsed.connectors.map((c) => c.id));
  for (const c of defaults.connectors) {
    if (!existingConnectorIds.has(c.id)) {
      parsed.connectors.unshift(c);
      changed = true;
    }
  }

  const existingPluginIds = new Set(parsed.plugins.map((p) => p.id));
  for (const p of defaults.plugins) {
    if (!existingPluginIds.has(p.id)) {
      parsed.plugins.unshift(p);
      changed = true;
    }
  }

  for (const sess of parsed.sessions) {
    if (!sess.voiceName) {
      sess.voiceName = 'Zephyr';
      changed = true;
    }
  }

  if ((parsed.studioVersion ?? 1) < 2) {
    for (const sess of parsed.sessions) {
      if (!sess.activePluginIds.includes('plugin-skill-router')) {
        sess.activePluginIds.push('plugin-skill-router');
      }
      if (!sess.activePluginIds.includes('plugin-google-search')) {
        sess.activePluginIds.push('plugin-google-search');
      }
      if (!sess.activePluginIds.includes('plugin-url-context')) {
        sess.activePluginIds.push('plugin-url-context');
      }
      if (!sess.activeSkillIds.includes('skill-human-partner')) {
        sess.activeSkillIds.unshift('skill-human-partner');
      }
    }
  }

  if ((parsed.studioVersion ?? 1) < 3) {
    // Update default memory preference so it doesn't force short responses on long chats
    const welcomeMem = parsed.memories.find((m) => m.id === 'mem-welcome');
    if (welcomeMem) {
      welcomeMem.content = defaults.memories[0].content;
    }

    for (const sess of parsed.sessions) {
      // Remove concise-analyst from default active skills if human-partner is active so long chats aren't capped at 2 sentences
      if (sess.activeSkillIds.includes('skill-human-partner')) {
        sess.activeSkillIds = sess.activeSkillIds.filter((id) => id !== 'skill-concise-analyst');
      }
      // Set default thinking to MEDIUM for fast, quota-friendly responses while keeping HIGH/XHIGH 1 click away
      if (sess.thinkingLevel === 'HIGH') {
        sess.thinkingLevel = 'MEDIUM';
      }
      for (const tid of ['tool-text-analyzer', 'tool-plan-steps']) {
        if (!sess.activeToolIds.includes(tid)) sess.activeToolIds.push(tid);
      }
      if (!sess.activeConnectorIds.includes('conn-wikipedia')) {
        sess.activeConnectorIds.unshift('conn-wikipedia');
      }
    }
    changed = true;
  }

  if ((parsed.studioVersion ?? 1) < 4) {
    for (const sess of parsed.sessions) {
      sess.activePluginIds = sess.activePluginIds.filter(
        (id) => id !== 'plugin-google-search' && id !== 'plugin-url-context'
      );
      if (!sess.activePluginIds.includes('plugin-skill-router')) {
        sess.activePluginIds.push('plugin-skill-router');
      }
      if (!sess.activePluginIds.includes('plugin-studio-memory')) {
        sess.activePluginIds.push('plugin-studio-memory');
      }
    }
    changed = true;
  }

  if ((parsed.studioVersion ?? 1) < 5) {
    parsed.studioVersion = 5;
    changed = true;

    if (!parsed.memories.some((m) => m.id === 'mem-profile')) {
      parsed.memories.push(defaults.memories[1]);
    }

    for (const sess of parsed.sessions) {
      if (!sess.systemInstruction || !sess.systemInstruction.trim()) {
        sess.systemInstruction = DEFAULT_SYSTEM_INSTRUCTION;
      }
      sess.activeSkillIds = ['skill-human-partner'];
    }
  }

  // Always repair imported skills that still have generic "Imported from ..." descriptions
  for (const skill of parsed.skills) {
    if (skill.description.startsWith('Imported from ') && skill.content.trim()) {
      const meta = parseSkillFrontmatter(skill.content, skill.filename);
      if (meta.description && meta.description !== skill.description) {
        skill.name = meta.name;
        skill.description = meta.description;
        if (skill.tags.length === 1 && skill.tags[0] === 'Imported' && meta.tags.length > 0) {
          skill.tags = meta.tags;
        }
        changed = true;
      }
    }
  }

  if ((parsed.studioVersion ?? 1) < 6) {
    parsed.studioVersion = 6;
    changed = true;
    for (const sess of parsed.sessions) {
      if (!sess.activePluginIds.includes('plugin-skill-router')) {
        sess.activePluginIds.push('plugin-skill-router');
      }
    }
  }

  return { state: parsed, changed };
}

export function loadStudioState(): StudioState {
  try {
    if (existsSync(DATA_PATH)) {
      const raw = readFileSync(DATA_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StudioState;
      if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const { state, changed } = migrateStudioState(parsed);
        if (changed) saveStudioState(state);
        return state;
      }
    }
  } catch (err) {
    console.error('Failed to read studio-state.json, initializing defaults:', err);
  }
  const defaults = createDefaultStudioState();
  saveStudioState(defaults);
  return defaults;
}

export function saveStudioState(state: StudioState): void {
  const dir = dirname(DATA_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
