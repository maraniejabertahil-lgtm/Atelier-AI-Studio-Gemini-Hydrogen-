import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Type, type FunctionDeclaration } from '@google/genai';

const WORKSPACE_ROOT = resolve(process.cwd(), 'data', 'athena-workspace');
const MAX_FILE_BYTES = 256 * 1024;
const MAX_RESULTS = 100;
const MAX_SCAN_FILES = 1000;

export const ATHENA_WORKSPACE_DECLARATIONS: FunctionDeclaration[] = [
  { name: 'Read', description: 'Read a UTF-8 text file from this session’s private Athena workspace. Paths are relative to that workspace.', parameters: { type: Type.OBJECT, properties: { file_path: { type: Type.STRING } }, required: ['file_path'] } },
  { name: 'Write', description: 'Create or replace a UTF-8 text file in this session’s private Athena workspace. Parent directories are created as needed. Maximum file size is 256 KB.', parameters: { type: Type.OBJECT, properties: { file_path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ['file_path', 'content'] } },
  { name: 'Edit', description: 'Replace one exact occurrence of old_string with new_string in a UTF-8 text file in this session’s private Athena workspace.', parameters: { type: Type.OBJECT, properties: { file_path: { type: Type.STRING }, old_string: { type: Type.STRING }, new_string: { type: Type.STRING } }, required: ['file_path', 'old_string', 'new_string'] } },
  { name: 'Glob', description: 'Find files in this session’s private Athena workspace matching a glob pattern such as **/*.ts or src/*.tsx. Returns at most 100 paths.', parameters: { type: Type.OBJECT, properties: { pattern: { type: Type.STRING } }, required: ['pattern'] } },
  { name: 'Grep', description: 'Search UTF-8 text files in this session’s private Athena workspace. Literal search is the default; set is_regex true for a regular expression. Returns at most 100 matches.', parameters: { type: Type.OBJECT, properties: { pattern: { type: Type.STRING }, path: { type: Type.STRING }, is_regex: { type: Type.BOOLEAN } }, required: ['pattern'] } },
];

export function getAthenaWorkspaceRoot(sessionId: string): string {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('A valid Atelier session ID is required for workspace access.');
  const key = createHash('sha256').update(sessionId).digest('hex');
  return resolve(WORKSPACE_ROOT, key);
}

function ensureRoot(sessionId: string): string {
  const root = getAthenaWorkspaceRoot(sessionId);
  mkdirSync(root, { recursive: true });
  return root;
}

function resolveWorkspacePath(input: unknown, sessionId: string, allowRoot = false): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error('A non-empty workspace-relative file_path is required.');
  if (input.includes('\0') || isAbsolute(input)) throw new Error('Absolute paths and NUL bytes are not allowed.');
  const root = ensureRoot(sessionId);
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path escapes the isolated Athena workspace.');
  if (!allowRoot && rel === '') throw new Error('The workspace root is not a file path.');
  let current = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not allowed in the Athena workspace.');
  }
  return target;
}

function ensureParentDirectories(target: string, sessionId: string): void {
  const root = ensureRoot(sessionId);
  const parent = dirname(target);
  const rel = relative(root, parent);
  let current = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (existsSync(current)) {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Workspace parent path is not a safe directory.');
    } else mkdirSync(current);
  }
}

function collectFiles(sessionId: string, startPath = '.'): string[] {
  const start = resolveWorkspacePath(startPath, sessionId, true);
  if (!existsSync(start)) return [];
  if (lstatSync(start).isSymbolicLink()) throw new Error('Symbolic links are not allowed in the Athena workspace.');
  const root = ensureRoot(sessionId);
  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 8 || found.length >= MAX_SCAN_FILES) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.isFile()) found.push(relative(root, full).split(sep).join('/'));
      if (found.length >= MAX_SCAN_FILES) return;
    }
  };
  if (statSync(start).isFile()) return [relative(root, start).split(sep).join('/')];
  visit(start, 0);
  return found;
}

function globRegex(pattern: string): RegExp {
  if (!pattern || pattern.length > 300 || pattern.includes('\\')) throw new Error('Provide a valid workspace glob pattern (maximum 300 characters).');
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
    } else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

export function executeAthenaWorkspaceTool(name: string, args: Record<string, unknown>, sessionId: string): unknown {
  if (name === 'Read') {
    const target = resolveWorkspacePath(args.file_path, sessionId);
    if (!existsSync(target) || !lstatSync(target).isFile()) throw new Error('File not found in the Athena workspace.');
    const info = statSync(target);
    if (info.size > MAX_FILE_BYTES) throw new Error('File exceeds the 256 KB read limit.');
    const content = readFileSync(target, 'utf8');
    if (content.includes('\0')) throw new Error('Binary files are not supported by the workspace Read tool.');
    return { file_path: String(args.file_path), content: content.slice(0, 30000), truncated: content.length > 30000, bytes: info.size };
  }
  if (name === 'Write') {
    const target = resolveWorkspacePath(args.file_path, sessionId);
    const content = String(args.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new Error('File exceeds the 256 KB write limit.');
    ensureParentDirectories(target, sessionId);
    if (existsSync(target) && !lstatSync(target).isFile()) throw new Error('Write target must be a regular file.');
    writeFileSync(target, content, { encoding: 'utf8', flag: 'w' });
    return { written: true, file_path: String(args.file_path), bytes: Buffer.byteLength(content, 'utf8') };
  }
  if (name === 'Edit') {
    const target = resolveWorkspacePath(args.file_path, sessionId);
    if (!existsSync(target) || !lstatSync(target).isFile()) throw new Error('File not found in the Athena workspace.');
    if (statSync(target).size > MAX_FILE_BYTES) throw new Error('File exceeds the 256 KB edit limit.');
    const original = readFileSync(target, 'utf8');
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');
    if (!oldString) throw new Error('old_string must not be empty.');
    const first = original.indexOf(oldString);
    if (first < 0) throw new Error('old_string was not found; file was not changed.');
    if (original.indexOf(oldString, first + oldString.length) >= 0) throw new Error('old_string occurs more than once; provide a more specific match.');
    const updated = original.slice(0, first) + newString + original.slice(first + oldString.length);
    if (Buffer.byteLength(updated, 'utf8') > MAX_FILE_BYTES) throw new Error('Edited file would exceed the 256 KB limit.');
    writeFileSync(target, updated, 'utf8');
    return { edited: true, file_path: String(args.file_path) };
  }
  if (name === 'Glob') {
    const matcher = globRegex(String(args.pattern ?? ''));
    const files = collectFiles(sessionId).filter((file) => matcher.test(file));
    return { files: files.slice(0, MAX_RESULTS), truncated: files.length > MAX_RESULTS };
  }
  if (name === 'Grep') {
    const pattern = String(args.pattern ?? '');
    if (!pattern || pattern.length > 500) throw new Error('Provide a search pattern (maximum 500 characters).');
    let matcher: RegExp | null = null;
    if (args.is_regex === true) {
      try { matcher = new RegExp(pattern); } catch { throw new Error('Invalid regular expression.'); }
    }
    const start = typeof args.path === 'string' && args.path.trim() ? args.path : '.';
    const files = collectFiles(sessionId, start);
    const matches: Array<{ file_path: string; line: number; text: string }> = [];
    for (const file of files) {
      if (matches.length >= MAX_RESULTS) break;
      const target = resolveWorkspacePath(file, sessionId);
      if (statSync(target).size > MAX_FILE_BYTES) continue;
      const content = readFileSync(target, 'utf8');
      if (content.includes('\0')) continue;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < MAX_RESULTS; i++) {
        const hit = matcher ? matcher.test(lines[i]) : lines[i].includes(pattern);
        if (hit) matches.push({ file_path: file, line: i + 1, text: lines[i].slice(0, 500) });
      }
    }
    return { matches, truncated: matches.length >= MAX_RESULTS || files.length >= MAX_SCAN_FILES };
  }
  throw new Error(`Unknown Athena workspace tool: ${name}`);
}
