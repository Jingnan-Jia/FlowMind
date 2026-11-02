import { useState } from 'react';
import MapList from './MapList';
import Outline from './Outline';

export default function Sidebar({ open }: { open: boolean }) {
  const [tab, setTab] = useState<'outline' | 'files'>('outline');

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
    </aside>
  );
}
