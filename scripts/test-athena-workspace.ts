import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeAthenaWorkspaceTool } from '../server/athenaWorkspace.ts';

const folder = `ci-smoke-${process.pid}-${Date.now()}`;
const filePath = `${folder}/nested/note.txt`;
const workspaceFolder = resolve(process.cwd(), 'data', 'athena-workspace', folder);

try {
  const write = executeAthenaWorkspaceTool('Write', {
    file_path: filePath,
    content: 'Athena workspace smoke test',
  }) as { written?: boolean };
  assert.equal(write.written, true);

  const read = executeAthenaWorkspaceTool('Read', { file_path: filePath }) as { content?: string };
  assert.equal(read.content, 'Athena workspace smoke test');

  executeAthenaWorkspaceTool('Edit', {
    file_path: filePath,
    old_string: 'smoke test',
    new_string: 'verified',
  });
  const edited = executeAthenaWorkspaceTool('Read', { file_path: filePath }) as { content?: string };
  assert.equal(edited.content, 'Athena workspace verified');

  const glob = executeAthenaWorkspaceTool('Glob', { pattern: `${folder}/**/*.txt` }) as { files?: string[] };
  assert.ok(glob.files?.includes(filePath));

  const grep = executeAthenaWorkspaceTool('Grep', { pattern: 'workspace verified', path: folder }) as {
    matches?: Array<{ file_path: string }>;
  };
  assert.ok(grep.matches?.some((match) => match.file_path === filePath));

  assert.throws(
    () => executeAthenaWorkspaceTool('Read', { file_path: '../../package.json' }),
    /escapes the isolated Athena workspace/
  );
} finally {
  rmSync(workspaceFolder, { recursive: true, force: true });
}
