const path = require('path');
const { config } = require('dotenv');
const { execSync } = require('child_process');

config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL.trim().length > 0) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = '';
}

const command = process.platform === 'win32' ? 'npx.cmd vitest run' : 'npx vitest run';

try {
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
  });
} catch (error) {
  process.exit((error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') ? error.status : 1);
}
