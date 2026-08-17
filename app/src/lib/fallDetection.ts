/**
 * Deteção de queda a partir do acelerómetro (ROADMAP §1.1).
 *
 * Este ficheiro não importa `expo-sensors` — pela mesma razão que o
 * `offlineQueue.ts` não importa o AsyncStorage: assim a parte que decide o
 * que é uma queda testa-se com `node:test` puro, sem o runtime do React
 * Native. Quem liga o sensor a sério é o `HomeScreen`.
 *
 * A assinatura de uma queda a sério não é "pancada forte" — é **queda livre
 * seguida de impacto**. Pousar o telemóvel na mesa com força dá o impacto sem
 * a queda livre; abanar o braço dá picos sem nada antes. Exigir os dois, por
 * esta ordem e dentro de uma janela curta, é o que separa uma queda de um dia
 * normal no bolso de alguém.
 *
 * Nada disto substitui os 30 segundos para cancelar: o classificador vai
 * enganar-se, e é a pessoa que tem a última palavra (princípio 4 — alertar de
 * mais é falhar).
 */

/**
 * Em queda livre o acelerómetro aproxima-se de 0 g; parado marca 1 g.
 *
 * ponytail: estes três números foram escolhidos a partir da literatura, não
 * medidos neste telemóvel. São o botão de afinação do sistema — se houver
 * falsos positivos, sobe o `impactG`; se uma queda a sério passar despercebida,
 * desce-o. Afinar com o telemóvel a sério, a deixar cair sobre uma almofada.
 */
export const FALL_DEFAULTS = {
  freeFallG: 0.5,
  impactG: 2.2,
  /** Uma queda de altura de pessoa demora menos de meio segundo. */
  windowMs: 1500,
};

export interface FallDetector {
  /** `true` uma única vez, no instante em que reconhece uma queda. */
  push(magnitudeG: number, atMs: number): boolean;
}

export function createFallDetector(options: Partial<typeof FALL_DEFAULTS> = {}): FallDetector {
  const { freeFallG, impactG, windowMs } = { ...FALL_DEFAULTS, ...options };
  let freeFallAt: number | null = null;

  return {
    push(magnitudeG, atMs) {
      if (magnitudeG < freeFallG) {
        // Guarda-se o início da queda livre; leituras seguidas abaixo do
        // limiar não reiniciam o relógio (é a mesma queda a continuar).
        freeFallAt ??= atMs;
        return false;
      }

      if (freeFallAt === null) return false;

      // Fora da janela: houve queda livre, mas o impacto nunca chegou. Pode
      // ter sido o telemóvel atirado para cima de um sofá.
      if (atMs - freeFallAt > windowMs) {
        freeFallAt = null;
        return false;
      }

      if (magnitudeG >= impactG) {
        freeFallAt = null;
        return true;
      }
      return false;
    },
  };
}

/** 20 leituras por segundo: chega para apanhar o impacto sem fritar a bateria. */
export const SAMPLE_INTERVAL_MS = 50;

/** Módulo do vetor de aceleração, em g. */
export function magnitude(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z);
}
