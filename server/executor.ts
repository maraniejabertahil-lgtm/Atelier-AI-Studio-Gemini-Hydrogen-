import vm from 'node:vm';
import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import type {
  Connector,
  CustomTool,
  ParamType,
  StudioMemoryNote,
  StudioState,
  ToolParam,
} from '../src/types.ts';
import { extractSkillBody, scoreSkillRelevance } from '../src/lib/skillRouter.ts';

function mapParamType(t: ParamType): Type {
  switch (t) {
    case 'NUMBER':
      return Type.NUMBER;
    case 'INTEGER':
      return Type.INTEGER;
    case 'BOOLEAN':
      return Type.BOOLEAN;
    case 'ARRAY':
      return Type.ARRAY;
    case 'OBJECT':
      return Type.OBJECT;
    case 'STRING':
    default:
      return Type.STRING;
  }
}

export function buildFunctionDeclaration(
  name: string,
  description: string,
  parameters: ToolParam[]
): FunctionDeclaration {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];

  for (const param of parameters) {
    if (!param.name.trim()) continue;
    const schema: Schema = {
      type: mapParamType(param.type),
      description: param.description || undefined,
    };
    if (param.type === 'ARRAY') {
      schema.items = { type: Type.STRING };
    }
    if (param.type === 'OBJECT') {
      schema.properties = {
        value: { type: Type.STRING, description: 'Object field value' },
      };
    }
    properties[param.name.trim()] = schema;
    if (param.required) {
      required.push(param.name.trim());
    }
  }

  // Gemini Type.OBJECT cannot have completely empty properties if parameters are specified
  if (Object.keys(properties).length === 0) {
    return {
      name,
      description,
    };
  }

  return {
    name,
    description,
    parameters: {
      type: Type.OBJECT,
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

export const STUDIO_MEMORY_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'save_studio_note',
    description: 'Save or update a persistent note in the user personal AI Studio scratchpad memory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: {
          type: Type.STRING,
          description: 'Short identifier key for the note, e.g. "project_stack" or "api_conventions"',
        },
        content: {
          type: Type.STRING,
          description: 'The note content to remember across conversations',
        },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'read_studio_notes',
    description: 'Read all saved notes from the user personal AI Studio scratchpad memory.',
  },
];

export const SKILL_ROUTER_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'load_studio_skill',
    description:
      'Loads the full Markdown instructions of a specific Skills.md module from the user studio library when relevant to the current request.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        skill_name: {
          type: Type.STRING,
          description: 'Skill id, filename, or title from the Studio Skills catalog (e.g. "frontend-design/Skills.md" or "PostgreSQL")',
        },
      },
      required: ['skill_name'],
    },
  },
];

export function executeSkillRouterTool(
  args: Record<string, unknown>,
  state: StudioState
): unknown {
  const query = String(args.skill_name || '').trim().toLowerCase();
  if (!query) {
    return { error: 'skill_name is required.' };
  }
  const exactOrSubstring =
    state.skills.find(
      (s) =>
        s.id.toLowerCase() === query ||
        s.filename.toLowerCase() === query ||
        s.name.toLowerCase() === query
    ) ||
    state.skills.find(
      (s) =>
        s.filename.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query)
    );

  const match =
    exactOrSubstring ||
    [...state.skills]
      .map((s) => ({ s, score: scoreSkillRelevance(query, s) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)[0]?.s;

  if (!match) {
    return {
      error: `Skill "${args.skill_name}" not found.`,
      availableSkills: state.skills.slice(0, 30).map((s) => ({
        name: s.name,
        filename: s.filename,
      })),
    };
  }

  const body = extractSkillBody(match.content) || match.content;
  const trimmedInstructions =
    body.length > 12000
      ? `${body.slice(0, 12000)}\n\n...[truncated for prompt efficiency]`
      : body;

  return {
    name: match.name,
    filename: match.filename,
    description: match.description,
    instructions: trimmedInstructions,
  };
}

function interpolateTemplate(template: string, args: Record<string, unknown>, encodeForUrl: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const val = args[key];
    if (val === undefined || val === null) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return encodeForUrl ? encodeURIComponent(str) : str;
  });
}

export async function executeConnector(
  connector: Connector,
  args: Record<string, unknown>
): Promise<{ status: number; headers: Record<string, string>; data: unknown; durationMs: number }> {
  const started = Date.now();
  const resolvedUrl = interpolateTemplate(connector.url, args, true);
  const headers: Record<string, string> = {};

  for (const h of connector.headers) {
    if (h.key.trim()) {
      headers[h.key.trim()] = interpolateTemplate(h.value, args, false);
    }
  }

  if (connector.authType === 'bearer' && connector.authToken) {
    headers['Authorization'] = `Bearer ${connector.authToken}`;
  } else if (connector.authType === 'header' && connector.authHeaderName && connector.authToken) {
    headers[connector.authHeaderName] = connector.authToken;
  }

  let body: string | undefined;
  if (connector.method !== 'GET' && connector.method !== 'DELETE') {
    if (connector.bodyTemplate && connector.bodyTemplate.trim()) {
      body = interpolateTemplate(connector.bodyTemplate, args, false);
    } else if (Object.keys(args).length > 0) {
      body = JSON.stringify(args);
    }
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(resolvedUrl, {
      method: connector.method,
      headers,
      body,
      signal: controller.signal,
    });

    const durationMs = Date.now() - started;
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    let parsed: unknown = rawText;

    if (contentType.includes('application/json')) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText.slice(0, 8000);
      }
    }

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    return {
      status: response.status,
      headers: respHeaders,
      data: parsed,
      durationMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeCustomTool(
  tool: CustomTool,
  args: Record<string, unknown>,
  state: StudioState
): Promise<unknown> {
  if (tool.handlerType === 'connector') {
    if (!tool.connectorId) {
      throw new Error(`Tool "${tool.name}" is configured to use a connector, but no connector is linked.`);
    }
    const connector = state.connectors.find((c) => c.id === tool.connectorId);
    if (!connector) {
      throw new Error(`Linked connector "${tool.connectorId}" was not found.`);
    }
    const res = await executeConnector(connector, args);
    return { status: res.status, data: res.data };
  }

  if (tool.handlerType === 'json_template') {
    const raw = interpolateTemplate(tool.jsonTemplate || '{}', args, false);
    try {
      return JSON.parse(raw);
    } catch {
      return { output: raw };
    }
  }

  // Sandboxed JavaScript execution
  const code = tool.jsCode || 'return { ok: true, args };';
  const sandbox = {
    args: structuredClone(args),
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
  };

  const wrapped = `(function(args) {\n${code}\n})(args)`;
  const result = vm.runInNewContext(wrapped, sandbox, { timeout: 1500 });
  return result === undefined ? { ok: true } : result;
}

export function executeStudioMemoryTool(
  toolName: string,
  args: Record<string, unknown>,
  state: StudioState
): { result: unknown; mutated: boolean } {
  if (toolName === 'read_studio_notes') {
    return {
      result: {
        notes: state.memories.map((m) => ({
          key: m.key,
          content: m.content,
          updatedAt: m.updatedAt,
        })),
      },
      mutated: false,
    };
  }

  if (toolName === 'save_studio_note') {
    const key = String(args.key || 'untitled').trim();
    const content = String(args.content || '').trim();
    const existing = state.memories.find((m) => m.key === key);
    const now = new Date().toISOString();

    if (existing) {
      existing.content = content;
      existing.updatedAt = now;
    } else {
      const note: StudioMemoryNote = {
        id: `mem-${Date.now()}`,
        key,
        content,
        updatedAt: now,
      };
      state.memories.unshift(note);
    }
    return {
      result: { saved: true, key, content, updatedAt: now },
      mutated: true,
    };
  }

  return { result: { error: `Unknown memory tool: ${toolName}` }, mutated: false };
}
