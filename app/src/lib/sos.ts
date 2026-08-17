import { Vibration } from 'react-native';
import { callDirectly } from './call';
import { deviceApi } from './api';
import { getCurrentLocation } from './location';
import { alertQueue } from './queues';

/**
 * A ordem é a funcionalidade (Context.md §5, princípio 2): vibrar, ligar, só
 * depois GPS e rede. Nenhum `await` antes da chamada — a rede de voz
 * funciona onde os dados falham, e a pessoa precisa de ouvir alguém, não de
 * saber que um servidor recebeu um JSON.
 *
 * `type` distingue o botão (`sos`) da deteção de queda (`fall`); o resto do
 * caminho é o mesmo, porque a urgência também é.
 */
export async function triggerSos(primaryPhone: string | null, type: 'sos' | 'fall' = 'sos'): Promise<void> {
  Vibration.vibrate(400);
  if (primaryPhone) callDirectly(primaryPhone);

  const recordedAt = Date.now();
  const loc = await getCurrentLocation().catch(() => null);

  try {
    await deviceApi.sendAlert(type, { lat: loc?.lat, lon: loc?.lon, recorded_at: recordedAt });
  } catch {
    // Sem rede agora — fica na fila e sai assim que houver ligação
    // (Context.md princípio 3: nunca se limpa sem confirmação de sucesso).
    await alertQueue.enqueue({ type, lat: loc?.lat, lon: loc?.lon, recordedAt });
  }
}
