import { create } from 'zustand';
import type { Doc, LayoutMode, Marker, MindNode, ThemeMode } from './types';
import { uid } from './lib/id';
import { docFromParsed, parseOutline } from './lib/markdown';
import { loadAll, queueSave, removeDoc as removeDocFromStore, saveDoc } from './lib/storage';
import { bindLocalBridge } from './lib/cloud';

const LAST_KEY = 'flowmind:last';
const HISTORY_LIMIT = 60;

let initializing = false;

export function blankDoc(title = '未命名导图', rootText = ''): Doc {
  const rootId = uid();
  const now = Date.now();
  return {
    id: uid(),
    title,
    rootId,
    nodes: { [rootId]: { id: rootId, text: rootText, children: [] } },
    layout: 'mindmap',
    theme: 'light',
    createdAt: now,
    updatedAt: now,
  };
}

function findParent(doc: Doc, id: string): string | null {
  for (const key of Object.keys(doc.nodes)) {
    const node = doc.nodes[key];
    if (node && node.children.includes(id)) return key;
  }
  return null;
}

function collectDescendants(doc: Doc, id: string, acc: Set<string> = new Set()): Set<string> {
  const node = doc.nodes[id];
  if (!node) return acc;
  for (const childId of node.children) {
    if (acc.has(childId) || !doc.nodes[childId]) continue;
    acc.add(childId);
    collectDescendants(doc, childId, acc);
  }
  return acc;
}

export interface AppState {
  docs: Record<string, Doc>;
  currentId: string | null;
  selectedId: string | null;
  editingId: string | null;
  past: Doc[];
  future: Doc[];
  fitToken: number;
  focus: { id: string; token: number } | null;
  ready: boolean;
  init: () => Promise<void>;
  select: (id: string | null) => void;
  startEdit: (id: string, seed?: string) => void;
  stopEdit: () => void;
  setText: (id: string, text: string) => void;
  setTextWithHistory: (id: string, text: string) => void;
  commitEditing: (id: string, text: string) => void;
  addChild: (parentId: string) => string | null;
  addSibling: (id: string) => string | null;
  deleteNode: (id: string) => void;
  moveNode: (id: string, targetId: string) => void;
  toggleCollapse: (id: string) => void;
  setMarker: (id: string, marker: Marker | null) => void;
  setLayout: (layout: LayoutMode) => void;
  setTheme: (theme: ThemeMode) => void;
  renameMap: (title: string) => void;
  newMap: (title?: string) => void;
  openMap: (id: string) => void;
  removeMap: (id: string) => void;
  importMarkdown: (markdown: string) => void;
  undo: () => void;
  redo: () => void;
  requestFit: () => void;
  focusNode: (id: string) => void;
  /** 云端拉取的文档合并进本地（云端较新时由云同步层调用） */
  applyRemoteDocs: (docs: Doc[]) => void;
}

export const useStore = create<AppState>()((set, get) => {
  const current = (): Doc | null => {
    const { docs, currentId } = get();
    return currentId ? docs[currentId] ?? null : null;
  };

  const commit = (next: Doc, history = true): void => {
    const state = get();
    const previous = current();
    if (!previous) return;
    const past = history ? [...state.past, structuredClone(previous)].slice(-HISTORY_LIMIT) : state.past;
    set({
      docs: { ...state.docs, [next.id]: { ...next, updatedAt: Date.now() } },
      past,
      future: history ? [] : state.future,
    });
  };

  return {
    docs: {},
    currentId: null,
    selectedId: null,
    editingId: null,
    past: [],
    future: [],
    fitToken: 0,
    focus: null,
    ready: false,

    init: async () => {
      if (initializing || get().ready) return;
      initializing = true;
      const all = await loadAll();
      const docs: Record<string, Doc> = {};
      for (const doc of all) docs[doc.id] = doc;

      let currentId: string | null = null;
      try {
        currentId = localStorage.getItem(LAST_KEY);
      } catch {
        currentId = null;
      }

      if (!currentId || !docs[currentId]) {
        const latest = all.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
        currentId = latest?.id ?? null;
      }

      if (!currentId) {
        const doc = blankDoc();
        docs[doc.id] = doc;
        currentId = doc.id;
        void saveDoc(doc);
      }

      const doc = docs[currentId];
      set({
        docs,
        currentId,
        ready: true,
        selectedId: doc.rootId,
        editingId: doc.nodes[doc.rootId]?.text ? null : doc.rootId,
      });
      try {
        localStorage.setItem(LAST_KEY, currentId);
      } catch {
        /* ignore */
      }
    },

    select: (id) => set({ selectedId: id }),

    startEdit: (id, seed) => {
      const doc = current();
      if (!doc || !doc.nodes[id]) return;
      set({
        selectedId: id,
        editingId: id,
        past: [...get().past, structuredClone(doc)].slice(-HISTORY_LIMIT),
        future: [],
      });
      if (seed !== undefined) get().setText(id, seed);
    },

    stopEdit: () => set({ editingId: null }),

    setText: (id, text) => {
      const doc = current();
      const node = doc?.nodes[id];
      if (!doc || !node) return;
      commit({ ...doc, nodes: { ...doc.nodes, [id]: { ...node, text } } }, false);
    },

    setTextWithHistory: (id, text) => {
      const doc = current();
      const node = doc?.nodes[id];
      if (!doc || !node || node.text === text) return;
      commit({ ...doc, nodes: { ...doc.nodes, [id]: { ...node, text } } });
    },

    commitEditing: (id, text) => {
      const doc = current();
      const node = doc?.nodes[id];
      if (!doc || !node) {
        set({ editingId: null });
        return;
      }
      const trimmed = text.replace(/\s+$/, '');
      if (!trimmed.trim() && id !== doc.rootId && node.children.length === 0) {
        get().deleteNode(id);
        set({ editingId: null });
        return;
      }
      if (trimmed !== node.text) get().setText(id, trimmed);
      set({ editingId: null });
    },

    addChild: (parentId) => {
      const doc = current();
      const parent = doc?.nodes[parentId];
      if (!doc || !parent) return null;
      const id = uid();
      const node: MindNode = { id, text: '', children: [] };
      commit({
        ...doc,
        nodes: {
          ...doc.nodes,
          [id]: node,
          [parentId]: { ...parent, collapsed: false, children: [...parent.children, id] },
        },
      });
      set({ selectedId: id, editingId: id });
      return id;
    },

    addSibling: (id) => {
      const doc = current();
      if (!doc) return null;
      const parentId = findParent(doc, id);
      if (!parentId) return get().addChild(id);
      const parent = doc.nodes[parentId];
      const newId = uid();
      const index = parent.children.indexOf(id);
      const children = [...parent.children];
      children.splice(index + 1, 0, newId);
      commit({
        ...doc,
        nodes: {
          ...doc.nodes,
          [newId]: { id: newId, text: '', children: [] },
          [parentId]: { ...parent, collapsed: false, children },
        },
      });
      set({ selectedId: newId, editingId: newId });
      return newId;
    },

    deleteNode: (id) => {
      const doc = current();
      if (!doc || id === doc.rootId) return;
      const parentId = findParent(doc, id);
      if (!parentId) return;
      const doomed = new Set<string>([id, ...collectDescendants(doc, id)]);
      const nodes = { ...doc.nodes };
      doomed.forEach((key) => delete nodes[key]);
      const parent = nodes[parentId];
      if (!parent) return;
      nodes[parentId] = { ...parent, children: parent.children.filter((child) => child !== id) };
      commit({ ...doc, nodes });
      const selected = get().selectedId;
      set({
        selectedId: selected && doomed.has(selected) ? parentId : selected ?? parentId,
        editingId: null,
      });
    },

    moveNode: (id, targetId) => {
      if (id === targetId) return;
      const doc = current();
      if (!doc || id === doc.rootId) return;
      const subtree = collectDescendants(doc, id);
      if (subtree.has(targetId)) return;
      const parentId = findParent(doc, id);
      const target = doc.nodes[targetId];
      const parent = parentId ? doc.nodes[parentId] : null;
      if (!parentId || !parent || !target) return;
      if (target.children.includes(id)) return;
      commit({
        ...doc,
        nodes: {
          ...doc.nodes,
          [parentId]: { ...parent, children: parent.children.filter((child) => child !== id) },
          [targetId]: { ...target, collapsed: false, children: [...target.children, id] },
        },
      });
      set({ selectedId: id });
    },

    toggleCollapse: (id) => {
      const doc = current();
      const node = doc?.nodes[id];
      if (!doc || !node || !node.children.length) return;
      commit({ ...doc, nodes: { ...doc.nodes, [id]: { ...node, collapsed: !node.collapsed } } });
      const selected = get().selectedId;
      if (selected && selected !== id && collectDescendants(doc, id).has(selected)) {
        set({ selectedId: id, editingId: null });
      }
    },

    setMarker: (id, marker) => {
      const doc = current();
      const node = doc?.nodes[id];
      if (!doc || !node) return;
      commit({ ...doc, nodes: { ...doc.nodes, [id]: { ...node, marker: marker ?? undefined } } }, false);
    },

    setLayout: (layout) => {
      const doc = current();
      if (!doc) return;
      commit({ ...doc, layout });
    },

    setTheme: (theme) => {
      const doc = current();
      if (!doc) return;
      commit({ ...doc, theme }, false);
    },

    renameMap: (title) => {
      const doc = current();
      if (!doc) return;
      commit({ ...doc, title }, false);
    },

    newMap: (title) => {
      const doc = blankDoc(title ?? '未命名导图');
      set({
        docs: { ...get().docs, [doc.id]: doc },
        currentId: doc.id,
        selectedId: doc.rootId,
        editingId: doc.rootId,
        past: [],
        future: [],
      });
      void saveDoc(doc);
      try {
        localStorage.setItem(LAST_KEY, doc.id);
      } catch {
        /* ignore */
      }
    },

    openMap: (id) => {
      const doc = get().docs[id];
      if (!doc) return;
      set({
        currentId: id,
        selectedId: doc.rootId,
        editingId: doc.nodes[doc.rootId]?.text ? null : doc.rootId,
        past: [],
        future: [],
      });
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {
        /* ignore */
      }
    },

    removeMap: (id) => {
      const state = get();
      const docs = { ...state.docs };
      delete docs[id];
      void removeDocFromStore(id);
      if (state.currentId !== id) {
        set({ docs });
        return;
      }
      const nextId = Object.keys(docs).sort((a, b) => docs[b].updatedAt - docs[a].updatedAt)[0];
      if (!nextId) {
        set({ docs });
        get().newMap();
        return;
      }
      const next = docs[nextId];
      set({
        docs,
        currentId: nextId,
        selectedId: next.rootId,
        editingId: null,
        past: [],
        future: [],
      });
      try {
        localStorage.setItem(LAST_KEY, nextId);
      } catch {
        /* ignore */
      }
    },

    importMarkdown: (markdown) => {
      const parsed = parseOutline(markdown);
      if (!parsed.length) return;
      const title = parsed.length === 1 ? parsed[0].text.slice(0, 40) || '导入的导图' : '导入的导图';
      const doc = docFromParsed(parsed, title);
      set({
        docs: { ...get().docs, [doc.id]: doc },
        currentId: doc.id,
        selectedId: doc.rootId,
        editingId: null,
        past: [],
        future: [],
        fitToken: get().fitToken + 1,
      });
      void saveDoc(doc);
      try {
        localStorage.setItem(LAST_KEY, doc.id);
      } catch {
        /* ignore */
      }
    },

    undo: () => {
      const state = get();
      const doc = current();
      const previous = state.past[state.past.length - 1];
      if (!doc || !previous) return;
      const selected = state.selectedId;
      set({
        docs: { ...state.docs, [previous.id]: previous },
        past: state.past.slice(0, -1),
        future: [structuredClone(doc), ...state.future].slice(0, HISTORY_LIMIT),
        editingId: null,
        selectedId: selected && previous.nodes[selected] ? selected : previous.rootId,
      });
      queueSave(previous);
    },

    redo: () => {
      const state = get();
      const doc = current();
      const next = state.future[0];
      if (!doc || !next) return;
      const selected = state.selectedId;
      set({
        docs: { ...state.docs, [next.id]: next },
        past: [...state.past, structuredClone(doc)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        editingId: null,
        selectedId: selected && next.nodes[selected] ? selected : next.rootId,
      });
      queueSave(next);
    },

    requestFit: () => set({ fitToken: get().fitToken + 1 }),

    focusNode: (id) => set({ focus: { id, token: Date.now() } }),

    applyRemoteDocs: (incoming) => {
      const state = get();
      const docs = { ...state.docs };
      let changed = false;
      for (const doc of incoming) {
        if (!doc?.id || !doc.nodes || !doc.rootId) continue;
        const local = docs[doc.id];
        if (local && local.updatedAt >= doc.updatedAt) continue;
        docs[doc.id] = doc;
        changed = true;
        void saveDoc(doc);
      }
      if (changed) set({ docs });
    },
  };
});

/* 云同步桥接：让 cloud.ts 读写主 store（避免循环依赖，运行时注入） */
bindLocalBridge({
  useLocalDocs: () => Object.values(useStore.getState().docs),
  useLocalGet: (id) => useStore.getState().docs[id],
  applyRemote: (docs) => useStore.getState().applyRemoteDocs(docs),
});
