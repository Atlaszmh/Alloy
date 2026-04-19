import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';

const devCache = (globalThis as typeof globalThis & { __alloyStoreCache?: Map<string, unknown> });
devCache.__alloyStoreCache ??= new Map();

export function createHmrStore<T>(key: string, creator: StateCreator<T>): UseBoundStore<StoreApi<T>> {
  if (!import.meta.env.DEV) return create<T>(creator);
  const cache = devCache.__alloyStoreCache!;
  const existing = cache.get(key) as UseBoundStore<StoreApi<T>> | undefined;
  if (existing) return existing;
  const store = create<T>(creator);
  cache.set(key, store);
  return store;
}
