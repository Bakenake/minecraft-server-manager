import crypto from 'crypto';

// License key format: CRAFT-XXXX-XXXX-XXXX-XXXX
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

function segment(): string {
  let s = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    s += CHARS[bytes[i] % CHARS.length];
  }
  return s;
}

export function generateLicenseKey(): string {
  return `CRAFT-${segment()}-${segment()}-${segment()}-${segment()}`;
}

export function isValidKeyFormat(key: string): boolean {
  return /^CRAFT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
