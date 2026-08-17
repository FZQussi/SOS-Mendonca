import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, type KeyValueStore } from './offlineQueue.js';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
}

test('fila vazia: flush não chama send', async () => {
  const queue = createQueue<number>('q', memoryStore());
  let called = false;
  await queue.flush(async () => {
    called = true;
  });
  assert.equal(called, false);
});

test('enqueue acumula, flush envia tudo de uma vez', async () => {
  const queue = createQueue<{ lat: number }>('q', memoryStore());
  await queue.enqueue({ lat: 1 });
  await queue.enqueue({ lat: 2 });
  await queue.enqueue({ lat: 3 });
  assert.equal(await queue.size(), 3);

  const received: { lat: number }[][] = [];
  await queue.flush(async (items) => {
    received.push(items);
  });

  assert.deepEqual(received, [[{ lat: 1 }, { lat: 2 }, { lat: 3 }]]);
});

test('flush limpa a fila só depois de send ter sucesso', async () => {
  const queue = createQueue<number>('q', memoryStore());
  await queue.enqueue(1);
  await queue.flush(async () => {});
  assert.equal(await queue.size(), 0);
});

test('send que falha não limpa nada — a fila fica intacta para a próxima tentativa', async () => {
  const queue = createQueue<number>('q', memoryStore());
  await queue.enqueue(1);
  await queue.enqueue(2);

  await assert.rejects(
    queue.flush(async () => {
      throw new Error('sem rede');
    }),
  );

  assert.equal(await queue.size(), 2, 'nada devia ter sido apagado');
});

test('itens postos na fila depois de um flush falhado juntam-se aos antigos', async () => {
  const queue = createQueue<number>('q', memoryStore());
  await queue.enqueue(1);
  await assert.rejects(
    queue.flush(async () => {
      throw new Error('sem rede');
    }),
  );
  await queue.enqueue(2);

  const received: number[][] = [];
  await queue.flush(async (items) => {
    received.push(items);
  });
  assert.deepEqual(received, [[1, 2]]);
});

test('duas filas com chaves diferentes não se misturam', async () => {
  const store = memoryStore();
  const locations = createQueue<string>('locations', store);
  const alerts = createQueue<string>('alerts', store);

  await locations.enqueue('ponto-1');
  await alerts.enqueue('sos-1');

  assert.equal(await locations.size(), 1);
  assert.equal(await alerts.size(), 1);
});
