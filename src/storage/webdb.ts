/**
 * Petit accès IndexedDB pour la version navigateur (galerie importée, collection).
 * Toute erreur (navigation privée, stockage bloqué) retombe silencieusement en mémoire.
 */
type StoreName = 'kv' | 'cards' | 'gallery';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('pocketpics-web', 1);
        req.onupgradeneeded = () => {
          for (const s of ['kv', 'cards', 'gallery']) {
            if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function idbEntries<T>(store: StoreName): Promise<[string, T][]> {
  const db = await open();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const out: [string, T][] = [];
      const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push([String(cur.key), cur.value as T]);
        cur.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve([]);
    }
  });
}

function write(store: StoreName, fn: (s: IDBObjectStore) => void): Promise<boolean> {
  return open().then(
    (db) =>
      new Promise<boolean>((resolve) => {
        if (!db) return resolve(false);
        try {
          const tx = db.transaction(store, 'readwrite');
          fn(tx.objectStore(store));
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      }),
  );
}

export const idbPut = (store: StoreName, key: string, value: unknown) => write(store, (s) => s.put(value, key));
export const idbDelete = (store: StoreName, key: string) => write(store, (s) => s.delete(key));
export const idbClear = (store: StoreName) => write(store, (s) => s.clear());
