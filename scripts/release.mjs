import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run release -- [--check | --deploy-only]\nCommit intended changes first. Default: verify, push configured remotes, upload, deploy.\n--check runs local checks only. --deploy-only skips pushes (for CI).');
  process.exit(0);
}
function run(command, argv, options = {}) {
  // Invoke npm's JS entry point directly on Windows; never concatenate shell commands.
  if (command === 'npm' && process.env.npm_execpath) {
    argv = [process.env.npm_execpath, ...argv]; command = process.execPath;
  } else if (command === 'npm' && process.platform === 'win32') {
    argv = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...argv]; command = process.execPath;
  }
  const result = spawnSync(command, argv, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}
const git = (...argv) => run('git', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
let work;
try {
  if (args.some(arg => !['--check', '--deploy-only'].includes(arg)) || args.length > 1) throw new Error('Unknown or incompatible arguments; use --help.');
  const configPath = resolve(process.env.CODEHIVE_DEPLOY_CONFIG || 'deploy/config.local.json');
  const config = JSON.parse(readFileSync(existsSync(configPath) ? configPath : 'deploy/config.example.json', 'utf8'));
  config.sshHost = process.env.DEPLOY_HOST || config.sshHost;
  config.sshPort = Number(process.env.DEPLOY_PORT || config.sshPort);
  config.mode = process.env.DEPLOY_MODE || config.mode;
  if (!/^[a-zA-Z0-9_.@-]+$/.test(config.sshHost) || config.sshHost.startsWith('-')) throw new Error('Invalid SSH target');
  if (!Number.isInteger(config.sshPort) || config.sshPort < 1 || config.sshPort > 65535) throw new Error('Invalid SSH port');
  if (!['frontend', 'fullstack'].includes(config.mode)) throw new Error('Invalid mode');
  if (!Array.isArray(config.remotes) || !config.remotes.length || config.remotes.some(r => !/^[a-zA-Z0-9_-]+$/.test(r) || r.startsWith('-'))) throw new Error('Invalid remotes');
  git('check-ref-format', '--branch', config.branch);
  const checkOnly = args.includes('--check');
  const deployOnly = args.includes('--deploy-only');
  if (!checkOnly) {
    if (git('status', '--porcelain')) throw new Error('Working tree has uncommitted changes. Review and commit intended files before release.');
    if (!deployOnly && git('branch', '--show-current') !== config.branch) throw new Error(`Release requires branch ${config.branch}`);
  }
  const revision = git('rev-parse', 'HEAD');
  const sshOptions = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15'];
  const identityFile = process.env.CODEHIVE_SSH_KEY_FILE || config.identityFile;
  if (identityFile) {
    if (!existsSync(identityFile)) throw new Error('SSH identity file does not exist');
    sshOptions.push('-i', resolve(identityFile), '-o', 'IdentitiesOnly=yes');
  }
  if (!checkOnly) run('ssh', [...sshOptions, '-p', String(config.sshPort), config.sshHost, 'test -r /etc/codehive/deploy.env && command -v bash && command -v tar && command -v flock && command -v rsync']);
  run('npm', ['ci']);
  run('npm', ['run', 'build']);
  run('npm', ['test']);
  run('npm', ['run', 'lint']);
  if (config.mode === 'fullstack') {
    const localPython = join(root, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.CODEHIVE_PYTHON || (config.python && config.python !== 'python' ? config.python : existsSync(localPython) ? localPython : 'python');
    run(python, ['-m', 'pytest', '-q'], { cwd: join(root, 'backend') });
  }
  if (checkOnly) { console.log('Local checks passed; no push or deployment performed.'); process.exit(0); }
  if (git('status', '--porcelain') || git('rev-parse', 'HEAD') !== revision) throw new Error('Source changed during checks; release stopped.');
  if (!deployOnly) for (const remote of config.remotes) run('git', ['push', remote, `${revision}:refs/heads/${config.branch}`]);
  const id = `${revision}-${randomBytes(6).toString('hex')}`;
  mkdirSync('.deploy-work', { recursive: true });
  work = mkdtempSync(resolve('.deploy-work/release-'));
  const source = join(work, 'source'); mkdirSync(source);
  // Keep Git's UTF-8 archive intact: Windows tar cannot reliably extract Chinese paths.
  // The Linux server extracts it after receiving the ASCII-named outer bundle.
  run('git', ['archive', '--format=tar', `--output=${join(source, 'source.tar')}`, revision]);
  cpSync('dist', join(source, 'dist'), { recursive: true });
  const archive = join(work, 'release.tgz');
  run('tar', ['-czf', archive, '-C', source, '.']);
  const remoteArchive = `/tmp/codehive-${id}.tgz`;
  run('scp', [...sshOptions, '-P', String(config.sshPort), archive, `${config.sshHost}:${remoteArchive}`]);
  run('ssh', [...sshOptions, '-p', String(config.sshPort), config.sshHost, `bash -s -- ${remoteArchive} ${id} ${config.mode}`], {
    input: readFileSync('scripts/deploy-release.sh'), stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`Release verified: ${revision}`);
} catch (error) {
  console.error(`Release stopped: ${error.message}`); process.exitCode = 1;
} finally {
  if (work) rmSync(work, { recursive: true, force: true });
}
