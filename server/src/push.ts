import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, type AlertType } from './db.js';
import type { AlertRow } from './alerts.js';

/**
 * Notificações push para o cuidador (Context.md §4). É a última peça do ciclo
 * de alertas: sem isto, um SOS às 3 da manhã só chega a quem tiver o painel
 * aberto no ecrã.
 *
 * **Sem credenciais, isto não faz nada** — nem falha, nem estraga o alerta.
 * O `FCM_SERVICE_ACCOUNT` aponta para o JSON da service account do Firebase;
 * enquanto estiver vazio, o resto do servidor funciona exatamente como antes.
 *
 * Fala-se com a HTTP v1 do FCM à mão, com o `jsonwebtoken` que já cá estava,
 * em vez de instalar o `firebase-admin` — são duas chamadas HTTP e um JWT.
 */

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_TTL_S = 3600;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// `undefined` = ainda não se tentou ler; `null` = lido e não há.
let account: ServiceAccount | null | undefined;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;

  const file = process.env.FCM_SERVICE_ACCOUNT;
  if (!file) {
    console.log('[push] FCM_SERVICE_ACCOUNT não definido — notificações push desligadas.');
    account = null;
    return account;
  }

  try {
    account = JSON.parse(fs.readFileSync(file, 'utf8')) as ServiceAccount;
  } catch (err) {
    // Credenciais partidas não podem derrubar o servidor: um Pi que não
    // arranca é pior do que um Pi sem push.
    console.error(`[push] não consegui ler ${file} — notificações push desligadas.`, err);
    account = null;
  }
  return account;
}

/** Só para os testes, que mexem no `FCM_SERVICE_ACCOUNT` a meio. */
export function forgetServiceAccount(): void {
  account = undefined;
  cachedToken = null;
}

const ALERT_TITLE: Record<AlertType, string> = {
  sos: 'SOS',
  fall: 'Possível queda',
  low_battery: 'Bateria fraca',
  device_offline: 'Sem sinal',
  geofence: 'Saiu da zona',
};

/**
 * Quem lê isto foi acordado a meio da noite. Uma frase em português, sem
 * termos de sistema — a mesma regra do ecrã do idoso (Context.md §10).
 */
export function pushBody(type: AlertType, deviceName: string): string {
  switch (type) {
    case 'sos':
      return `${deviceName} pediu ajuda.`;
    case 'fall':
      return `${deviceName} pode ter caído.`;
    case 'low_battery':
      return `O telemóvel de ${deviceName} está quase sem bateria.`;
    case 'device_offline':
      return `${deviceName} não dá sinal há algum tempo.`;
    case 'geofence':
      return `${deviceName} saiu da zona habitual.`;
  }
}

/** Um SOS não pode desaparecer do ecrã sozinho enquanto ninguém lhe tocar. */
function isUrgent(type: AlertType): boolean {
  return type === 'sos' || type === 'fall';
}

export function buildMessage(
  alert: Pick<AlertRow, 'id' | 'type'>,
  deviceName: string,
  fcmToken: string,
): Record<string, unknown> {
  const urgent = isUrgent(alert.type);
  return {
    message: {
      token: fcmToken,
      notification: { title: ALERT_TITLE[alert.type], body: pushBody(alert.type, deviceName) },
      android: { priority: 'high' },
      webpush: {
        headers: { Urgency: urgent ? 'high' : 'normal' },
        notification: {
          requireInteraction: urgent,
          // Dois cuidadores a confirmar o mesmo alerta não devem empilhar
          // duas notificações iguais no ecrã.
          tag: `alerta-${alert.id}`,
        },
        fcm_options: { link: '/' },
      },
    },
  };
}

/** O JWT que se troca por um access token na Google. */
export function accessTokenAssertion(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  return jwt.sign(
    {
      iss: sa.client_email,
      scope: SCOPE,
      aud: OAUTH_URL,
      iat: nowSeconds,
      exp: nowSeconds + TOKEN_TTL_S,
    },
    sa.private_key,
    { algorithm: 'RS256' },
  );
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  // Um minuto de folga: um token que expira a meio do envio não serve.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: accessTokenAssertion(sa),
    }),
  });
  if (!res.ok) throw new Error(`oauth respondeu ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

/**
 * Envia o alerta a todos os cuidadores com token FCM registado.
 *
 * Chamada em fire-and-forget a partir de `createAlert()`: a rede até à Google
 * é lenta e o SOS não pode esperar por ela. Nada aqui dentro pode rebentar
 * para fora — um push falhado nunca pode impedir um alerta de existir.
 */
export async function notifyCaregivers(alert: AlertRow): Promise<void> {
  const sa = serviceAccount();
  if (!sa) return;

  const caregivers = db
    .prepare(`SELECT id, fcm_token FROM caregivers WHERE fcm_token IS NOT NULL`)
    .all() as { id: number; fcm_token: string }[];
  if (caregivers.length === 0) return;

  const device = db.prepare(`SELECT name FROM devices WHERE id = ?`).get(alert.device_id) as
    | { name: string }
    | undefined;
  const deviceName = device?.name ?? 'O telemóvel';

  let token: string;
  try {
    token = await accessToken(sa);
  } catch (err) {
    console.error('[push] não consegui autenticar no FCM', err);
    return;
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  await Promise.all(
    caregivers.map(async (c) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildMessage(alert, deviceName, c.fcm_token)),
        });

        // 404 = UNREGISTERED: a app foi desinstalada ou a subscrição morreu.
        // Só neste caso se apaga — um 400 costuma ser erro do payload, e
        // apagar tokens por causa disso deixava a família sem avisos nenhuns.
        if (res.status === 404) {
          db.prepare(`UPDATE caregivers SET fcm_token = NULL WHERE id = ?`).run(c.id);
          console.warn(`[push] token do cuidador ${c.id} já não vale; apagado.`);
        } else if (!res.ok) {
          console.error(`[push] FCM devolveu ${res.status}`, await res.text());
        }
      } catch (err) {
        console.error('[push] falhou o envio', err);
      }
    }),
  );
}
