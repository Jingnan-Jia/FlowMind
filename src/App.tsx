import { useEffect, useState } from 'react';
import Canvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import { flushSave, queueSave } from './lib/storage';
import { useCloud } from './lib/cloud';
import { useStore } from './store';

export default function App() {
  const ready = useStore((state) => state.ready);
  const theme = useStore((state) => (state.currentId ? state.docs[state.currentId]?.theme : 'light')) ?? 'light';
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    void useStore.getState().init();
    void useCloud.getState().init();
  }, []);

  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (!state.currentId) return;
      const doc = state.docs[state.currentId];
      if (doc && doc !== previous.docs[state.currentId]) queueSave(doc);
    });
    const onUnload = (): void => flushSave();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return (
    <div className="app" data-theme={theme}>
      <Toolbar panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((open) => !open)} />
      <div className="main">
        <Sidebar open={panelOpen} />
        {ready ? <Canvas /> : <div className="boot">正在载入画布…</div>}
      </div>
    </div>
  );
}
