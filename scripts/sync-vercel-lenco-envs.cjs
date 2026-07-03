#!/usr/bin/env node

const { existsSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: resolve(process.cwd(), '.env') });

const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const targetsArg = rawArgs.find((arg) => arg.startsWith('--targets='));
const targets = (targetsArg ? targetsArg.split('=')[1] : 'production')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (targets.length === 0) {
  console.error('No Vercel targets provided. Use --targets=production,preview,development.');
  process.exit(1);
}

const allowedTargets = new Set(['production', 'preview', 'development']);
for (const target of targets) {
  if (!allowedTargets.has(target)) {
    console.error(`Unsupported target: ${target}. Allowed: production, preview, development.`);
    process.exit(1);
  }
}

if (process.env.VITE_LENCO_SECRET_KEY || process.env.VITE_LENCO_WEBHOOK_SECRET) {
  console.error('Refusing to continue: LENCO secret variables must not use the VITE_ prefix.');
  process.exit(1);
}

const lencoEnvKeys = [
  'LENCO_ENV',
  'VITE_LENCO_PUBLIC_KEY',
  'LENCO_PUBLIC_KEY',
  'LENCO_SECRET_KEY',
  'LENCO_WEBHOOK_SECRET',
  'LENCO_API_BASE_URL',
  'APP_URL',
  'APP_ORIGIN',
];

const missing = lencoEnvKeys.filter((key) => {
  const value = process.env[key];
  return typeof value !== 'string' || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error(`Missing required env values in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const vercelCommandCandidates = isWindows
  ? [
    { command: 'npx.cmd', baseArgs: ['--yes', 'vercel'] },
    { command: 'npm.cmd', baseArgs: ['exec', '--yes', '--', 'vercel'] },
  ]
  : [
    { command: 'npx', baseArgs: ['--yes', 'vercel'] },
    { command: 'npm', baseArgs: ['exec', '--yes', '--', 'vercel'] },
  ];

function runVercel(args, options = {}) {
  const failures = [];

  for (const candidate of vercelCommandCandidates) {
    const result = spawnSync(candidate.command, [...candidate.baseArgs, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: options.input,
      shell: isWindows,
    });

    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const output = [stdout, stderr].filter(Boolean).join('\n');

    if (result.error) {
      failures.push(`${candidate.command}: ${result.error.message}`);
      continue;
    }

    if (result.status === 0) {
      return { status: 0, output };
    }

    failures.push(`${candidate.command}: ${output || `exit code ${result.status}`}`);
  }

  const failureMessage = failures.join('\n') || `Vercel command failed: ${args.join(' ')}`;
  if (!options.allowFailure) {
    throw new Error(failureMessage);
  }

  return { status: 1, output: failureMessage };
}

const whoAmI = runVercel(['whoami'], { allowFailure: true });
if (whoAmI.status !== 0) {
  console.error('Vercel CLI is not authenticated. Run: npx vercel login');
  const message = whoAmI.output;
  if (message) {
    console.error(message);
  }
  process.exit(1);
}

const hasProjectLink =
  existsSync(resolve(process.cwd(), '.vercel', 'project.json')) ||
  existsSync(resolve(process.cwd(), '.vercel', 'repo.json'));

if (!hasProjectLink) {
  console.error('Project is not linked to Vercel yet. Run: npx vercel link');
  process.exit(1);
}

for (const target of targets) {
  for (const key of lencoEnvKeys) {
    const value = process.env[key];
    if (typeof value !== 'string') {
      continue;
    }

    // Always remove first to avoid interactive "already exists" prompts.
    runVercel(['env', 'rm', key, target, '--yes'], { allowFailure: true });

    process.stdout.write(`Setting ${key} for ${target}... `);
    runVercel(['env', 'add', key, target], { input: `${value}\n` });

    process.stdout.write('done\n');
  }
}

console.log(`LENCO env sync complete for targets: ${targets.join(', ')}`);
