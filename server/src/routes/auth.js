import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, unauthorized, badRequest, newId, now, notFound } from '../lib/http.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  requireAuth,
} from '../lib/auth.js';
import { recordActivity } from '../lib/activity.js';
import { seedWorkspace } from '../db/seed.js';

export const authRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email().max(160);
const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

authRouter.post(
  '/register',
  ah(async (req, res) => {
    const { name, email, password } = validate(registerSchema, req.body);
    if (get('SELECT id FROM users WHERE email = ?', email)) {
      throw badRequest('An account with this email already exists');
    }
    const id = newId();
    const ts = now();
    run(
      `INSERT INTO users (id, email, password_hash, name, avatar_color, theme, prefs, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      email,
      hashPassword(password),
      name,
      COLORS[Math.floor(Math.random() * COLORS.length)],
      'light',
      JSON.stringify({ commandExecution: true, confirmDangerous: true, editor: 'markdown' }),
      ts,
      ts
    );
    const user = get('SELECT * FROM users WHERE id = ?', id);
    // Every new account starts with a living workspace.
    seedWorkspace(id);
    recordActivity(id, {
      type: 'auth',
      title: 'Workspace created',
      description: 'Welcome to DevDeck — demo data was added so you can explore right away.',
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const user = get('SELECT * FROM users WHERE email = ?', email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized('Email or password is incorrect');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.post(
  '/demo',
  ah(async (req, res) => {
    // One-click exploration account, seeded on demand.
    const email = 'demo@devdeck.local';
    let user = get('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      const id = newId();
      const ts = now();
      run(
        `INSERT INTO users (id, email, password_hash, name, avatar_color, theme, prefs, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        email,
        hashPassword(newId()),
        'Alex Rivera',
        '#4f46e5',
        'light',
        JSON.stringify({ commandExecution: true, confirmDangerous: true, editor: 'markdown' }),
        ts,
        ts
      );
      user = get('SELECT * FROM users WHERE id = ?', id);
      seedWorkspace(id);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

authRouter.patch(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: emailSchema.optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      defaultProjectId: z.string().nullish(),
      prefs: z.record(z.string(), z.any()).optional(),
      onboarded: z.boolean().optional(),
    });
    const patch = validate(schema, req.body);
    if (patch.email && patch.email !== req.user.email) {
      if (get('SELECT id FROM users WHERE email = ? AND id != ?', patch.email, req.userId)) {
        throw badRequest('That email is already in use');
      }
    }
    const columns = {
      name: patch.name,
      email: patch.email,
      theme: patch.theme,
      avatar_color: patch.avatarColor,
      default_project_id: patch.defaultProjectId,
      prefs: patch.prefs ? JSON.stringify({ ...JSON.parse(req.user.prefs || '{}'), ...patch.prefs }) : undefined,
      onboarded: patch.onboarded === undefined ? undefined : patch.onboarded ? 1 : 0,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    if (keys.length) {
      run(
        `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        ...keys.map((k) => columns[k]),
        now(),
        req.userId
      );
    }
    const fresh = get('SELECT * FROM users WHERE id = ?', req.userId);
    res.json({ user: publicUser(fresh) });
  })
);

authRouter.post(
  '/me/password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = validate(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      }),
      req.body
    );
    if (!verifyPassword(currentPassword, req.user.password_hash)) {
      throw badRequest('Current password is incorrect');
    }
    run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      hashPassword(newPassword),
      now(),
      req.userId
    );
    recordActivity(req.userId, {
      type: 'auth',
      title: 'Password changed',
      description: 'Account password was updated.',
    });
    res.json({ ok: true });
  })
);

authRouter.delete(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    run('DELETE FROM users WHERE id = ?', req.userId);
    res.json({ ok: true });
  })
);

authRouter.get(
  '/session/:id',
  ah(async (req, res) => {
    const user = get('SELECT id FROM users WHERE id = ?', req.params.id);
    if (!user) throw notFound();
    res.json({ exists: true });
  })
);
