import type { SkillDoc } from '../types';

const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'also', 'always', 'among',
  'and', 'any', 'are', 'around', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'can', 'could', 'data', 'does', 'doing', 'done',
  'each', 'even', 'every', 'file', 'files', 'for', 'from', 'general', 'give',
  'good', 'guide', 'have', 'help', 'here', 'how', 'import', 'imported', 'include',
  'info', 'information', 'instructions', 'into', 'just', 'keep', 'know', 'like',
  'make', 'many', 'may', 'more', 'most', 'must', 'name', 'need', 'new', 'not',
  'now', 'only', 'other', 'our', 'out', 'over', 'part', 'please', 'primary',
  'prompt', 'provide', 'put', 'read', 'really', 'rule', 'rules', 'same', 'say',
  'see', 'set', 'should', 'show', 'skill', 'skills', 'some', 'specific', 'step',
  'steps', 'such', 'sure', 'take', 'tell', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'time',
  'tool', 'tools', 'triggers', 'trigger', 'under', 'until', 'use', 'used',
  'user', 'using', 'very', 'want', 'was', 'way', 'well', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'why', 'will', 'with', 'without', 'work',
  'would', 'write', 'you', 'your',
]);

export const AUTO_SKILL_KEYWORDS: Array<{ slugPart: string; pattern: RegExp }> = [
  {
    slugPart: 'frontend-design',
    pattern:
      /\b(website|web\s*app|webpage|landing\s*page|ui|ux|css|tailwind|html|react|component|layout|dashboard|card|button|navbar|sidebar|responsive|design)\b/i,
  },
  {
    slugPart: 'xlsx',
    pattern:
      /\b(xlsx|xlsm|xltx|xls|csv|tsv|excel|spreadsheet|workbook|worksheet|tabular|pivot\s*table|cell\s*formula)\b/i,
  },
  {
    slugPart: 'product-self-knowledge',
    pattern:
      /\b(anthropic|claude|claude\s*code|claude\.ai|claude\s*api|haiku|sonnet|opus)\b/i,
  },
  {
    slugPart: 'gemini-api',
    pattern:
      /\b(gemini|@google\/genai|generatecontent|streaming|function\s*calling|grounding|structured\s*output|tts|live\s*api)\b/i,
  },
  {
    slugPart: 'image-generation',
    pattern: /\b(generate\s+image|image\s+prompt|illustration|banner|logo|avatar|artwork|photo)\b/i,
  },
  {
    slugPart: 'cloudsql',
    pattern: /\b(sql|postgres|postgresql|mysql|mariadb|database\s*schema|drizzle|prisma|table|query)\b/i,
  },
  {
    slugPart: 'firebase',
    pattern: /\b(firebase|firestore|auth|login|sign\s*in|user\s*roles|rbac)\b/i,
  },
  {
    slugPart: 'threejs',
    pattern: /\b(three\.?js|3d|webgl|shader|mesh|scene|camera)\b/i,
  },
  {
    slugPart: 'real-time-and-multi-user',
    pattern: /\b(websocket|real-?time|multiplayer|collaborative|live\s*sync)\b/i,
  },
  {
    slugPart: 'google-maps',
    pattern: /\b(google\s*maps|map\s*view|gps|coordinates|lat|long|directions|route|geofencing)\b/i,
  },
  {
    slugPart: 'pwa',
    pattern: /\b(pwa|progressive\s*web|offline|service\s*worker|manifest)\b/i,
  },
  {
    slugPart: 'seo',
    pattern: /\b(seo|open\s*graph|meta\s*tags|schema\.org|json-ld)\b/i,
  },
  {
    slugPart: 'workspace',
    pattern: /\b(google\s*(drive|docs|sheets|slides|calendar|gmail|forms|tasks))\b/i,
  },
  {
    slugPart: 'oauth',
    pattern: /\b(oauth|sso|third-party\s*login|redirect\s*uri)\b/i,
  },
  {
    slugPart: 'figma',
    pattern: /\b(figma)\b/i,
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 3 || w === '3d' || w === 'ui' || w === 'ux' || w === 'ph') && !STOPWORDS.has(w));
}

function unquoteYaml(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }
  return trimmed;
}

export function extractSkillBody(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

export function parseSkillFrontmatter(
  raw: string,
  fallbackPath: string,
  explicitTitle?: string
): {
  name: string;
  filename: string;
  description: string;
  tags: string[];
} {
  const cleanPath = fallbackPath.replace(/^\/+/, '');
  const folderOrFile = cleanPath
    .replace(/\/Skills\.md$/i, '')
    .replace(/\.(skills\.)?(md|markdown|txt)$/i, '');
  const baseSegment = folderOrFile.split('/').pop() || 'custom-skill';

  let name =
    explicitTitle?.trim() ||
    baseSegment
      .replace(/^\d+[-_]+/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) ||
    'Custom Skill';
  let description = explicitTitle?.trim()
    ? `Custom skill: ${explicitTitle.trim()}`
    : `Imported from ${cleanPath}`;
  let tags: string[] = explicitTitle?.trim() ? ['Custom'] : ['Imported'];

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split(/\r?\n/);
    const kv: Record<string, string> = {};
    let currentKey: string | null = null;

    for (const line of lines) {
      const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (keyMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
        currentKey = keyMatch[1].toLowerCase();
        const rest = keyMatch[2].trim();
        kv[currentKey] = rest === '|' || rest === '>' ? '' : rest;
      } else if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
        kv[currentKey] = `${kv[currentKey] ? `${kv[currentKey]} ` : ''}${line.trim()}`;
      }
    }

    if (kv.name && !explicitTitle?.trim()) {
      const rawName = unquoteYaml(kv.name);
      if (rawName) {
        name = rawName
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    if (kv.description) {
      const rawDesc = unquoteYaml(kv.description);
      if (rawDesc) {
        description = rawDesc.length > 360 ? `${rawDesc.slice(0, 357)}...` : rawDesc;
      }
    }
    if (kv.tags) {
      const rawTags = kv.tags.replace(/^\[|\]$/g, '');
      const parsedTags = rawTags
        .split(/[,]+/)
        .map((t) => unquoteYaml(t).replace(/^-\s*/, '').trim())
        .filter(Boolean);
      if (parsedTags.length > 0) tags = parsedTags;
    }
  } else {
    // Derive a helpful description from the first non-heading content line if no frontmatter exists
    const body = extractSkillBody(raw);
    const firstParagraph = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 12 && !l.startsWith('#') && !l.startsWith('```'));
    if (firstParagraph && description.startsWith('Imported from ')) {
      description =
        firstParagraph.length > 240 ? `${firstParagraph.slice(0, 237)}...` : firstParagraph;
    }
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = /\.(md|markdown|txt)$/i.test(cleanPath)
    ? cleanPath
    : `${slug || 'custom-skill'}.skills.md`;

  return { name, filename, description, tags };
}

function tokensMatch(promptTok: string, skillTok: string): boolean {
  if (promptTok === skillTok) return true;
  if (promptTok.length >= 5 && skillTok.length >= 5) {
    return promptTok.startsWith(skillTok.slice(0, 5)) || skillTok.startsWith(promptTok.slice(0, 5));
  }
  return false;
}

export function scoreSkillRelevance(prompt: string, skill: SkillDoc): number {
  const text = (prompt || '').trim();
  if (!text) return 0;

  const promptTokens = Array.from(new Set(tokenize(text)));
  let score = 0;

  const hay = `${skill.filename} ${skill.name}`.toLowerCase();
  for (const rule of AUTO_SKILL_KEYWORDS) {
    if (hay.includes(rule.slugPart) && rule.pattern.test(text)) {
      score += 6;
    }
  }

  const nameTokens = Array.from(new Set(tokenize(`${skill.name} ${skill.filename}`)));
  const metaTokens = Array.from(new Set(tokenize(`${skill.description} ${skill.tags.join(' ')}`)));

  const headingsAndLead = `${(skill.content.match(/^#{1,3}\s+.+$/gm) || []).join(' ')} ${extractSkillBody(skill.content).slice(0, 700)}`;
  const bodyTokens = new Set(tokenize(headingsAndLead));

  for (const pt of promptTokens) {
    if (nameTokens.some((nt) => tokensMatch(pt, nt))) {
      score += 4;
    } else if (metaTokens.some((mt) => tokensMatch(pt, mt))) {
      score += 3;
    } else if (bodyTokens.has(pt)) {
      score += 1.5;
    }
  }

  return score;
}

export function selectAutoRoutedSkills(
  prompt: string,
  allSkills: SkillDoc[],
  mountedIds: Set<string>,
  maxSkills = 2
): SkillDoc[] {
  const scored: Array<{ skill: SkillDoc; score: number }> = [];

  for (const skill of allSkills) {
    if (mountedIds.has(skill.id)) continue;
    const score = scoreSkillRelevance(prompt, skill);
    if (score >= 3) {
      scored.push({ skill, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSkills).map((s) => s.skill);
}

export function rankSkillsForCatalog(
  prompt: string,
  unmountedSkills: SkillDoc[],
  limit = 25
): SkillDoc[] {
  return [...unmountedSkills]
    .sort((a, b) => {
      const scoreDiff = scoreSkillRelevance(prompt, b) - scoreSkillRelevance(prompt, a);
      if (scoreDiff !== 0) return scoreDiff;
      const aCustom = a.id.startsWith('pack-') ? 1 : 0;
      const bCustom = b.id.startsWith('pack-') ? 1 : 0;
      return aCustom - bCustom;
    })
    .slice(0, limit);
}
