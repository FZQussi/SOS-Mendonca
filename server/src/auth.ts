import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, now } from './db.js';

/**
 * Dois mundos de autenticação que não se misturam (Context.md §7):
 *
 *   Dispositivo (idoso)         Cuidador (painel)
 *   token opaco, 64 hex         JWT, 30 dias
 *   emparelhamento por código   email + password (bcrypt)
 *   só o hash SHA-256 na BD     nada guardado, é assinado
 *
 * O telemóvel do idoso nunca faz login — não há aqui uma função de "login de
 * dispositivo", só emparelhamento.
 */

declare global {
  namespace Express {
    interface Request {
      device?: { id: number; name: string };
      caregiver?: { id: number; email: string; name: string };
    }
  }
}

// --- dispositivo: token opaco -------------------------------------------------

/** Token em claro. Existe uma única vez, na resposta ao emparelhamento. */
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 caracteres hex
}

/** O que se guarda na BD. Nunca o token em claro (Context.md §6). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

/** Código de 6 dígitos, mostrado no ecrã do idoso durante o emparelhamento. */
export function generatePairingCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function pairingExpiresAt(): number {
  return now() + PAIRING_CODE_TTL_MS;
}

/**
 * `Authorization: Bearer <token>` → dispositivo, ou 401.
 *
 * Identifica apenas; não atualiza `last_seen_at` (isso é do heartbeat, não da
 * autenticação — misturar as duas coisas tornaria esta função difícil de
 * reutilizar em rotas que não devem contar como sinal de vida).
 */
export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'token em falta' });
    return;
  }

  const row = db
    .prepare(`SELECT id, name FROM devices WHERE token_hash = ?`)
    .get(hashToken(token)) as { id: number; name: string } | undefined;

  if (!row) {
    res.status(401).json({ error: 'token inválido' });
    return;
  }

  req.device = row;
  next();
}

// --- cuidador: password + JWT -------------------------------------------------

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = '30d';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/**
 * Lê o segredo em cada chamada, não ao carregar o módulo: um `server/` sem
 * `.env` deve falhar no primeiro login, com um erro que diz porquê — não no
 * arranque de rotas que nunca tocam em JWT, nem em silêncio com um segredo vazio.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não está definido — falta o .env (ver .env.example)');
  return secret;
}

export function signCaregiverToken(caregiverId: number): string {
  return jwt.sign({ sub: caregiverId }, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifica um JWT de cuidador e devolve quem é, ou `null`. Usado pelo
 * middleware HTTP (`requireCaregiver`) e pelo handshake do WebSocket — o
 * `/ws` não passa por Express, por isso não pode usar o middleware, mas a
 * regra de quem é um cuidador válido tem de ser a mesma nos dois sítios.
 */
export function verifyCaregiverToken(token: string): { id: number; email: string; name: string } | null {
  let caregiverId: number;
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === 'string' || typeof payload.sub !== 'number') throw new Error('payload inválido');
    caregiverId = payload.sub;
  } catch {
    return null;
  }

  // Confirma que o cuidador ainda existe — um JWT de 30 dias sobrevive a uma
  // conta apagada entretanto.
  const row = db
    .prepare(`SELECT id, email, name FROM caregivers WHERE id = ?`)
    .get(caregiverId) as { id: number; email: string; name: string } | undefined;
  return row ?? null;
}

/** `Authorization: Bearer <jwt>` → cuidador, ou 401. */
export function requireCaregiver(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'token em falta' });
    return;
  }

  const caregiver = verifyCaregiverToken(token);
  if (!caregiver) {
    res.status(401).json({ error: 'token inválido' });
    return;
  }

  req.caregiver = caregiver;
  next();
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}
