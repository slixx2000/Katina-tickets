import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import argon2 from 'argon2';

const scrypt = promisify(_scrypt);
const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters long.');
  }

  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (encodedHash.startsWith('$argon2')) {
    try {
      return await argon2.verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  const [algorithm, salt, digest] = encodedHash.split('$');
  if (algorithm !== HASH_PREFIX || !salt || !digest) {
    return false;
  }

  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  const actual = Buffer.from(derived);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
