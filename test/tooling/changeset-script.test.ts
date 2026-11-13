import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const scripts: Record<string, string> = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;

function runScript(name: string, args: string[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'changeset-script-'));
  const binDir = join(root, 'bin');

  try {
    mkdirSync(binDir);
    const picked = Object.fromEntries(
      Object.entries(scripts).filter(([key]) => [name, `pre${name}`, `post${name}`].includes(key)),
    );
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: picked }));
    writeFileSync(join(binDir, 'changeset'), '#!/bin/sh\necho "changeset:$*"\nexit ${CHANGESET_EXIT:-0}\n', {
      mode: 0o755,
    });
    writeFileSync(join(binDir, 'bun'), '#!/bin/sh\necho "bun:$*"\n', { mode: 0o755 });

    const result = Bun.spawnSync([process.execPath, 'run', name, ...args], {
      cwd: root,
      env: { ...process.env, ...env, PATH: `${binDir}:${process.env.PATH}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return { stdout: result.stdout.toString(), exitCode: result.exitCode };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('changeset script', () => {
  test('forwards CLI arguments to changeset, then formats the files changeset writes', () => {
    const { stdout, exitCode } = runScript('changeset', ['status', '--since=master']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('changeset:status --since=master\nbun:fmt .changeset CHANGELOG.md package.json\n');
  });

  test('skips formatting when changeset fails', () => {
    const { stdout, exitCode } = runScript('changeset', ['status'], { CHANGESET_EXIT: '3' });

    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('changeset:status\n');
  });
});

describe('version script', () => {
  test('forwards CLI arguments to changeset version, then formats the release files', () => {
    const { stdout, exitCode } = runScript('version', ['--ignore', 'x']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('changeset:version --ignore x\nbun:fmt .changeset CHANGELOG.md package.json\n');
  });

  test('skips formatting when changeset version fails', () => {
    const { stdout, exitCode } = runScript('version', [], { CHANGESET_EXIT: '3' });

    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('changeset:version\n');
  });
});
