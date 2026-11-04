/**
 * 云同步层（腾讯云 CloudBase）
 *
 * 设计原则：
 * - local-first：本地 IndexedDB 始终是主存储，云端只是镜像，断网/未登录完全不影响使用
 * - 优雅降级：未配置环境（VITE_TCB_ENV）时所有云能力自动禁用，UI 隐藏入口
 * - 合并策略：按文档 updatedAt 做 last-write-wins，粒度为整张导图
 *
 * 环境配置（三选一，优先级从高到低）：
 * 1. localStorage: flowmind:tcb-env / flowmind:tcb-ak / flowmind:tcb-region
 * 2. 构建期环境变量: VITE_TCB_ENV / VITE_TCB_ACCESS_KEY / VITE_TCB_REGION
 * 3. 未配置 → 云功能禁用
 *
 * 登录方式：邮箱 + 验证码（signInWithOtp），注册与登录一体化，
 * 需在 CloudBase 控制台开启「邮箱登录」并配置发件邮箱。
 */
import { create } from 'zustand';
import type { Doc } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LS_ENV = 'flowmind:tcb-env';
const LS_AK = 'flowmind:tcb-ak';
const LS_REGION = 'flowmind:tcb-region';
const COLLECTION = 'mindmaps';
const OTP_RESEND_SECONDS = 60;

export interface CloudUser {
  id: string;
  email: string | null;
}

export type SyncStatus = 'disabled' | 'signed-out' | 'sending-code' | 'verifying' | 'syncing' | 'synced' | 'error';

interface CloudState {
  configured: boolean;
  user: CloudUser | null;
  status: SyncStatus;
  errorMessage: string;
  otpSentTo: string | null;
  otpCountdown: number;
  /** 初始化 SDK 并恢复登录态 */
  init: () => Promise<void>;
  /** 发送邮箱验证码（未注册账号会自动走注册流程） */
  sendOtp: (email: string) => Promise<void>;
  /** 提交验证码完成登录/注册，随后自动双向同步 */
  verifyOtp: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** 双向合并：拉取云端 → 按 updatedAt 合并 → 推送本地较新的文档 */
  syncAll: () => Promise<void>;
  /** 单文档推送（保存时防抖调用，静默失败不阻塞编辑） */
  pushDoc: (doc: Doc) => void;
  removeRemote: (id: string) => void;
}

/* ---------------- SDK 懒加载与初始化 ---------------- */

let app: any = null;
let auth: any = null;
let db: any = null;
let initPromise: Promise<boolean> | null = null;
/** signInWithOtp 成功后返回的待验证会话，verifyOtp 时使用 */
let pendingOtpSession: { verifyOtp: (args: { token: string }) => Promise<any> } | null = null;

function readConf(key: string, lsKey: string, viteKey: string): string {
  try {
    const fromLs = localStorage.getItem(lsKey);
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  return ((import.meta as any).env?.[viteKey] as string) ?? '';
}

export function getEnvId(): string {
  return readConf('env', LS_ENV, 'VITE_TCB_ENV');
}

function getAccessKey(): string {
  return readConf('ak', LS_AK, 'VITE_TCB_ACCESS_KEY');
}

function getRegion(): string {
  return readConf('region', LS_REGION, 'VITE_TCB_REGION') || 'ap-shanghai';
}

export const isConfigured = (): boolean => Boolean(getEnvId());

async function ensureApp(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const env = getEnvId();
    if (!env) return false;
    const mod = await import('@cloudbase/js-sdk');
    const cloudbase = mod.default;
    const options: Record<string, unknown> = {
      env,
      region: getRegion(),
      auth: { detectSessionInUrl: true },
    };
    const accessKey = getAccessKey();
    if (accessKey) options.accessKey = accessKey;
    app = cloudbase.init(options);
    auth = app.auth;
    db = typeof app.database === 'function' ? app.database() : null;
    return true;
  })().catch((error) => {
    console.error('[FlowMind] CloudBase 初始化失败：', error);
    return false;
  });
  return initPromise;
}

/* ---------------- 数据库读写 ---------------- */

interface CloudRecord {
  uid: string;
  docId: string;
  title: string;
  payload: Doc;
  updatedAt: number;
}

function toRecord(doc: Doc, userId: string): CloudRecord {
  return {
    docId: doc.id,
    uid: userId,
    title: doc.title,
    payload: doc,
    updatedAt: doc.updatedAt,
  };
}

async function fetchRemoteDocs(userId: string): Promise<Doc[]> {
  if (!db) return [];
  const res = await db.collection(COLLECTION).where({ uid: userId }).limit(1000).get();
  const records: CloudRecord[] = res?.data ?? [];
  return records
    .map((record) => record?.payload)
    .filter((payload): payload is Doc => Boolean(payload?.id && payload?.nodes && payload?.rootId));
}

async function upsertRemoteDoc(doc: Doc, userId: string): Promise<void> {
  if (!db) return;
  const data = toRecord(doc, userId);
  // 以本地 doc.id 作为云端文档 _id，保证两端一一对应
  await db.collection(COLLECTION).doc(doc.id).set({ data });
}

async function deleteRemoteDoc(id: string): Promise<void> {
  if (!db) return;
  await db.collection(COLLECTION).doc(id).remove();
}

/* ---------------- 状态存储 ---------------- */

export const useCloud = create<CloudState>()((set, get) => {
  let pushTimer: number | undefined;
  let countdownTimer: number | undefined;

  const setError = (message: string): void => set({ status: 'error', errorMessage: message });
  const setStatus = (status: SyncStatus): void => set({ status, errorMessage: '' });

  const startCountdown = (): void => {
    set({ otpCountdown: OTP_RESEND_SECONDS });
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(() => {
      const next = get().otpCountdown - 1;
      set({ otpCountdown: Math.max(0, next) });
      if (next <= 0) window.clearInterval(countdownTimer);
    }, 1000);
  };

  return {
    configured: isConfigured(),
    user: null,
    status: isConfigured() ? 'signed-out' : 'disabled',
    errorMessage: '',
    otpSentTo: null,
    otpCountdown: 0,

    init: async () => {
      if (!get().configured) return;
      const ok = await ensureApp();
      if (!ok) {
        set({ status: 'error', errorMessage: '云服务初始化失败，当前仅本地保存' });
        return;
      }
      try {
        const { data } = await auth.getUser();
        const user = data?.user;
        if (user && !user.is_anonymous) {
          set({ user: { id: user.id, email: user.email ?? null } });
          setStatus('syncing');
          await get().syncAll();
        } else {
          setStatus('signed-out');
        }
      } catch (error) {
        console.error('[FlowMind] 恢复登录态失败：', error);
        setStatus('signed-out');
      }
    },

    sendOtp: async (email) => {
      const ok = await ensureApp();
      if (!ok) return setError('云服务不可用');
      setStatus('sending-code');
      try {
        const { data, error } = await auth.signInWithOtp({ email });
        if (error) throw error;
        pendingOtpSession = data ?? null;
        set({ otpSentTo: email });
        startCountdown();
        setStatus('signed-out');
      } catch (error: any) {
        setError(error?.message || '验证码发送失败，请稍后重试');
      }
    },

    verifyOtp: async (email, code) => {
      const ok = await ensureApp();
      if (!ok) {
        setError('云服务不可用');
        return false;
      }
      if (!pendingOtpSession?.verifyOtp) {
        setError('请先获取验证码');
        return false;
      }
      setStatus('verifying');
      try {
        const { error } = await pendingOtpSession.verifyOtp({ token: code });
        if (error) throw error;
        const { data: userData } = await auth.getUser();
        const user = userData?.user;
        if (!user) throw new Error('登录失败，请重试');
        pendingOtpSession = null;
        set({ user: { id: user.id, email: user.email ?? email }, otpSentTo: null, otpCountdown: 0 });
        setStatus('syncing');
        await get().syncAll();
        return true;
      } catch (error: any) {
        setError(error?.message || '验证码错误或已过期');
        return false;
      }
    },

    signOut: async () => {
      try {
        await auth?.signOut?.();
      } catch {
        /* ignore */
      }
      set({ user: null, otpSentTo: null, otpCountdown: 0 });
      setStatus('signed-out');
    },

    syncAll: async () => {
      const user = get().user;
      if (!user || !db) return;
      setStatus('syncing');
      try {
        const remoteDocs = await fetchRemoteDocs(user.id);
        const localDocs = Object.values(useLocalDocs());
        const remoteById = new Map(remoteDocs.map((doc) => [doc.id, doc]));

        // 1) 云端较新或本地缺失 → 应用到本地
        const applied: Doc[] = [];
        for (const remote of remoteDocs) {
          const local = useLocalGet(remote.id);
          if (!local || remote.updatedAt > local.updatedAt) {
            applied.push(remote);
          }
        }
        if (applied.length) applyRemote(applied);

        // 2) 本地较新或云端缺失 → 推送到云端
        for (const doc of localDocs) {
          const remote = remoteById.get(doc.id);
          if (!remote || doc.updatedAt > remote.updatedAt) {
            await upsertRemoteDoc({ ...doc, updatedAt: Math.max(doc.updatedAt, remote?.updatedAt ?? 0) }, user.id);
          }
        }
        setStatus('synced');
      } catch (error: any) {
        console.error('[FlowMind] 云同步失败：', error);
        setError(error?.message || '云同步失败');
      }
    },

    pushDoc: (doc) => {
      const user = get().user;
      if (!user || get().status === 'disabled') return;
      window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => {
        const current = get().user;
        if (!current) return;
        upsertRemoteDoc(doc, current.id)
          .then(() => {
            if (get().status !== 'error') setStatus('synced');
          })
          .catch((error) => {
            console.error('[FlowMind] 推送失败：', error);
            setError('云端保存失败，已保留本地副本');
          });
      }, 600);
    },

    removeRemote: (id) => {
      const user = get().user;
      if (!user) return;
      deleteRemoteDoc(id).catch((error) => console.error('[FlowMind] 云端删除失败：', error));
    },
  };
});

/* ---------------- 与主 store 的桥接（避免循环依赖，运行时注入） ---------------- */

type LocalBridge = {
  useLocalDocs: () => Doc[];
  useLocalGet: (id: string) => Doc | undefined;
  applyRemote: (docs: Doc[]) => void;
};

let bridge: LocalBridge = {
  useLocalDocs: () => [],
  useLocalGet: () => undefined,
  applyRemote: () => undefined,
};

export function bindLocalBridge(b: LocalBridge): void {
  bridge = b;
}

function useLocalDocs(): Doc[] {
  return bridge.useLocalDocs();
}

function useLocalGet(id: string): Doc | undefined {
  return bridge.useLocalGet(id);
}

function applyRemote(docs: Doc[]): void {
  bridge.applyRemote(docs);
}
