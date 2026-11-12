/**
 * Symmetric encryption for stored third-party credentials (GitHub tokens,
 * Docker socket credentials). AES-256-GCM with a key derived from JWT_SECRET,
 * so secrets are never persisted in plaintext.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

function key() {
  return crypto.createHash('sha256').update(`devdeck:${config.jwtSecret || 'dev'}`).digest();
}

export function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [version, ivB64, tagB64, dataB64] = String(payload).split(':');
  if (version !== 'v1') throw new Error('Unsupported secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function mask(secret) {
  if (!secret) return null;
  const s = String(secret);
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
