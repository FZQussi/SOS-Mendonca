import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { ALERT_TYPES } from './db.js';

/** Valida `req.body` contra `schema`; 400 com os detalhes se falhar. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'pedido inválido', details: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}

// --- dispositivo ---------------------------------------------------------------

export const pairSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'código tem de ter 6 dígitos'),
});

const locationPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  recorded_at: z.number().int().positive(),
});

// Um ponto ou vários — a fila offline reenvia em lote (Context.md §6).
export const locationsBodySchema = z.union([locationPointSchema, z.array(locationPointSchema).min(1).max(500)]);

export const alertBodySchema = z.object({
  type: z.enum(ALERT_TYPES),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  note: z.string().max(500).optional(),
  recorded_at: z.number().int().positive().optional(),
});

export const heartbeatBodySchema = z.object({
  battery_pct: z.number().int().min(0).max(100),
});

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(3).max(30),
  priority: z.number().int().min(1).max(10).optional().default(1),
});

export const contactsBodySchema = z.array(contactSchema).max(10);

// --- cuidador --------------------------------------------------------------------

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'a palavra-passe tem de ter pelo menos 8 caracteres'),
  name: z.string().min(1).max(100),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createDeviceBodySchema = z.object({
  name: z.string().min(1).max(100),
});

export const fcmTokenBodySchema = z.object({
  token: z.string().min(1),
});
