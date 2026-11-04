import { useState } from 'react';
import MapList from './MapList';
import Outline from './Outline';
import AuthModal from './AuthModal';
import { useCloud } from '../lib/cloud';

const STATUS_TEXT: Record<string, string> = {
  syncing: '同步中…',
  synced: '已同步',
  error: '同步失败，本地已保存',
};

export default function Sidebar({ open }: { open: boolean }) {
  const [tab, setTab] = useState<'outline' | 'files'>('outline');
  const [authOpen, setAuthOpen] = useState(false);
  const configured = useCloud((state) => state.configured);
  const user = useCloud((state) => state.user);
  const status = useCloud((state) => state.status);

  return (
    <aside className={`sidebar${open ? '' : ' closed'}`}>
      <div className="sidebar-tabs">
        <button type="button" className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')}>
          大纲
        </button>
        <button type="button" className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          我的导图
        </button>
      </div>
      <div className="sidebar-body">{tab === 'outline' ? <Outline /> : <MapList />}</div>

      {configured && (
        <div className="account-bar">
          {user ? (
            <>
              <div className="account-info">
                <span className="account-avatar">{(user.email ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className="account-meta">
                  <span className="account-email" title={user.email ?? ''}>
                    {user.email}
                  </span>
                  <span className={`account-status${status === 'error' ? ' warn' : ''}`}>
                    {STATUS_TEXT[status] ?? ''}
                  </span>
                </span>
              </div>
              <button type="button" className="account-logout" title="退出登录" onClick={() => void useCloud.getState().signOut()}>
                退出
              </button>
            </>
          ) : (
            <button type="button" className="account-login" onClick={() => setAuthOpen(true)}>
              登录 / 注册 · 云同步
            </button>
          )}
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </aside>
  );
}
