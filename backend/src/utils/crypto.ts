/**
 * Application-level encryption for sensitive data stored in the local SQLite DB.
 * Uses AES-256-GCM with the installation's JWT secret as key material.
 * 
 * This prevents users from opening craftos.db in a SQLite browser and
 * reading/modifying license keys, auth tokens, or other sensitive fields.
 */
import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_SALT = 'CraftOS-DataEncryption-v1';

// Derive a 256-bit key from the JWT secret
function getEncryptionKey(): Buffer {
  return crypto
    .createHash('sha256')
    .update(KEY_SALT + config.jwt.secret)
    .digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a hex string: iv + authTag + ciphertext
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv(32 hex) + tag(32 hex) + ciphertext
  return iv.toString('hex') + tag.toString('hex') + encrypted;
}

/**
 * Decrypt a previously encrypted string.
 * Returns the original plaintext.
 */
export function decryptField(encrypted: string): string {
  if (!encrypted) return encrypted;

  // If it doesn't look encrypted (no hex prefix), return as-is for backward compat
  if (encrypted.length < (IV_LENGTH + TAG_LENGTH) * 2 + 2) {
    return encrypted;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(encrypted.slice(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(encrypted.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const ciphertext = encrypted.slice((IV_LENGTH + TAG_LENGTH) * 2);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Decryption failed — probably unencrypted legacy data, return as-is
    return encrypted;
  }
}

/**
 * Check if a string looks like it's already encrypted by us.
 * Encrypted strings are always hex and at least 66 chars (16 + 16 + 1 byte min).
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 66) return false;
  return /^[0-9a-f]+$/i.test(value);
}
