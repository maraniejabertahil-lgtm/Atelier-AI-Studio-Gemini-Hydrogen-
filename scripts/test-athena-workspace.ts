import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { executeAthenaWorkspaceTool, getAthenaWorkspaceRoot } from '../server/athenaWorkspace.ts';

const sessionA = `ci-smoke-a-${process.pid}-${Date.now()}`;
const sessionB = `ci-smoke-b-${process.pid}-${Date.now()}`;
const filePath = 'nested/note.txt';
const workspaceA = getAthenaWorkspaceRoot(sessionA);
const workspaceB = getAthenaWorkspaceRoot(sessionB);

try {
  const write = executeAthenaWorkspaceTool('Write', { file_path: filePath, content: 'Athena workspace smoke test' }, sessionA) as { written?: boolean };
  assert.equal(write.written, true);
  const read = executeAthenaWorkspaceTool('Read', { file_path: filePath }, sessionA) as { content?: string };
  assert.equal(read.content, 'Athena workspace smoke test');
  assert.throws(() => executeAthenaWorkspaceTool('Read', { file_path: filePath }, sessionB), /File not found/);

  executeAthenaWorkspaceTool('Edit', { file_path: filePath, old_string: 'smoke test', new_string: 'verified' }, sessionA);
  const edited = executeAthenaWorkspaceTool('Read', { file_path: filePath }, sessionA) as { content?: string };
  assert.equal(edited.content, 'Athena workspace verified');
  const glob = executeAthenaWorkspaceTool('Glob', { pattern: '**/*.txt' }, sessionA) as { files?: string[] };
  assert.ok(glob.files?.includes(filePath));
  const grep = executeAthenaWorkspaceTool('Grep', { pattern: 'workspace verified', path: 'nested' }, sessionA) as { matches?: Array<{ file_path: string }> };
  assert.ok(grep.matches?.some((match) => match.file_path === filePath));
  assert.throws(() => executeAthenaWorkspaceTool('Read', { file_path: '../../package.json' }, sessionA), /escapes the isolated Athena workspace/);
} finally {
  rmSync(workspaceA, { recursive: true, force: true });
  rmSync(workspaceB, { recursive: true, force: true });
}
