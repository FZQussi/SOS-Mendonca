/**
 * O suficiente do AsyncStorage para a fila funcionar, e nada mais. Este
 * ficheiro não importa `@react-native-async-storage/async-storage` — fica
 * assim testável com `node:test` puro, sem o runtime do React Native. Quem
 * usa a fila a sério (`queues.ts`) é que passa o AsyncStorage real
 * (Context.md: "Tudo funciona offline e reenvia depois").
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface Queue<T> {
  enqueue(item: T): Promise<void>;
  /** Limpa só se `send` não lançar — nunca perde dados por causa de uma falha de rede. */
  flush(send: (items: T[]) => Promise<void>): Promise<void>;
  size(): Promise<number>;
}

export function createQueue<T>(storageKey: string, store: KeyValueStore): Queue<T> {
  async function read(): Promise<T[]> {
    const raw = await store.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T[]) : [];
  }
  async function write(items: T[]): Promise<void> {
    await store.setItem(storageKey, JSON.stringify(items));
  }

  return {
    async enqueue(item) {
      const items = await read();
      items.push(item);
      await write(items);
    },
    async flush(send) {
      const items = await read();
      if (items.length === 0) return;
      await send(items);
      await write([]);
    },
    async size() {
      return (await read()).length;
    },
  };
}
