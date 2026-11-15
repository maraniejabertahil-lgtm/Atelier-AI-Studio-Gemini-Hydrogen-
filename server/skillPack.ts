import type { SkillDoc } from '../src/types.ts';

function makeSkill(
  id: string,
  name: string,
  slug: string,
  description: string,
  tags: string[],
  body: string
): SkillDoc {
  return {
    id,
    name,
    filename: `${slug}/Skills.md`,
    description,
    tags,
    updatedAt: new Date().toISOString(),
    content: `---\nname: ${slug}\ndescription: ${description}\ntags: [${tags.join(', ')}]\n---\n\n${body.trim()}`,
  };
}

export function getTwentyOneSkillPack(): SkillDoc[] {
  return [
    makeSkill(
      'skill-human-partner',
      'Human Partner & Brainpower Core',
      'human-partner',
      'Full cognitive reasoning engine: thinks step-by-step, speaks like a sharp human partner, routes skills, verifies facts, and handles long deep chats.',
      ['Core', 'Brainpower', 'Reasoning'],
      `# Human Partner & Brainpower Core

Operate as a thoughtful, deeply intelligent human collaborator and senior engineer:

1. **Human Voice & Emotional Intelligence**:
   - Speak naturally, warmly, and clearly—no robotic disclaimers, corporate filler, or stiff templates.
   - Match the user's intent and depth: crisp and conversational for quick check-ins, comprehensive and deeply structured for complex technical, creative, or multi-part requests. Never artificially truncate a thorough explanation when the user wants depth.
2. **Structured Deep Thinking**:
   - Break hard problems down from first principles: clarify goals, surface hidden constraints or edge cases, weigh trade-offs explicitly, and verify logic before concluding.
   - Maintain full continuity across long multi-turn conversations—track earlier decisions, constraints, and open threads accurately.
3. **Autonomous Skill Check**:
   - Before solving specialized tasks (UI design, Gemini SDK, SQL/Postgres, Firebase, Three.js, OAuth, Maps, SEO, migrations, etc.), call \`load_studio_skill\` to load the matching \`Skills.md\` module and follow its standards.
4. **Proactive Verification & Tools**:
   - Never guess mutable facts, math, or external data. Use \`evaluate_calculation\` for arithmetic, \`analyze_text_and_json\` for inspecting long payloads, \`googleSearch\` / \`urlContext\` for live web verification, and mounted Connectors for real API data.
   - For complex multi-step deliverables, organize your plan with \`plan_execution_steps\` so nothing is missed.
5. **Memory Continuity**:
   - Check \`read_studio_notes\` when prior preferences or project context may help, and use \`save_studio_note\` to store important user preferences, decisions, or facts for future chats.`
    ),
    makeSkill(
      'pack-gemini-api',
      'Gemini API Architect',
      'gemini-api',
      'Guides server-side @google/genai TypeScript SDK design, model selection, streaming, function calling, and grounding.',
      ['AI', 'Gemini', 'SDK'],
      `# Gemini API Architect

Use this skill when designing or reviewing Gemini-powered features with the \`@google/genai\` TypeScript SDK.

## Core Principles
1. **Server-Side Isolation**: Keep API keys and \`GoogleGenAI\` client instantiation strictly on the server; expose clean HTTP or SSE endpoints to the client.
2. **Modern SDK Patterns**: Use \`ai.models.generateContent\`, \`ai.models.generateContentStream\`, and \`ai.chats.create\`. Access text via \`response.text\`.
3. **Thinking & Structured Outputs**: Use \`thinkingConfig.thinkingLevel\` appropriately for latency vs. reasoning depth, and define explicit \`responseSchema\` (\`Type.OBJECT\`, \`Type.ARRAY\`, etc.) for deterministic JSON.
4. **Tooling & Grounding**: Combine \`functionDeclarations\` with \`googleSearch\` or \`urlContext\` using \`includeServerSideToolInvocations: true\` when hybrid grounding is required.`
    ),
    makeSkill(
      'pack-gemini-interactions',
      'Gemini Interactions & Media',
      'gemini-interactions-api',
      'Patterns for multi-step agent interactions, deep research, Omni models, and video/audio workflows.',
      ['AI', 'Agents', 'Video'],
      `# Gemini Interactions & Media

Apply this skill when architecting multi-step agent interactions or multimodal media pipelines.

## Guidelines
- Design stateful interaction turns with clear status polling or streaming updates.
- Separate fast conversational turns from long-running research, audio, or video generation jobs.
- Return structured progress milestones and clean error recovery paths to the user interface.`
    ),
    makeSkill(
      'pack-image-generation',
      'Visual Asset & Image Director',
      'image-generation',
      'Crafts art-directed prompts, aspect ratio specs, and resilient image fallback patterns.',
      ['Media', 'Design', 'Assets'],
      `# Visual Asset & Image Director

Use when generating or integrating visual assets into web applications.

## Checklist
1. Match aspect ratio strictly to the layout container (\`16:9\` hero, \`4:3\` cards, \`1:1\` avatars, \`3:4\` editorial).
2. Specify subject, environment, lighting, lens/material texture, and mood—avoid generic buzzwords.
3. Always provide a graceful CSS/SVG fallback container and descriptive \`alt\` text so no broken image frames ever appear.`
    ),
    makeSkill(
      'pack-frontend-design',
      'Frontend Design Constitution',
      'frontend-design',
      'Enforces domain-native typography, 60-30-10 color balance, single-elevation cards, and clean UI discipline.',
      ['Frontend', 'UI', 'Design'],
      `# Frontend Design Constitution

Apply when designing or refactoring web interfaces.

## Rules
- **Functional Hierarchy**: Every visible control must have a real handler; avoid decorative telemetry or unwired icons.
- **Typography**: Pair one expressive display/UI sans with one readable body font and a monospace font strictly for code and \`tabular-nums\` metrics.
- **Clean Metadata**: Render static tags, dates, and counts as plain text separated by \`·\` rather than pill-badge clutter.
- **Theme Discipline**: Support clean Light/Dark parity with explicit surface, border, and WCAG AA text contrast.`
    ),
    makeSkill(
      'pack-shadcn-ui',
      'shadcn/ui Component Specialist',
      'shadcn-ui',
      'Guidelines for composing accessible Radix + Tailwind primitives with consistent CSS variable theming.',
      ['UI', 'Components', 'Tailwind'],
      `# shadcn/ui Component Specialist

1. Compose primitives (\`Dialog\`, \`Sheet\`, \`Command\`, \`Tabs\`, \`Table\`) cleanly without nesting heavy shadows.
2. Centralize color tokens in CSS variables (\`--background\`, \`--foreground\`, \`--border\`, \`--primary\`) so light and dark themes stay consistent.
3. Keep keyboard navigation, focus-visible rings, and ARIA labels intact across every custom wrapper.`
    ),
    makeSkill(
      'pack-threejs',
      'Three.js & WebGL Engineer',
      'threejs',
      'Architecture for 3D scenes, lighting rigs, camera controls, shaders, and frame-rate budgets.',
      ['3D', 'WebGL', 'Graphics'],
      `# Three.js & WebGL Engineer

- Separate scene graph setup, animation loop, resize handling, and resource disposal (\`geometry.dispose()\`, \`material.dispose()\`).
- Use PBR materials (\`MeshStandardMaterial\` / \`MeshPhysicalMaterial\`) with balanced key/fill/rim lighting and environment maps.
- Cap pixel ratio (\`Math.min(window.devicePixelRatio, 2)\`) and throttle heavy raycasting to preserve 60fps.`
    ),
    makeSkill(
      'pack-figma-import',
      'Figma-to-Code Translator',
      'figma-import',
      'Converts visual mockups and design tokens into responsive, semantic React + Tailwind components.',
      ['Design', 'Figma', 'React'],
      `# Figma-to-Code Translator

1. Extract layout structure first: outer grid, sidebar widths, spacing rhythm, and typography scale.
2. Replace fixed pixel widths from static frames with responsive flex/grid rules and \`max-w-*\` containers.
3. Map colors and radii to reusable design tokens rather than one-off magic hex values.`
    ),
    makeSkill(
      'pack-focus-mode',
      'Targeted UI Element Editor',
      'focus-mode',
      'Executes surgical edits scoped to a specific CSS selector or component without disturbing adjacent layout.',
      ['UI', 'Refactoring', 'Precision'],
      `# Targeted UI Element Editor

- Scope changes strictly to the targeted component or selector and its immediate props/styles.
- Preserve existing state wiring, accessibility attributes, and responsive breakpoints.
- Summarize the exact visual or behavioral change made.`
    ),
    makeSkill(
      'pack-pwa-integration',
      'PWA & Offline Architect',
      'pwa-integration',
      'Designs Web App Manifests, service worker caching strategies, and installable offline UX.',
      ['PWA', 'Offline', 'Web'],
      `# PWA & Offline Architect

1. Configure \`manifest.webmanifest\` with accurate \`name\`, \`short_name\`, \`display: "standalone"\`, \`theme_color\`, and \`192x192\` / \`512x512\` icons.
2. Use stale-while-revalidate for static assets and network-first with graceful offline fallbacks for API routes.
3. Provide clear offline status feedback and non-intrusive install prompts.`
    ),
    makeSkill(
      'pack-applet-seo',
      'Technical SEO & Structured Data',
      'applet-seo',
      'Configures semantic HTML, OpenGraph cards, Twitter metadata, and Schema.org JSON-LD.',
      ['SEO', 'Metadata', 'Web'],
      `# Technical SEO & Structured Data

- Ensure unique, concise \`<title>\` (50–60 chars) and \`<meta name="description">\` (140–160 chars).
- Keep \`og:title\`, \`og:description\`, \`og:type\`, and Twitter card tags synchronized with page identity.
- Embed valid \`application/ld+json\` Schema.org structured data matching visible page content.`
    ),
    makeSkill(
      'pack-firebase',
      'Firebase Firestore & Auth Architect',
      'firebase-integration',
      'Designs Firestore document schemas, RBAC security rules, and client/server auth boundaries.',
      ['Database', 'Firebase', 'Auth'],
      `# Firebase Firestore & Auth Architect

1. Model collections around real query patterns and avoid unbounded subcollection scans.
2. Write least-privilege \`firestore.rules\` validating \`request.auth.uid\`, user roles, and field schemas on every write.
3. Handle loading, empty, and permission-denied states gracefully in the UI.`
    ),
    makeSkill(
      'pack-cloudsql-setup',
      'PostgreSQL & Drizzle Architect',
      'cloudsql-setup',
      'Designs relational PostgreSQL schemas, connection pooling, and auth-backed API layers.',
      ['SQL', 'PostgreSQL', 'Drizzle'],
      `# PostgreSQL & Drizzle Architect

- Normalize core entities with explicit primary keys, foreign keys (\`onDelete\`), and indexes on filter/join columns.
- Use parameterized queries via Drizzle ORM—never string-interpolated SQL.
- Enforce user ownership or role checks inside every server route before mutating rows.`
    ),
    makeSkill(
      'pack-cloudsql-schema',
      'Database Schema Migration Planner',
      'cloudsql-update-schema',
      'Guides safe, backward-compatible SQL schema changes and Drizzle migrations.',
      ['SQL', 'Migrations', 'Schema'],
      `# Database Schema Migration Planner

1. Prefer additive changes (nullable columns or defaults) before tightening constraints.
2. Verify foreign-key impacts and backfill scripts when renaming or splitting tables.
3. Keep TypeScript domain types synchronized with schema definitions.`
    ),
    makeSkill(
      'pack-cloudsql-query',
      'SQL Query & Seed Specialist',
      'cloudsql-execute-sql',
      'Writes clean, read-safe DQL/DML queries, seed scripts, and diagnostic aggregations.',
      ['SQL', 'Analytics', 'Data'],
      `# SQL Query & Seed Specialist

- Use CTEs and explicit column lists rather than \`SELECT *\`.
- Always apply \`LIMIT\` on exploratory queries and \`WHERE\` guards on updates/deletes.
- Validate idempotency (\`ON CONFLICT DO NOTHING / DO UPDATE\`) in seed scripts.`
    ),
    makeSkill(
      'pack-realtime',
      'Real-Time & Multi-User Systems',
      'real-time-and-multi-user',
      'Architects WebSocket protocols, server-authoritative state, presence, and conflict resolution.',
      ['Realtime', 'WebSockets', 'Multiplayer'],
      `# Real-Time & Multi-User Systems

1. Keep the server authoritative for shared state transitions, turn order, and permissions.
2. Design typed message envelopes (\`{ type, payload, seq }\`) with heartbeat/reconnect handling.
3. Optimistically update local UI only where rollback is clean and deterministic.`
    ),
    makeSkill(
      'pack-workspace',
      'Google Workspace API Integrator',
      'workspace-integration',
      'Patterns for client-side OAuth tokens and Drive, Docs, Sheets, Calendar, and Gmail API calls.',
      ['Workspace', 'OAuth', 'APIs'],
      `# Google Workspace API Integrator

- Request the minimum OAuth scopes required for the user's task.
- Pass user Bearer access tokens cleanly and handle \`401\` token expiry with a re-auth prompt.
- Batch or paginate list responses (\`pageToken\`) for Drive, Gmail, and Calendar queries.`
    ),
    makeSkill(
      'pack-oauth',
      'Third-Party OAuth Integrator',
      'oauth-integration',
      'Implements popup-safe OAuth 2.0 PKCE/code flows for external developer and SaaS APIs.',
      ['OAuth', 'Security', 'Auth'],
      `# Third-Party OAuth Integrator

1. Use \`state\` parameters (and PKCE where supported) to prevent CSRF.
2. Handle iframe preview constraints gracefully via popup auth windows and \`postMessage\` handshakes.
3. Store client secrets exclusively on the server—never in frontend bundles.`
    ),
    makeSkill(
      'pack-maps',
      'Geospatial & Maps Engineer',
      'google-maps-platform',
      'Designs interactive maps, place search, geocoding, routing, and location-grounded UI.',
      ['Maps', 'Geo', 'Location'],
      `# Geospatial & Maps Engineer

- Request browser geolocation only on explicit user action with a clear manual city/address fallback.
- Render place attributions, clickable map links, and travel units (\`km\`/\`mi\`, \`min\`) consistently.
- Cluster dense markers and debounce autocomplete/bounds queries.`
    ),
    makeSkill(
      'pack-github-migration',
      'Repository Migration Specialist',
      'github-import-migration',
      'Audits imported repositories, resolves dependency/port/env gaps, and brings builds to green.',
      ['Migration', 'DevOps', 'Repo'],
      `# Repository Migration Specialist

1. Inspect \`package.json\`, entry points, env vars, and build scripts first.
2. Replace hardcoded localhost/port assumptions with environment-configured port \`3000\` and clean proxy routes.
3. Verify compilation, type checking, and runtime health endpoints after changes.`
    ),
    makeSkill(
      'pack-github-rewrite',
      'Cross-Framework Code Porter',
      'github-import-rewrite',
      'Rewrites applications across frontend/backend frameworks while preserving business logic and UX.',
      ['Architecture', 'Refactoring', 'Porting'],
      `# Cross-Framework Code Porter

- Inventory core domain models, routes, and user flows before writing target-framework code.
- Preserve feature parity and state invariants while adopting idiomatic patterns of the destination stack.
- Test every ported workflow end-to-end against edge cases.`
    ),
    makeSkill(
      'pack-planning',
      'Architecture & Planning Lead',
      'planning-mode',
      'Clarifies ambiguous requirements and drafts concise, actionable implementation plans before coding.',
      ['Planning', 'Architecture', 'Spec'],
      `# Architecture & Planning Lead

1. Surface ambiguities early with concise multiple-choice trade-offs rather than guessing silently.
2. Structure implementation plans by user flow, data model, API contract, and verification steps.
3. Keep plans concrete and scoped—avoid speculative over-engineering.`
    ),
  ];
}
