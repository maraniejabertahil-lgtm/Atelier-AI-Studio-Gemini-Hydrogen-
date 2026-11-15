import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import express, { type Request, type Response } from 'express';
import { WebSocketServer } from 'ws';
import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type LiveServerMessage,
  type Part,
  type Tool,
} from '@google/genai';
import { loadStudioState, saveStudioState } from './server/store.ts';
import { getTwentyOneSkillPack } from './server/skillPack.ts';
import {
  buildZipBuffer,
  extractZipBinaryEntries,
  extractZipTextEntries,
  type ZipEntry,
} from './server/zip.ts';

const execFileAsync = promisify(execFile);
import {
  buildFunctionDeclaration,
  executeConnector,
  executeCustomTool,
  executeSkillRouterTool,
  executeStudioMemoryTool,
  SKILL_ROUTER_DECLARATIONS,
  STUDIO_MEMORY_DECLARATIONS,
} from './server/executor.ts';
import {
  extractSkillBody,
  parseSkillFrontmatter,
  rankSkillsForCatalog,
  selectAutoRoutedSkills,
} from './src/lib/skillRouter.ts';
import type {
  ChatAttachment,
  ChatMessage,
  Connector,
  CustomTool,
  GroundingSource,
  PromptSession,
  SkillDoc,
  StudioState,
  ToolExecutionTrace,
} from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type CloudGeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

function mapThinkingLevel(
  model: CloudGeminiModelId,
  requested: PromptSession['thinkingLevel']
): ThinkingLevel {
  if (model === 'gemini-3.1-flash-lite' && requested === 'XHIGH') {
    return ThinkingLevel.HIGH;
  }
  switch (requested) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function buildUserParts(prompt: string, attachments?: ChatAttachment[]): Part[] {
  const parts: Part[] = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.mimeType === 'video/youtube') {
        parts.push({
          fileData: {
            fileUri: att.data,
            mimeType: 'video/mp4',
          },
        });
      } else if (att.isText) {
        parts.push({
          text: `\n[Attached file: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\`\n`,
        });
      } else {
        parts.push({
          inlineData: {
            mimeType: att.mimeType || 'application/octet-stream',
            data: att.data,
          },
        });
      }
    }
  }
  if (prompt.trim()) {
    parts.push({ text: prompt });
  }
  return parts;
}

function historyToContents(messages: ChatMessage[]): Content[] {
  const validMessages = messages.filter(
    (msg) =>
      !(msg.error && !msg.text) &&
      (Boolean(msg.text?.trim()) || (msg.attachments && msg.attachments.length > 0))
  );

  // Compact very long chats (>14 messages) so multi-turn conversations stay well
  // within free-tier TPM/RPM bounds while retaining full recent context.
  const MAX_VERBATIM_RECENT = 10;
  const compactedSource: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  if (validMessages.length > 14) {
    const older = validMessages.slice(0, validMessages.length - MAX_VERBATIM_RECENT);
    const recent = validMessages.slice(validMessages.length - MAX_VERBATIM_RECENT);

    const summaryLines = older.map((m) => {
      const label = m.role === 'user' ? 'User' : 'Assistant';
      const clean = (m.text || '').replace(/\s+/g, ' ').trim();
      const snippet = clean.length > 420 ? `${clean.slice(0, 420)}…` : clean;
      const attNote =
        m.attachments && m.attachments.length > 0
          ? ` [attachments: ${m.attachments.map((a) => a.name).join(', ')}]`
          : '';
      return `- ${label}: ${snippet}${attNote}`;
    });

    compactedSource.push({
      role: 'user',
      parts: [
        {
          text: `[Earlier Conversation Summary (${older.length} earlier turns)]\n${summaryLines.join('\n')}`,
        },
      ],
    });
    compactedSource.push({
      role: 'model',
      parts: [
        {
          text: 'Understood. I have the context from our earlier conversation and will maintain continuity.',
        },
      ],
    });

    for (const msg of recent) {
      const parts =
        msg.role === 'user'
          ? buildUserParts(msg.text, msg.attachments)
          : [{ text: msg.text || ' ' }];
      if (parts.length > 0) {
        compactedSource.push({ role: msg.role, parts });
      }
    }
  } else {
    for (const msg of validMessages) {
      const parts =
        msg.role === 'user'
          ? buildUserParts(msg.text, msg.attachments)
          : [{ text: msg.text || ' ' }];
      if (parts.length > 0) {
        compactedSource.push({ role: msg.role, parts });
      }
    }
  }

  // Merge consecutive same-role turns so Gemini always receives strict user/model alternation.
  const contents: Content[] = [];
  for (const item of compactedSource) {
    const prev = contents[contents.length - 1];
    if (prev && prev.role === item.role && prev.parts) {
      prev.parts.push(...item.parts);
    } else {
      contents.push({ role: item.role, parts: [...item.parts] });
    }
  }

  // Ensure history does not end on a dangling user turn before the new user prompt is appended
  while (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents.pop();
  }

  return contents;
}

function extractCleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  let parsedMsg = raw;
  let statusCode: number | undefined;
  let apiStatus = '';

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { code?: number; message?: string; status?: string };
        message?: string;
      };
      if (parsed?.error) {
        statusCode = parsed.error.code;
        apiStatus = parsed.error.status || '';
        parsedMsg = parsed.error.message || parsedMsg;
      } else if (parsed?.message) {
        parsedMsg = parsed.message;
      }
    } catch {
      // Keep raw string
    }
  }

  if (
    statusCode === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(raw)
  ) {
    return 'Gemini API free-tier rate limit or quota reached (429 RESOURCE_EXHAUSTED). Wait a few seconds and retry, switch Thinking Level to LOW/MEDIUM, or try gemini-3.1-flash-lite.';
  }
  if (
    statusCode === 503 ||
    apiStatus === 'UNAVAILABLE' ||
    /\b503\b|UNAVAILABLE|overloaded/i.test(raw)
  ) {
    return 'Gemini model is temporarily busy (503 UNAVAILABLE). Please retry in a moment.';
  }
  if (statusCode === 401 || statusCode === 403 || /API_KEY|permission/i.test(raw)) {
    return 'Gemini API authentication error. Please verify GEMINI_API_KEY in Settings > Secrets.';
  }
  return parsedMsg.length > 360 ? `${parsedMsg.slice(0, 360)}…` : parsedMsg;
}

function isQuotaOrTransientError(err: unknown): {
  retryable: boolean;
  isRateLimit: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const isRateLimit = /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(raw);
  const isTransient = /\b503\b|\b500\b|UNAVAILABLE|INTERNAL|ECONNRESET|ETIMEDOUT|overloaded/i.test(
    raw
  );
  return { retryable: isRateLimit || isTransient, isRateLimit };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

const BUILTIN_TOOL_PATTERNS: Record<string, RegExp> = {
  evaluate_calculation:
    /\b(calc|calculate|math|formula|equation|percent|%|sum|average|total|acre|hectare|kg|liter|litre|gram|dosage|dose|ratio|yield|compound|interest|evaluate_calculation)\b|\d+\s*[*+\-/^]\s*\d+/i,
  build_comparison_matrix:
    /\b(compare|comparison|versus|vs\.?|trade-?off|pros\s+and\s+cons|matrix|difference\s+between|which\s+is\s+better|build_comparison_matrix)\b/i,
  analyze_text_and_json:
    /\b(json|payload|parse|word\s*count|line\s*count|analyze\s+text|inspect\s+text|analyze_text_and_json)\b|\{[\s\S]*:[\s\S]*\}/i,
  plan_execution_steps:
    /\b(plan|roadmap|checklist|milestones|step-?by-?step\s+plan|architect|architecture|workflow|plan_execution_steps)\b/i,
  get_live_weather:
    /\b(weather|forecast|rain|rainfall|precipitation|temperature|humidity|wind|storm|frost|climate|get_live_weather)\b/i,
  get_github_repo:
    /\b(github|repo|repository|stars|forks|open\s+issues|get_github_repo)\b/i,
  lookup_wikipedia:
    /\b(wikipedia|wiki|look\s*up|lookup|scientific\s+name|botanical|taxonomy|species|history\s+of|who\s+invented|lookup_wikipedia)\b/i,
};

function shouldIncludeToolForPrompt(
  toolName: string,
  prompt: string,
  hasAttachments: boolean
): boolean {
  if (toolName === 'analyze_text_and_json' && hasAttachments) return true;
  const pattern = BUILTIN_TOOL_PATTERNS[toolName];
  if (!pattern) {
    // Always include user-created custom tools & connectors
    return true;
  }
  return pattern.test(prompt);
}

function shouldIncludeMemoryTools(prompt: string): boolean {
  return /\b(remember|save\s+note|save\s+this|my\s+preference|keep\s+in\s+mind|note\s+that|forget|memory|studio_notes)\b/i.test(
    prompt
  );
}

function shouldIncludeSkillCatalog(prompt: string, skillsCount: number): boolean {
  if (skillsCount === 0) return false;
  return prompt.trim().length > 4;
}

const MAX_SKILLS_LIMIT = 1000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Get full studio state
  app.get('/api/studio/state', (_req: Request, res: Response) => {
    const state = loadStudioState();
    res.json(state);
  });

  // Save full studio state
  app.put('/api/studio/state', (req: Request, res: Response) => {
    const incoming = req.body as StudioState;
    if (!incoming || !Array.isArray(incoming.sessions)) {
      res.status(400).json({ error: 'Invalid studio state payload.' });
      return;
    }
    if (Array.isArray(incoming.skills) && incoming.skills.length > MAX_SKILLS_LIMIT) {
      incoming.skills = incoming.skills.slice(0, MAX_SKILLS_LIMIT);
    }
    saveStudioState(incoming);
    res.json({ ok: true });
  });

  // Add one or multiple skills directly (up to 1,000 max)
  app.post('/api/studio/skills', (req: Request, res: Response) => {
    const body = req.body as { skills?: SkillDoc[]; skill?: SkillDoc };
    const incomingList = Array.isArray(body.skills)
      ? body.skills
      : body.skill
        ? [body.skill]
        : [];
    if (incomingList.length === 0) {
      res.status(400).json({ error: 'No skills provided.' });
      return;
    }

    const state = loadStudioState();
    const remainingCapacity = MAX_SKILLS_LIMIT - state.skills.length;
    if (remainingCapacity <= 0) {
      res.status(400).json({
        error: `Maximum limit of ${MAX_SKILLS_LIMIT} skills reached.`,
        total: state.skills.length,
        limit: MAX_SKILLS_LIMIT,
      });
      return;
    }

    const existingIds = new Set(state.skills.map((s) => s.id));
    const toAdd: SkillDoc[] = [];
    for (const item of incomingList) {
      if (toAdd.length >= remainingCapacity) break;
      let id = item.id || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      while (existingIds.has(id)) {
        id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
      }
      existingIds.add(id);
      toAdd.push({
        ...item,
        id,
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }

    state.skills = [...toAdd, ...state.skills];
    saveStudioState(state);
    res.json({
      ok: true,
      added: toAdd.length,
      total: state.skills.length,
      limit: MAX_SKILLS_LIMIT,
      skills: state.skills,
    });
  });

  // Bulk import Skills.md files from an uploaded .zip archive (up to 1,000 max)
  app.post('/api/studio/skills/import-zip', (req: Request, res: Response) => {
    const { zipBase64 } = req.body as { zipBase64?: string };
    if (!zipBase64) {
      res.status(400).json({ error: 'Missing zipBase64 payload.' });
      return;
    }
    try {
      const buf = Buffer.from(zipBase64, 'base64');
      const entries = extractZipTextEntries(buf).filter(
        (e) =>
          /\.(md|markdown|txt)$/i.test(e.path) &&
          e.path.toLowerCase() !== 'skills.md' &&
          e.content.trim().length > 0
      );

      const state = loadStudioState();
      const remainingCapacity = MAX_SKILLS_LIMIT - state.skills.length;
      if (remainingCapacity <= 0) {
        res.status(400).json({
          error: `Maximum limit of ${MAX_SKILLS_LIMIT} skills reached.`,
          total: state.skills.length,
          limit: MAX_SKILLS_LIMIT,
        });
        return;
      }

      const existingIds = new Set(state.skills.map((s) => s.id));
      const addedSkills: SkillDoc[] = [];
      const ts = new Date().toISOString();

      for (const entry of entries) {
        if (addedSkills.length >= remainingCapacity) break;
        const meta = parseSkillFrontmatter(entry.content, entry.path);
        let id = `skill-zip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        while (existingIds.has(id)) {
          id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
        }
        existingIds.add(id);
        addedSkills.push({
          id,
          name: meta.name,
          filename: meta.filename,
          description: meta.description,
          tags: meta.tags,
          content: entry.content,
          updatedAt: ts,
        });
      }

      state.skills = [...addedSkills, ...state.skills];
      saveStudioState(state);
      res.json({
        ok: true,
        added: addedSkills.length,
        total: state.skills.length,
        limit: MAX_SKILLS_LIMIT,
        skills: state.skills,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to extract ZIP archive.',
      });
    }
  });

  // Return 21-skill starter pack
  app.get('/api/studio/skills/pack', (_req: Request, res: Response) => {
    res.json({ skills: getTwentyOneSkillPack() });
  });

  // Download Skills.md archive as .zip
  app.get('/api/studio/skills/export.zip', (req: Request, res: Response) => {
    const source = req.query.source === 'pack' ? 'pack' : 'library';
    const state = loadStudioState();
    const skillList = source === 'pack' ? getTwentyOneSkillPack() : state.skills;

    const entries: ZipEntry[] = [];
    const indexLines: string[] = [
      '# Skills.md Index',
      '',
      `Exported ${skillList.length} Skills.md modules from Atelier AI Studio.`,
      '',
    ];

    const usedFolders = new Set<string>();
    for (const skill of skillList) {
      let folder = skill.filename
        .replace(/\/Skills\.md$/i, '')
        .replace(/\.(skills\.)?md$/i, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      if (!folder) folder = skill.id;
      while (usedFolders.has(folder)) {
        folder = `${folder}-copy`;
      }
      usedFolders.add(folder);

      const entryPath = `${folder}/Skills.md`;
      entries.push({ path: entryPath, content: skill.content });
      indexLines.push(`- **${skill.name}** (\`${entryPath}\`) — ${skill.description}`);
    }

    entries.unshift({
      path: 'Skills.md',
      content: indexLines.join('\n') + '\n',
    });

    const zipBuffer = buildZipBuffer(entries);
    const filename =
      source === 'pack' ? 'gemini-21-skills-pack.zip' : 'atelier-skills-library.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  // Visionary Module: extract image frames from an uploaded .zip archive
  app.post('/api/studio/visionary/extract-zip', (req: Request, res: Response) => {
    const { zipBase64, maxFrames = 16 } = req.body as {
      zipBase64?: string;
      maxFrames?: number;
    };
    if (!zipBase64) {
      res.status(400).json({ error: 'Missing zipBase64 payload.' });
      return;
    }
    try {
      const buf = Buffer.from(zipBase64, 'base64');
      const imageEntries = extractZipBinaryEntries(buf)
        .filter((e) => /\.(png|jpe?g|webp|gif)$/i.test(e.path) && e.data.length > 0)
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

      if (imageEntries.length === 0) {
        res.status(400).json({ error: 'No image frames (.jpg, .png, .webp) found in ZIP archive.' });
        return;
      }

      const cap = Math.min(24, Math.max(1, Number(maxFrames) || 16));
      const sampled =
        imageEntries.length <= cap
          ? imageEntries
          : Array.from({ length: cap }, (_, i) => {
              const idx = Math.min(
                imageEntries.length - 1,
                Math.floor((i * imageEntries.length) / cap)
              );
              return imageEntries[idx];
            });

      const frames: ChatAttachment[] = sampled.map((entry, idx) => {
        const ext = entry.path.split('.').pop()?.toLowerCase() || 'jpeg';
        const mimeType =
          ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : 'image/jpeg';
        return {
          id: `zip-frame-${Date.now()}-${idx}`,
          name: entry.path.split('/').pop() || `frame_${idx + 1}.jpg`,
          mimeType,
          data: entry.data.toString('base64'),
          isText: false,
          size: entry.data.length,
        };
      });

      res.json({
        ok: true,
        totalFound: imageEntries.length,
        frames,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to extract ZIP frames.',
      });
    }
  });

  // Visionary Module: extract frames via server ffmpeg from video upload or direct video URL
  app.post('/api/studio/visionary/extract-video', async (req: Request, res: Response) => {
    const {
      videoBase64,
      videoUrl,
      filename = 'input.mp4',
      fps = 1,
      maxFrames = 12,
    } = req.body as {
      videoBase64?: string;
      videoUrl?: string;
      filename?: string;
      fps?: number;
      maxFrames?: number;
    };

    if (!videoBase64 && !videoUrl) {
      res.status(400).json({ error: 'Provide either videoBase64 or videoUrl.' });
      return;
    }

    const workDir = mkdtempSync(join(tmpdir(), 'atelier-visionary-'));
    try {
      const safeExt = filename.match(/\.(mp4|mov|webm|mkv|avi)$/i)?.[0] || '.mp4';
      const inputPath = join(workDir, `input${safeExt}`);

      if (videoBase64) {
        writeFileSync(inputPath, Buffer.from(videoBase64, 'base64'));
      } else if (videoUrl) {
        const parsedUrl = new URL(videoUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          res.status(400).json({ error: 'Only http/https video URLs are supported.' });
          return;
        }
        const dlResp = await fetch(videoUrl, { signal: AbortSignal.timeout(25000) });
        if (!dlResp.ok) {
          res.status(400).json({
            error: `Could not fetch video URL (HTTP ${dlResp.status}). Try downloading or screen-recording it on your device and uploading the video file directly.`,
          });
          return;
        }
        const ct = dlResp.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          res.status(400).json({
            error:
              'That link points to a web page instead of a direct video file (.mp4/.webm). For YouTube links, use the YouTube Video mode or screen-record the section on your iPad and drop it into Video File.',
          });
          return;
        }
        const arrBuf = await dlResp.arrayBuffer();
        if (arrBuf.byteLength > 80 * 1024 * 1024) {
          res.status(400).json({ error: 'Video URL exceeds 80 MB limit.' });
          return;
        }
        writeFileSync(inputPath, Buffer.from(arrBuf));
      }

      const safeFps = Math.min(4, Math.max(0.25, Number(fps) || 1));
      const safeMax = Math.min(24, Math.max(1, Number(maxFrames) || 12));

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          inputPath,
          '-vf',
          `fps=${safeFps},scale='min(960,iw)':-2`,
          '-frames:v',
          String(safeMax),
          '-q:v',
          '4',
          join(workDir, 'frame_%04d.jpg'),
        ],
        { timeout: 30000 }
      );

      const files = readdirSync(workDir)
        .filter((f) => /^frame_\d+\.jpg$/i.test(f))
        .sort();

      if (files.length === 0) {
        res.status(400).json({ error: 'No frames could be extracted from this video.' });
        return;
      }

      const frames: ChatAttachment[] = files.map((f, idx) => {
        const buf = readFileSync(join(workDir, f));
        return {
          id: `ffmpeg-frame-${Date.now()}-${idx}`,
          name: f,
          mimeType: 'image/jpeg',
          data: buf.toString('base64'),
          isText: false,
          size: buf.length,
        };
      });

      res.json({
        ok: true,
        frames,
        durationSec: frames.length / safeFps,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'ffmpeg frame extraction failed.',
      });
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  // Visionary Module: fetch YouTube oEmbed metadata & high-res thumbnail for Gemini multimodal analysis
  app.post('/api/studio/visionary/youtube-info', async (req: Request, res: Response) => {
    const { url } = req.body as { url?: string };
    if (!url) {
      res.status(400).json({ error: 'Missing YouTube URL.' });
      return;
    }

    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!ytMatch?.[1]) {
      res.status(400).json({ error: 'Could not recognize a valid YouTube video URL.' });
      return;
    }

    const videoId = ytMatch[1];
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      let title = `YouTube Video (${videoId})`;
      let authorName = '';
      let thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (oembedResp.ok) {
        const meta = (await oembedResp.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (meta.title) title = meta.title;
        if (meta.author_name) authorName = meta.author_name;
        if (meta.thumbnail_url) thumbUrl = meta.thumbnail_url;
      }

      let thumbnailAttachment: ChatAttachment | null = null;
      const thumbResp = await fetch(thumbUrl, { signal: AbortSignal.timeout(8000) });
      if (thumbResp.ok) {
        const buf = Buffer.from(await thumbResp.arrayBuffer());
        thumbnailAttachment = {
          id: `yt-thumb-${Date.now()}`,
          name: `youtube_${videoId}_cover.jpg`,
          mimeType: 'image/jpeg',
          data: buf.toString('base64'),
          isText: false,
          size: buf.length,
        };
      }

      res.json({
        ok: true,
        videoId,
        canonicalUrl,
        title,
        authorName,
        thumbnailAttachment,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to inspect YouTube video.',
      });
    }
  });

  // Visionary Module: bundle extracted frame images into a downloadable frames.zip
  app.post('/api/studio/visionary/pack-zip', (req: Request, res: Response) => {
    const { frames } = req.body as {
      frames?: Array<{ name: string; data: string }>;
    };
    if (!Array.isArray(frames) || frames.length === 0) {
      res.status(400).json({ error: 'No frames provided.' });
      return;
    }
    const entries: ZipEntry[] = frames.map((f, i) => ({
      path: `frames/${(f.name || `frame_${i + 1}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      content: Buffer.from(f.data, 'base64'),
    }));
    const zipBuffer = buildZipBuffer(entries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="visionary-frames.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  // Test custom tool directly
  app.post('/api/studio/tools/test', async (req: Request, res: Response) => {
    const { tool, args } = req.body as { tool: CustomTool; args: Record<string, unknown> };
    const started = Date.now();
    try {
      const state = loadStudioState();
      const result = await executeCustomTool(tool, args || {}, state);
      res.json({
        ok: true,
        result,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      });
    }
  });

  // Test HTTP connector directly
  app.post('/api/studio/connectors/test', async (req: Request, res: Response) => {
    const { connector, args } = req.body as {
      connector: Connector;
      args: Record<string, unknown>;
    };
    try {
      const result = await executeConnector(connector, args || {});
      const state = loadStudioState();
      const existing = state.connectors.find((c) => c.id === connector.id);
      if (existing) {
        existing.lastStatus = result.status;
        existing.lastTestedAt = new Date().toISOString();
        saveStudioState(state);
      }
      res.json({
        ok: result.status >= 200 && result.status < 400,
        ...result,
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      });
    }
  });

  // Delete a memory note
  app.delete('/api/studio/memories/:id', (req: Request, res: Response) => {
    const state = loadStudioState();
    state.memories = state.memories.filter((m) => m.id !== req.params.id);
    saveStudioState(state);
    res.json({ ok: true, memories: state.memories });
  });

  // Streaming prompt execution with Skills.md, Tools, Plugins, and Connectors
  app.post('/api/studio/run', async (req: Request, res: Response) => {
    const {
      sessionId,
      prompt,
      attachments,
      sessionOverride,
      replaceFromMessageId,
    } = req.body as {
      sessionId: string;
      prompt: string;
      attachments?: ChatAttachment[];
      sessionOverride?: Partial<PromptSession>;
      replaceFromMessageId?: string;
    };

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured in the server environment. Please check Settings > Secrets.',
      });
      return;
    }

    res.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 8000);

    try {
      const state = loadStudioState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        sendEvent('error', { message: 'Session not found.' });
        res.end();
        return;
      }

      if (sessionOverride) {
        Object.assign(session, sessionOverride);
      }

      // Support re-running or editing from a specific user message
      if (replaceFromMessageId) {
        const idx = session.messages.findIndex((m) => m.id === replaceFromMessageId);
        if (idx !== -1) {
          session.messages = session.messages.slice(0, idx);
        }
      }

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-u`,
        role: 'user',
        text: prompt,
        attachments,
        createdAt: new Date().toISOString(),
      };

      const priorHistory = historyToContents(session.messages);
      const userParts = buildUserParts(prompt, attachments);
      const contents: Content[] = [
        ...priorHistory,
        { role: 'user', parts: userParts },
      ];

      // Resolve mounted plugins (including custom_bundle packs)
      const activePlugins = state.plugins.filter((p) => session.activePluginIds.includes(p.id));
      const skillIds = new Set(session.activeSkillIds);
      const toolIds = new Set(session.activeToolIds);
      const connectorIds = new Set(session.activeConnectorIds);

      for (const plugin of activePlugins) {
        if (plugin.kind === 'custom_bundle') {
          plugin.bundledSkillIds?.forEach((id) => skillIds.add(id));
          plugin.bundledToolIds?.forEach((id) => toolIds.add(id));
          plugin.bundledConnectorIds?.forEach((id) => connectorIds.add(id));
        }
      }

      // 1. Assemble System Instructions + mounted Skills.md + Auto-Routed Skills + Personal Memory + Lean Catalog
      const activeSkills = state.skills.filter((s) => skillIds.has(s.id));
      const hasSkillRouter = activePlugins.some((p) => p.kind === 'skill_router');
      const hasGoogleSearch = activePlugins.some((p) => p.kind === 'google_search');
      const hasUrlContext = activePlugins.some((p) => p.kind === 'url_context');
      const hasStudioMemory = activePlugins.some((p) => p.kind === 'studio_memory');
      const hasAttach = Boolean(attachments && attachments.length > 0);

      const autoMatchedSkills = hasSkillRouter
        ? selectAutoRoutedSkills(prompt, state.skills, skillIds, 2)
        : [];
      const autoMatchedIds = new Set(autoMatchedSkills.map((s) => s.id));

      const systemSections: string[] = [];
      if (session.systemInstruction.trim()) {
        systemSections.push(session.systemInstruction.trim());
      }
      if (hasStudioMemory && state.memories.length > 0) {
        const memLines = state.memories
          .slice(0, 8)
          .map((m) => `- ${m.key}: ${m.content}`)
          .join('\n');
        systemSections.push(`<!-- Personal Studio Memory -->\n${memLines}`);
      }
      for (const skill of [...activeSkills, ...autoMatchedSkills]) {
        const body = extractSkillBody(skill.content) || skill.content.trim();
        const clippedBody =
          body.length > 12000
            ? `${body.slice(0, 12000)}\n\n...[truncated for token efficiency]`
            : body;
        systemSections.push(
          `<!-- Skill: ${skill.filename} (${skill.name}) -->\n${clippedBody}`
        );
      }
      const includeCatalog =
        hasSkillRouter && shouldIncludeSkillCatalog(prompt, state.skills.length);
      if (includeCatalog) {
        const unmountedSkills = state.skills.filter(
          (s) => !skillIds.has(s.id) && !autoMatchedIds.has(s.id)
        );
        if (unmountedSkills.length > 0) {
          const prioritized = rankSkillsForCatalog(prompt, unmountedSkills, 25);
          const catalog = prioritized
            .map((s) => s.filename.replace(/\/Skills\.md$/i, ''))
            .join(', ');
          const extraNote =
            unmountedSkills.length > 25 ? ` (+${unmountedSkills.length - 25} more in library)` : '';
          systemSections.push(
            `<!-- Studio Skills Catalog -->\nOptional Skills.md modules via load_studio_skill(skill_name): ${catalog}${extraNote}`
          );
        }
      }
      const combinedSystemInstruction = systemSections.join('\n\n---\n\n');

      // 2. Assemble FunctionDeclarations on-demand to keep token usage lean and preserve free-tier quota
      const activeTools = state.tools.filter((t) => toolIds.has(t.id));
      const activeConnectors = state.connectors.filter((c) => connectorIds.has(c.id));

      const functionDeclarations: FunctionDeclaration[] = [];
      const toolLookup = new Map<
        string,
        | { kind: 'custom_tool'; tool: CustomTool }
        | { kind: 'connector'; connector: Connector }
        | { kind: 'memory' }
        | { kind: 'skill_router' }
      >();

      for (const tool of activeTools) {
        if (!shouldIncludeToolForPrompt(tool.name, prompt, hasAttach)) continue;
        functionDeclarations.push(
          buildFunctionDeclaration(tool.name, tool.description, tool.parameters)
        );
        toolLookup.set(tool.name, { kind: 'custom_tool', tool });
      }

      for (const conn of activeConnectors) {
        if (!shouldIncludeToolForPrompt(conn.toolName, prompt, hasAttach)) continue;
        functionDeclarations.push(
          buildFunctionDeclaration(conn.toolName, conn.description, conn.parameters)
        );
        toolLookup.set(conn.toolName, { kind: 'connector', connector: conn });
      }

      if (hasStudioMemory && shouldIncludeMemoryTools(prompt)) {
        for (const decl of STUDIO_MEMORY_DECLARATIONS) {
          functionDeclarations.push(decl);
          if (decl.name) {
            toolLookup.set(decl.name, { kind: 'memory' });
          }
        }
      }

      if (includeCatalog) {
        for (const decl of SKILL_ROUTER_DECLARATIONS) {
          functionDeclarations.push(decl);
          if (decl.name) {
            toolLookup.set(decl.name, { kind: 'skill_router' });
          }
        }
      }

      const geminiTools: Tool[] = [];
      if (hasGoogleSearch) {
        geminiTools.push({ googleSearch: {} });
      }
      if (hasUrlContext) {
        geminiTools.push({ urlContext: {} });
      }
      if (functionDeclarations.length > 0) {
        geminiTools.push({ functionDeclarations });
      }

      const hasBuiltInTools = hasGoogleSearch || hasUrlContext;
      const hasCustomFunctions = functionDeclarations.length > 0;

      const cloudModel: CloudGeminiModelId =
        session.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      const config: GenerateContentConfig = {
        thinkingConfig: {
          thinkingLevel: mapThinkingLevel(cloudModel, session.thinkingLevel),
          includeThoughts: true,
        },
      };

      if (combinedSystemInstruction) {
        config.systemInstruction = combinedSystemInstruction;
      }

      if (geminiTools.length > 0) {
        config.tools = geminiTools;
      }

      if (hasBuiltInTools && hasCustomFunctions) {
        config.toolConfig = {
          includeServerSideToolInvocations: true,
        };
      }

      if (session.responseFormat === 'json' && !hasBuiltInTools) {
        config.responseMimeType = 'application/json';
        if (session.responseSchemaJson.trim()) {
          try {
            config.responseSchema = JSON.parse(session.responseSchemaJson);
          } catch {
            // Fall back to plain JSON mime type if user schema draft isn't valid JSON
          }
        }
      }

      const ai = getGeminiClient();
      const startedAt = Date.now();
      let activeModel: CloudGeminiModelId = cloudModel;
      let fullText = '';
      let fullThoughts = '';
      const allToolTraces: ToolExecutionTrace[] = [];
      const groundingMap = new Map<string, GroundingSource>();
      let promptTokens = 0;
      let candidatesTokens = 0;
      let thoughtsTokens = 0;
      let totalTokens = 0;
      let fallbackEmitted = false;
      let builtInToolsDisabled = false;

      for (const skill of autoMatchedSkills) {
        const skillTrace: ToolExecutionTrace = {
          id: `trace-skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName: `auto_skill: ${skill.filename}`,
          source: 'skill_router',
          args: { skillName: skill.name, mode: 'auto-matched' },
          result: { applied: true, description: skill.description },
          durationMs: 0,
        };
        allToolTraces.push(skillTrace);
        sendEvent('tool_trace', skillTrace);
      }

      const makeConfig = (m: CloudGeminiModelId): GenerateContentConfig => {
        const activeToolList: Tool[] = [];
        if (!builtInToolsDisabled) {
          if (hasGoogleSearch) activeToolList.push({ googleSearch: {} });
          if (hasUrlContext) activeToolList.push({ urlContext: {} });
        }
        if (functionDeclarations.length > 0) {
          activeToolList.push({ functionDeclarations });
        }
        const nextConfig: GenerateContentConfig = {
          ...config,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(m, session.thinkingLevel),
            includeThoughts: true,
          },
        };
        if (activeToolList.length > 0) {
          nextConfig.tools = activeToolList;
        } else {
          delete nextConfig.tools;
        }
        if (!builtInToolsDisabled && hasBuiltInTools && hasCustomFunctions) {
          nextConfig.toolConfig = { includeServerSideToolInvocations: true };
        } else {
          delete nextConfig.toolConfig;
        }
        return nextConfig;
      };

      const openStreamWithFallback = async () => {
        try {
          return await ai.models.generateContentStream({
            model: activeModel,
            contents,
            config: makeConfig(activeModel),
          });
        } catch (firstErr) {
          const rawFirst = firstErr instanceof Error ? firstErr.message : String(firstErr);
          // If YouTube fileUri was rejected by the Gemini endpoint, strip video fileData and retry with attached thumbnail/URL context
          const hasFileData = contents.some((c) => c.parts?.some((p) => Boolean(p.fileData)));
          if (hasFileData && /400|INVALID_ARGUMENT|fileData|fileUri|unsupported|video/i.test(rawFirst)) {
            for (const c of contents) {
              if (c.parts) {
                c.parts = c.parts.map((p) =>
                  p.fileData
                    ? { text: `[YouTube URL reference: ${p.fileData.fileUri}]` }
                    : p
                );
              }
            }
            return await ai.models.generateContentStream({
              model: activeModel,
              contents,
              config: makeConfig(activeModel),
            });
          }

          const check = isQuotaOrTransientError(firstErr);
          if (!check.retryable) throw firstErr;

          // If search/url grounding triggered 429, drop built-in search/url first while keeping Skills/Tools/Connectors
          if (check.isRateLimit && hasBuiltInTools && !builtInToolsDisabled) {
            builtInToolsDisabled = true;
            sendEvent('model_fallback', {
              from: activeModel,
              to: activeModel,
              reason:
                'Built-in Search/URL grounding quota reached; automatically continued with mounted Skills, Tools & Connectors.',
            });
            try {
              return await ai.models.generateContentStream({
                model: activeModel,
                contents,
                config: makeConfig(activeModel),
              });
            } catch (afterStripErr) {
              const stripCheck = isQuotaOrTransientError(afterStripErr);
              if (stripCheck.isRateLimit && activeModel === 'gemini-4-hydrogen') {
                activeModel = 'gemini-3.1-flash-lite';
                if (!fallbackEmitted) {
                  fallbackEmitted = true;
                  sendEvent('model_fallback', {
                    from: 'gemini-4-hydrogen',
                    to: 'gemini-3.1-flash-lite',
                    reason:
                      'gemini-4-hydrogen hit Google’s temporary free-tier speed limit, so I seamlessly finished this reply with gemini-3.1-flash-lite. Your next message will try gemini-4-hydrogen again.',
                  });
                }
                return await ai.models.generateContentStream({
                  model: activeModel,
                  contents,
                  config: makeConfig(activeModel),
                });
              }
              throw afterStripErr;
            }
          }

          // Brief backoff before retrying once on the primary model
          await sleep(2500);
          try {
            return await ai.models.generateContentStream({
              model: activeModel,
              contents,
              config: makeConfig(activeModel),
            });
          } catch (secondErr) {
            const secondCheck = isQuotaOrTransientError(secondErr);
            if (secondCheck.isRateLimit && activeModel === 'gemini-4-hydrogen') {
              activeModel = 'gemini-3.1-flash-lite';
              if (!fallbackEmitted) {
                fallbackEmitted = true;
                sendEvent('model_fallback', {
                  from: 'gemini-4-hydrogen',
                  to: 'gemini-3.1-flash-lite',
                  reason:
                    'gemini-4-hydrogen hit Google’s temporary free-tier speed limit, so I seamlessly finished this reply with gemini-3.1-flash-lite. Your next message will try gemini-4-hydrogen again.',
                });
              }
              return await ai.models.generateContentStream({
                model: activeModel,
                contents,
                config: makeConfig(activeModel),
              });
            }
            throw secondErr;
          }
        }
      };

      const MAX_ROUNDS = 8;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        let roundOrderedParts: Part[] = [];
        let roundFunctionCalls: Array<{
          id?: string;
          name: string;
          args: Record<string, unknown>;
        }> = [];

        const consumeRoundStream = async (
          stream: AsyncIterable<Awaited<ReturnType<typeof ai.models.generateContentStream>> extends AsyncIterable<infer T> ? T : never>
        ) => {
          roundOrderedParts = [];
          roundFunctionCalls = [];

          const pushOrderedPart = (part: Part) => {
            if (part.text && !part.thoughtSignature && !part.functionCall) {
              const prev = roundOrderedParts[roundOrderedParts.length - 1];
              if (
                prev &&
                prev.text !== undefined &&
                Boolean(prev.thought) === Boolean(part.thought) &&
                !prev.thoughtSignature &&
                !prev.functionCall
              ) {
                prev.text += part.text;
                return;
              }
              roundOrderedParts.push({
                ...(part.thought ? { thought: true } : {}),
                text: part.text,
              });
              return;
            }
            roundOrderedParts.push(part);
          };

          for await (const chunk of stream) {
            const candidate = chunk.candidates?.[0];
            const parts = candidate?.content?.parts || [];

            for (const part of parts) {
              if (part.thought && part.text) {
                fullThoughts += part.text;
                sendEvent('thought_delta', { text: part.text });
                pushOrderedPart(part);
              } else if (part.text) {
                fullText += part.text;
                sendEvent('text_delta', { text: part.text });
                pushOrderedPart(part);
              } else if (part.functionCall) {
                pushOrderedPart(part);
                if (part.functionCall.name) {
                  roundFunctionCalls.push({
                    id: part.functionCall.id,
                    name: part.functionCall.name,
                    args: (part.functionCall.args || {}) as Record<string, unknown>,
                  });
                }
              } else {
                // Preserve server-side toolCall/toolResponse/other parts intact
                pushOrderedPart(part);
              }
            }

            const gChunks = candidate?.groundingMetadata?.groundingChunks;
            if (gChunks && Array.isArray(gChunks)) {
              for (const gc of gChunks) {
                if (gc.web?.uri) {
                  groundingMap.set(gc.web.uri, {
                    uri: gc.web.uri,
                    title: gc.web.title || gc.web.uri,
                  });
                }
              }
              if (groundingMap.size > 0) {
                sendEvent('grounding', {
                  sources: Array.from(groundingMap.values()),
                });
              }
            }

            if (chunk.usageMetadata) {
              promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
              candidatesTokens = chunk.usageMetadata.candidatesTokenCount ?? candidatesTokens;
              thoughtsTokens = chunk.usageMetadata.thoughtsTokenCount ?? thoughtsTokens;
              totalTokens = chunk.usageMetadata.totalTokenCount ?? totalTokens;
            }
          }
        };

        const stream = await openStreamWithFallback();
        try {
          await consumeRoundStream(stream);
        } catch (streamErr) {
          const check = isQuotaOrTransientError(streamErr);
          // If the stream failed mid-flight before emitting anything in this round, fallback/retry cleanly
          if (
            check.retryable &&
            roundOrderedParts.length === 0 &&
            roundFunctionCalls.length === 0 &&
            activeModel === 'gemini-4-hydrogen' &&
            check.isRateLimit
          ) {
            activeModel = 'gemini-3.1-flash-lite';
            if (!fallbackEmitted) {
              fallbackEmitted = true;
              sendEvent('model_fallback', {
                from: 'gemini-4-hydrogen',
                to: 'gemini-3.1-flash-lite',
                reason:
                  'Free-tier rate limit reached mid-stream; automatically continued with gemini-3.1-flash-lite.',
              });
            }
            const retryStream = await openStreamWithFallback();
            await consumeRoundStream(retryStream);
          } else {
            throw streamErr;
          }
        }

        // If the model didn't ask for any custom function calls, we are finished
        if (roundFunctionCalls.length === 0) {
          break;
        }

        contents.push({
          role: 'model',
          parts: roundOrderedParts,
        });

        // Execute each requested tool/connector/memory function
        const functionResponseParts: Part[] = [];
        for (const call of roundFunctionCalls) {
          const callStart = Date.now();
          const entry = toolLookup.get(call.name);
          let trace: ToolExecutionTrace;

          try {
            if (!entry) {
              throw new Error(`Tool "${call.name}" is not mounted in this session.`);
            }

            if (entry.kind === 'skill_router') {
              const skillRes = executeSkillRouterTool(call.args, state);
              trace = {
                id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                toolName: call.name,
                source: 'skill_router',
                args: call.args,
                result: skillRes,
                durationMs: Date.now() - callStart,
              };
            } else if (entry.kind === 'memory') {
              const { result, mutated } = executeStudioMemoryTool(call.name, call.args, state);
              if (mutated) {
                saveStudioState(state);
                sendEvent('memories_updated', { memories: state.memories });
              }
              trace = {
                id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                toolName: call.name,
                source: 'plugin_memory',
                args: call.args,
                result,
                durationMs: Date.now() - callStart,
              };
            } else if (entry.kind === 'connector') {
              const connRes = await executeConnector(entry.connector, call.args);
              trace = {
                id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                toolName: call.name,
                source: 'connector',
                args: call.args,
                result: { status: connRes.status, data: connRes.data },
                durationMs: connRes.durationMs,
              };
            } else {
              const toolRes = await executeCustomTool(entry.tool, call.args, state);
              trace = {
                id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                toolName: call.name,
                source: 'custom_tool',
                args: call.args,
                result: toolRes,
                durationMs: Date.now() - callStart,
              };
            }
          } catch (toolErr) {
            trace = {
              id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              toolName: call.name,
              source:
                entry?.kind === 'connector'
                  ? 'connector'
                  : entry?.kind === 'memory'
                    ? 'plugin_memory'
                    : entry?.kind === 'skill_router'
                      ? 'skill_router'
                      : 'custom_tool',
              args: call.args,
              error: toolErr instanceof Error ? toolErr.message : String(toolErr),
              durationMs: Date.now() - callStart,
            };
          }

          allToolTraces.push(trace);
          sendEvent('tool_trace', trace);

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: trace.error
                ? { error: trace.error }
                : typeof trace.result === 'object' && trace.result !== null && !Array.isArray(trace.result)
                  ? (trace.result as Record<string, unknown>)
                  : { result: trace.result },
            },
          });
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      }

      const latencyMs = Date.now() - startedAt;
      const usage = {
        promptTokens,
        candidatesTokens,
        thoughtsTokens: thoughtsTokens || undefined,
        totalTokens,
        latencyMs,
      };
      sendEvent('usage', usage);

      const groundingSources = Array.from(groundingMap.values());
      const modelMessage: ChatMessage = {
        id: `msg-${Date.now()}-m`,
        role: 'model',
        text: fullText,
        thoughts: fullThoughts || undefined,
        toolTraces: allToolTraces.length > 0 ? allToolTraces : undefined,
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
        tokenUsage: usage,
        createdAt: new Date().toISOString(),
      };

      // Update title if first message in session
      if (session.messages.length === 0 && prompt.trim()) {
        session.title = prompt.trim().slice(0, 44) + (prompt.trim().length > 44 ? '…' : '');
      }
      session.messages.push(userMessage, modelMessage);
      session.updatedAt = new Date().toISOString();
      saveStudioState(state);

      sendEvent('done', {
        sessionTitle: session.title,
        userMessage,
        modelMessage,
        modelUsed: activeModel,
      });
      res.end();
    } catch (err) {
      console.error('Error in /api/studio/run:', err);
      sendEvent('error', { message: extractCleanErrorMessage(err) });
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  });

  // Text-to-Speech endpoint for natural spoken replies
  app.post('/api/studio/tts', async (req: Request, res: Response) => {
    const { text, voiceName } = req.body as { text: string; voiceName?: string };
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      return;
    }
    const cleanText = String(text || '')
      .replace(/```[\s\S]*?```/g, ' (code snippet omitted) ')
      .replace(/[#*_`>]/g, '')
      .trim()
      .slice(0, 3000);
    if (!cleanText) {
      res.status(400).json({ error: 'No speakable text provided.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: 'Warm, articulate, natural human conversational voice',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || 'Zephyr' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'TTS model returned no audio.' });
        return;
      }
      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Audio transcription endpoint for voice dictation
  app.post('/api/studio/transcribe', async (req: Request, res: Response) => {
    const { audioBase64, mimeType } = req.body as {
      audioBase64: string;
      mimeType?: string;
    };
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      return;
    }
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audioBase64,
              },
            },
            { text: 'Transcribe the spoken speech accurately into plain text.' },
          ],
        },
      });
      res.json({ text: (response.text || '').trim() });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Serve Vite dev middleware or built production assets
  const distDir = resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('/{*path}', (_req: Request, res: Response) => {
      res.sendFile(resolve(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = createServer(app);
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 65000;
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/studio/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const sessionId = url.searchParams.get('sessionId') || '';

    if (!process.env.GEMINI_API_KEY) {
      clientWs.send(JSON.stringify({ error: 'GEMINI_API_KEY is not configured.' }));
      clientWs.close();
      return;
    }

    const state = loadStudioState();
    const session =
      state.sessions.find((s) => s.id === sessionId) || state.sessions[0];

    const activePlugins = state.plugins.filter((p) =>
      session.activePluginIds.includes(p.id)
    );
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
    const hasSkillRouter = activePlugins.some((p) => p.kind === 'skill_router');
    const hasStudioMemory = activePlugins.some((p) => p.kind === 'studio_memory');
    const sysParts: string[] = [];
    if (session.systemInstruction.trim()) sysParts.push(session.systemInstruction.trim());
    for (const sk of activeSkills) {
      sysParts.push(`<!-- Skill: ${sk.filename} -->\n${sk.content.trim()}`);
    }
    sysParts.push(
      'You are in a real-time human voice conversation. Speak naturally, concisely, and warmly.'
    );
    if (hasSkillRouter) {
      const catalog = state.skills
        .filter((s) => !skillIds.has(s.id))
        .map((s) => `- ${s.filename}: ${s.description}`)
        .join('\n');
      if (catalog) {
        sysParts.push(`Available Skills.md modules via load_studio_skill:\n${catalog}`);
      }
    }

    const liveDecls: FunctionDeclaration[] = [];
    const liveLookup = new Map<
      string,
      | { kind: 'custom_tool'; tool: CustomTool }
      | { kind: 'connector'; connector: Connector }
      | { kind: 'memory' }
      | { kind: 'skill_router' }
    >();

    for (const t of state.tools.filter((x) => toolIds.has(x.id))) {
      const d = buildFunctionDeclaration(t.name, t.description, t.parameters);
      d.behavior = Behavior.NON_BLOCKING;
      liveDecls.push(d);
      liveLookup.set(t.name, { kind: 'custom_tool', tool: t });
    }
    for (const c of state.connectors.filter((x) => connectorIds.has(x.id))) {
      const d = buildFunctionDeclaration(c.toolName, c.description, c.parameters);
      d.behavior = Behavior.NON_BLOCKING;
      liveDecls.push(d);
      liveLookup.set(c.toolName, { kind: 'connector', connector: c });
    }
    if (hasStudioMemory) {
      for (const d of STUDIO_MEMORY_DECLARATIONS) {
        liveDecls.push({ ...d, behavior: Behavior.NON_BLOCKING });
        if (d.name) liveLookup.set(d.name, { kind: 'memory' });
      }
    }
    if (hasSkillRouter) {
      for (const d of SKILL_ROUTER_DECLARATIONS) {
        liveDecls.push({ ...d, behavior: Behavior.NON_BLOCKING });
        if (d.name) liveLookup.set(d.name, { kind: 'skill_router' });
      }
    }

    try {
      const ai = getGeminiClient();
      const liveSession = await ai.live.connect({
        model: 'gemini-3.8-live-extended-thinking',
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: session.voiceName || 'Zephyr' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: liveDecls.length > 0 ? [{ functionDeclarations: liveDecls }] : undefined,
          systemInstruction: sysParts.join('\n\n'),
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            if (clientWs.readyState !== 1) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.interactionStatus) {
              clientWs.send(
                JSON.stringify({ interactionStatus: content.interactionStatus })
              );
            }

            const calls = message.toolCall?.functionCalls ?? [];
            for (const call of calls) {
              const name = call.name || '';
              const args = (call.args || {}) as Record<string, unknown>;
              const entry = liveLookup.get(name);
              let result: unknown = { error: 'Tool not found' };
              try {
                if (entry?.kind === 'skill_router') {
                  result = executeSkillRouterTool(args, state);
                } else if (entry?.kind === 'memory') {
                  const res = executeStudioMemoryTool(name, args, state);
                  result = res.result;
                  if (res.mutated) saveStudioState(state);
                } else if (entry?.kind === 'connector') {
                  const res = await executeConnector(entry.connector, args);
                  result = { status: res.status, data: res.data };
                } else if (entry?.kind === 'custom_tool') {
                  result = await executeCustomTool(entry.tool, args, state);
                }
              } catch (e) {
                result = { error: e instanceof Error ? e.message : String(e) };
              }

              clientWs.send(JSON.stringify({ toolUsed: name, args, result }));

              liveSession.sendToolResponse({
                functionResponses: [
                  {
                    id: call.id,
                    name,
                    response:
                      typeof result === 'object' &&
                      result !== null &&
                      !Array.isArray(result)
                        ? (result as Record<string, unknown>)
                        : { result },
                    scheduling: FunctionResponseScheduling.WHEN_IDLE,
                  },
                ],
              });
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === 1) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Live session error',
                })
              );
            }
          },
        },
      });

      clientWs.send(JSON.stringify({ ready: true }));

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            audio?: string;
            text?: string;
          };
          if (parsed.audio) {
            liveSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text) {
            liveSession.sendRealtimeInput({ text: parsed.text });
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      clientWs.on('close', () => {
        try {
          liveSession.close();
        } catch {
          // Ignore close errors
        }
      });
    } catch (err) {
      if (clientWs.readyState === 1) {
        clientWs.send(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          })
        );
        clientWs.close();
      }
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier AI Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
