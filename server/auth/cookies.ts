export type SameSitePolicy = 'lax' | 'strict' | 'none';

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSitePolicy;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.expires) segments.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);

  return segments.join('; ');
}

export function buildAuthCookieName(baseName: string) {
  return process.env.NODE_ENV === 'production' ? `__Host-${baseName}` : baseName;
}

export function getAuthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  } satisfies CookieOptions;
}

export function buildSetCookieHeaders(pairs: Array<[string, string, CookieOptions]>) {
  return pairs.map(([name, value, options]) => serializeCookie(name, value, options));
}

export function buildClearedCookie(name: string) {
  return serializeCookie(name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
