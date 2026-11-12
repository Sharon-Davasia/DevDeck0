import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db/index.js';
import { unauthorized } from './http.js';

const ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hashSync(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export function publicUser(row) {
  if (!row) return null;
  const { password_hash, prefs, ...rest } = row;
  return {
    ...rest,
    defaultProjectId: rest.default_project_id,
    avatarColor: rest.avatar_color,
    createdAt: rest.created_at,
    updatedAt: rest.updated_at,
    prefs: JSON.parse(prefs || '{}'),
  };
}

/** Express middleware: resolves the bearer token to `req.user`. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return next(unauthorized());
  const payload = verifyToken(token);
  if (!payload?.sub) return next(unauthorized('Session expired'));
  const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user) return next(unauthorized('Account no longer exists'));
  req.user = user;
  req.userId = user.id;
  return next();
}
