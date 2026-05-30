import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeBase32(input: string) {
  return input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
}

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(value: string) {
  const normalized = normalizeBase32(value);
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 secret.');
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number, digits = 6) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = (code % 10 ** digits).toString().padStart(digits, '0');
  return otp;
}

function sanitizeNumericCode(value: string) {
  return value.replace(/\D+/g, '');
}

export function verifyTotpCode(secret: string, inputCode: string, options: { period?: number; digits?: number; window?: number } = {}) {
  const period = options.period ?? 30;
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const code = sanitizeNumericCode(inputCode);
  if (code.length !== digits) {
    return false;
  }

  const nowCounter = Math.floor(Date.now() / 1000 / period);
  for (let delta = -window; delta <= window; delta += 1) {
    if (hotp(secret, nowCounter + delta, digits) === code) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUri(input: { issuer: string; accountName: string; secret: string }) {
  const label = `${input.issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function resolveEncryptionKey() {
  const seed = process.env.MFA_SECRET_ENCRYPTION_KEY;
  if (!seed || seed.trim().length < 16) {
    return null;
  }

  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptMfaSecret(secret: string) {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY must be configured for MFA secret encryption.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptMfaSecret(payload: string) {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY must be configured for MFA secret encryption.');
  }

  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Stored MFA secret is invalid.');
  }

  const [ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(dataPart, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function generateBackupCodes(count = 8) {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
