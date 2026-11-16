import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { SkillDoc } from '../src/types.ts';
import { parseSkillFrontmatter } from '../src/lib/skillRouter.ts';

const SKILL_ROOTS = ['Skills', 'docs'];

function listSkillFiles(root: string): string[] {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...listSkillFiles(fullPath));
    } else if (/^\d+_.+_SKILL\.md$/i.test(entry.name)) {
      found.push(fullPath);
    }
  }
  return found;
}

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
}

/**
 * Loads the 81 numbered Claude-exported skill documents shipped with Atelier.
 * They remain catalog entries and are selected on demand by the existing skill router.
 */
export function getClaudeSkillPack(): SkillDoc[] {
  const cwd = process.cwd();
  const files = SKILL_ROOTS.flatMap((root) => listSkillFiles(resolve(cwd, root))).sort();
  const seen = new Map<string, number>();

  return files.map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = relative(cwd, filePath).replace(/\\/g, '/');
    const meta = parseSkillFrontmatter(content, relativePath);
    const baseSlug = toSlug(meta.name);
    const occurrence = (seen.get(baseSlug) ?? 0) + 1;
    seen.set(baseSlug, occurrence);
    const uniqueSlug = occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`;

    return {
      id: `claude-${uniqueSlug}`,
      name: meta.name,
      filename: relativePath,
      description: meta.description,
      tags: meta.tags.length ? meta.tags : ['Claude Skills'],
      content,
      updatedAt: new Date().toISOString(),
    };
  });
}
