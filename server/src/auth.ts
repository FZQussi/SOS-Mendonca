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

/**
 * A versão vai lá dentro para o token poder ser revogado antes dos 30 dias
 * (ROADMAP §2.6): basta subir a coluna e todos os tokens já assinados deixam
 * de bater. Lê-se aqui em vez de vir por parâmetro porque isto só acontece no
 * registo e no login — duas vezes na vida de uma sessão, não por pedido.
 */
export function signCaregiverToken(caregiverId: number): string {
  const row = db.prepare(`SELECT token_version FROM caregivers WHERE id = ?`).get(caregiverId) as
    | { token_version: number }
    | undefined;
  return jwt.sign({ sub: caregiverId, tv: row?.token_version ?? 1 }, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/** Invalida todas as sessões do cuidador, incluindo aquela de onde o pedido veio. */
export function revokeCaregiverSessions(caregiverId: number): void {
  db.prepare(`UPDATE caregivers SET token_version = token_version + 1 WHERE id = ?`).run(caregiverId);
}

/**
 * Verifica um JWT de cuidador e devolve quem é, ou `null`. Usado pelo
 * middleware HTTP (`requireCaregiver`) e pelo handshake do WebSocket — o
 * `/ws` não passa por Express, por isso não pode usar o middleware, mas a
 * regra de quem é um cuidador válido tem de ser a mesma nos dois sítios.
 */
export function verifyCaregiverToken(token: string): { id: number; email: string; name: string } | null {
  let caregiverId: number;
  let tokenVersion: number;
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === 'string' || typeof payload.sub !== 'number') throw new Error('payload inválido');
    caregiverId = payload.sub;
    // Tokens assinados antes de a revogação existir não trazem `tv`. Valem
    // como versão 1 — a primeira revogação a sério invalida-os na mesma.
    tokenVersion = typeof payload.tv === 'number' ? payload.tv : 1;
  } catch {
    return null;
  }

  // Confirma que o cuidador ainda existe — um JWT de 30 dias sobrevive a uma
  // conta apagada entretanto — e que a sessão não foi revogada.
  const row = db
    .prepare(`SELECT id, email, name, token_version FROM caregivers WHERE id = ?`)
    .get(caregiverId) as { id: number; email: string; name: string; token_version: number } | undefined;
  if (!row || row.token_version !== tokenVersion) return null;

  return { id: row.id, email: row.email, name: row.name };
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

// --- travão de força bruta ----------------------------------------------------

/**
 * O servidor está exposto à internet pelo túnel Cloudflare, e há exatamente
 * dois segredos adivinháveis: a password do cuidador e o código de 6 dígitos
 * do emparelhamento. Sem travão, ambos são força bruta aberta (ROADMAP §2.6).
 *
 * **Conta-se só o que falha.** Quem acerta nunca vê isto, portanto ninguém
 * legítimo é bloqueado por usar a app depressa — só quem está a adivinhar.
 *
 * Não se usa o IP como chave de propósito: atrás do túnel todos os pedidos
 * chegam do mesmo endereço local, e o `CF-Connecting-IP` é um cabeçalho que
 * quem estiver na LAN do Pi pode forjar à vontade. A chave é aquilo que está
 * a ser atacado (a conta, o emparelhamento), que não se pode falsificar.
 *
 * ponytail: Map em memória, um só processo. Reinicia o servidor e os
 * contadores vão a zero — aceitável para uma família; se algum dia houver
 * mais do que um processo, isto tem de ir para a base de dados.
 */
const failures = new Map<string, { count: number; resetAt: number }>();

export const LOGIN_MAX_FAILURES = 10;
export const PAIR_MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** Já passou do limite? Chamar **antes** do bcrypt — senão o custo é a própria DoS. */
export function tooManyFailures(key: string, max: number): boolean {
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= now()) return false;
  return bucket.count >= max;
}

/**
 * Só chamar com chaves de cardinalidade limitada (um email que existe, a
 * constante `pair`). Registar emails inventados encheria o Map de graça.
 */
export function recordFailure(key: string): void {
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= now()) {
    failures.set(key, { count: 1, resetAt: now() + FAILURE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

/** Um sucesso limpa o historial — quem sabe a password não fica de castigo. */
export function forgetFailures(key: string): void {
  failures.delete(key);
}

/** Só para os testes: os contadores são globais ao processo. */
export function resetFailures(): void {
  failures.clear();
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}
