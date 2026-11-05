import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
function release(args, env = {}) {
  return spawnSync(process.execPath, ['scripts/release.mjs', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  });
}
test('release rejects unsupported flags before invoking build or deployment', () => {
  const result = release(['--force']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown or incompatible/);
});
test('release rejects SSH option injection before running external commands', () => {
  mkdirSync(join(root, '.deploy-work'), { recursive: true });
  const temp = mkdtempSync(join(root, '.deploy-work', 'test-'));
  try {
    const config = join(temp, 'config.json');
    writeFileSync(config, JSON.stringify({ sshHost: '-oProxyCommand=bad', sshPort: 22, mode: 'fullstack' }));
    const result = release([], { CODEHIVE_DEPLOY_CONFIG: config, DEPLOY_HOST: '', DEPLOY_PORT: '' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid SSH target/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
test('release help has no external side effects', () => {
  const result = release(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--check/);
});
