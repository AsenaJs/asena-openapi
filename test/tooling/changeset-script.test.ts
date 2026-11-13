import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');

function runChangesetScript(args: string[]): { stdout: string; exitCode: number } {
  const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;
  const root = mkdtempSync(join(tmpdir(), 'changeset-script-'));
  const binDir = join(root, 'bin');

  try {
    mkdirSync(binDir);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { changeset: scripts.changeset } }));
    writeFileSync(join(binDir, 'changeset'), '#!/bin/sh\necho "changeset:$*"\n', { mode: 0o755 });
    writeFileSync(join(binDir, 'bun'), '#!/bin/sh\necho "bun:$*"\n', { mode: 0o755 });

    const result = Bun.spawnSync([process.execPath, 'run', 'changeset', ...args], {
      cwd: root,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return { stdout: result.stdout.toString(), exitCode: result.exitCode };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('changeset script', () => {
  test('forwards CLI arguments to changeset and formats only the changeset folder', () => {
    const { stdout, exitCode } = runChangesetScript(['status', '--since=master']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('changeset:status --since=master');
    expect(stdout).toContain('bun:fmt .changeset');
  });
});
