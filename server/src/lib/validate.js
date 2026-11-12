import { z } from 'zod';
import { badRequest } from './http.js';

/** Validate a payload against a zod schema, throwing a 400 with field details. */
export function validate(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    const err = badRequest('Validation failed', details);
    throw err;
  }
  return result.data;
}

export const zId = z.string().min(1).max(64);
export const zOptionalId = zId.nullish().or(z.literal('').transform(() => null));
export const zDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
  .nullish()
  .or(z.literal('').transform(() => null));

export const zTags = z.array(z.string().trim().min(1).max(40)).max(20).default([]);

export const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done']);
export const taskPriority = z.enum(['low', 'medium', 'high', 'urgent']);
export const projectStatus = z.enum(['active', 'archived']);
export const noteKind = z.enum(['note', 'decision', 'debug', 'snippet', 'doc']);
