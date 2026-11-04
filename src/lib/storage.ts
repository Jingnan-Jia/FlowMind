import type { Doc } from '../types';
import { useCloud } from './cloud';

const DB_NAME = 'flowmind';
const DB_VERSION = 1;
const STORE = 'docs';
const LS_KEY = 'flowmind:docs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function readLocal(): Doc[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Doc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(docs: Doc[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(docs));
  } catch {
    /* 存储不可用时静默失败，内存中仍可继续使用 */
  }
}

function upsertLocal(doc: Doc): void {
  const docs = readLocal();
  const index = docs.findIndex((item) => item.id === doc.id);
  if (index >= 0) docs[index] = doc;
  else docs.push(doc);
  writeLocal(docs);
}

function removeLocal(id: string): void {
  writeLocal(readLocal().filter((item) => item.id !== id));
}

export async function loadAll(): Promise<Doc[]> {
  try {
    const db = await openDb();
    return await new Promise<Doc[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as Doc[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return readLocal();
  }
}

export async function saveDoc(doc: Doc): Promise<void> {
  upsertLocal(doc);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB 不可用时依赖 localStorage */
  }
  // 已登录时异步推送云端（内部自带防抖，失败静默不影响本地编辑）
  useCloud.getState().pushDoc(doc);
}

export async function removeDoc(id: string): Promise<void> {
  removeLocal(id);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
  useCloud.getState().removeRemote(id);
}

let saveTimer: number | undefined;
let pendingDoc: Doc | null = null;

export function queueSave(doc: Doc): void {
  pendingDoc = doc;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (pendingDoc) void saveDoc(pendingDoc);
    pendingDoc = null;
  }, 250);
}

export function flushSave(): void {
  window.clearTimeout(saveTimer);
  if (pendingDoc) void saveDoc(pendingDoc);
  pendingDoc = null;
}
