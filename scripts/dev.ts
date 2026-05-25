import {spawn} from 'child_process';
import path from 'path';
import process from 'process';
import {fileURLToPath} from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const clientCommand = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'vite.cmd')
  : path.join(root, 'node_modules', '.bin', 'vite');

const apiCommand = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'tsx.cmd')
  : path.join(root, 'node_modules', '.bin', 'tsx');

const apiEntry = path.join(root, 'server', 'index.ts');

const children = [
  spawn(clientCommand, ['--port=3000', '--host=0.0.0.0'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
  spawn(apiCommand, [apiEntry], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '8787',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }

  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => {
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));