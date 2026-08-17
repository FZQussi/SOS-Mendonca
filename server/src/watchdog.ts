import { db, now } from './db.js';
import { createAlert } from './alerts.js';

// A janela é de 30 min por omissão — verificar a cada minuto chega, sem
// carregar o SQLite num Pi com tanto detalhe que ninguém precisa.
const CHECK_INTERVAL_MS = 60_000;

/**
 * Um dispositivo emparelhado e silencioso há mais que o limite gera
 * `device_offline`. `createAlert` já aplica o anti-spam de 6h (`alerts.ts`),
 * por isso esta função pode correr todos os minutos sem se preocupar em não
 * repetir o alerta — só precisa de tentar sempre.
 *
 * Exportada à parte de `startWatchdog` para os testes chamarem diretamente,
 * sem depender de um `setInterval` real.
 */
export function watchdogTick(thresholdMinutes: number): void {
  const cutoff = now() - thresholdMinutes * 60_000;
  const silent = db
    .prepare(
      `SELECT id FROM devices WHERE token_hash IS NOT NULL AND last_seen_at IS NOT NULL AND last_seen_at < ?`,
    )
    .all(cutoff) as { id: number }[];

  for (const { id } of silent) {
    createAlert({ deviceId: id, type: 'device_offline' });
  }
}

export function startWatchdog(
  thresholdMinutes = Number(process.env.WATCHDOG_MINUTES ?? 30),
): NodeJS.Timeout {
  return setInterval(() => watchdogTick(thresholdMinutes), CHECK_INTERVAL_MS);
}
