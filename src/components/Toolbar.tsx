import { useEffect, useRef, useState } from 'react';
import { buildSvg, downloadSvgPng, downloadText } from '../lib/export';
import { computeLayout } from '../lib/layout';
import { toMarkdown, toOpml } from '../lib/markdown';
import { useStore } from '../store';
import { LAYOUT_LABELS, type LayoutMode } from '../types';
import Modal from './Modal';

interface Props {
  panelOpen: boolean;
  onTogglePanel: () => void;
}

const LAYOUTS: LayoutMode[] = ['mindmap', 'logic', 'org'];

function Icon({ name }: { name: 'undo' | 'redo' | 'sun' | 'moon' | 'download' | 'upload' | 'help' | 'panel' }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'undo':
      return (
        <svg {...common}>
          <path d="M7.5 5.5 4 9l3.5 3.5" />
          <path d="M4 9h8a4 4 0 0 1 0 8H9" />
        </svg>
      );
    case 'redo':
      return (
        <svg {...common} style={{ transform: 'scaleX(-1)' }}>
          <path d="M7.5 5.5 4 9l3.5 3.5" />
          <path d="M4 9h8a4 4 0 0 1 0 8H9" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="3.4" />
          <path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...common}>
          <path d="M16 12.4A6.4 6.4 0 0 1 7.6 4a6.4 6.4 0 1 0 8.4 8.4Z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M10 3.5v8.5M6.5 8.8 10 12.3l3.5-3.5" />
          <path d="M4 14.5v1.2h12v-1.2" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M10 12.5V4M6.5 7.3 10 3.8l3.5 3.5" />
          <path d="M4 14.5v1.2h12v-1.2" />
        </svg>
      );
    case 'help':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" />
          <path d="M8.2 8a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.8-.9 1.5" />
          <circle cx="10" cy="13.9" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'panel':
    default:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <path d="M7.5 4v12" />
        </svg>
      );
  }
}

export default function Toolbar({ panelOpen, onTogglePanel }: Props) {
  const doc = useStore((state) => (state.currentId ? state.docs[state.currentId] ?? null : null));
  const canUndo = useStore((state) => state.past.length > 0);
  const canRedo = useStore((state) => state.future.length > 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const theme = doc?.theme ?? 'light';

  const handleExport = async (kind: 'png' | 'svg' | 'md' | 'opml' | 'json'): Promise<void> => {
    setMenuOpen(false);
    const state = useStore.getState();
    const currentDoc = state.currentId ? state.docs[state.currentId] : null;
    if (!currentDoc) return;
    const base = (currentDoc.title.trim() || 'flowmind').replace(/[\\/:*?"<>|]/g, '_');

    if (kind === 'json') {
      downloadText(`${base}.json`, JSON.stringify(currentDoc, null, 2), 'application/json;charset=utf-8');
      return;
    }
    if (kind === 'md') {
      downloadText(`${base}.md`, toMarkdown(currentDoc), 'text/markdown;charset=utf-8');
      return;
    }
    if (kind === 'opml') {
      downloadText(`${base}.opml`, toOpml(currentDoc), 'text/x-opml;charset=utf-8');
      return;
    }

    const payload = buildSvg(computeLayout(currentDoc), currentDoc.theme);
    if (kind === 'svg') {
      downloadText(`${base}.svg`, payload.svg, 'image/svg+xml;charset=utf-8');
    } else {
      await downloadSvgPng(`${base}.png`, payload);
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">F</span>
        <span className="brand-name">FlowMind</span>
      </div>

      <button type="button" className={`icon-btn${panelOpen ? ' active' : ''}`} onClick={onTogglePanel} title="收起/展开侧栏">
        <Icon name="panel" />
      </button>

      <input
        className="title-input"
        value={doc?.title ?? ''}
        placeholder="未命名导图"
        onChange={(event) => useStore.getState().renameMap(event.target.value)}
      />

      <div className="segment">
        {LAYOUTS.map((layout) => (
          <button
            key={layout}
            type="button"
            className={doc?.layout === layout ? 'active' : ''}
            onClick={() => useStore.getState().setLayout(layout)}
          >
            {LAYOUT_LABELS[layout]}
          </button>
        ))}
      </div>

      <div className="toolbar-spacer" />

      <button
        type="button"
        className="icon-btn"
        disabled={!canUndo}
        title="撤销 ⌘Z"
        onClick={() => useStore.getState().undo()}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={!canRedo}
        title="重做 ⇧⌘Z"
        onClick={() => useStore.getState().redo()}
      >
        <Icon name="redo" />
      </button>

      <button
        type="button"
        className="icon-btn"
        title={theme === 'light' ? '切换到暗色' : '切换到亮色'}
        onClick={() => useStore.getState().setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        <Icon name={theme === 'light' ? 'moon' : 'sun'} />
      </button>

      <button type="button" className="icon-btn" title="从 Markdown 导入" onClick={() => setImportOpen(true)}>
        <Icon name="upload" />
      </button>

      <div className="menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="icon-btn"
          title="导出"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name="download" />
        </button>
        {menuOpen && (
          <div className="dropdown">
            <button type="button" onClick={() => void handleExport('png')}>
              导出 PNG 图片
            </button>
            <button type="button" onClick={() => void handleExport('svg')}>
              导出 SVG 矢量图
            </button>
            <div className="dropdown-sep" />
            <button type="button" onClick={() => void handleExport('md')}>
              导出 Markdown 大纲
            </button>
            <button type="button" onClick={() => void handleExport('opml')}>
              导出 OPML（兼容其他导图工具）
            </button>
            <button type="button" onClick={() => void handleExport('json')}>
              导出 JSON（备份）
            </button>
          </div>
        )}
      </div>

      <button type="button" className="icon-btn" title="快捷键" onClick={() => setHelpOpen(true)}>
        <Icon name="help" />
      </button>

      {importOpen && (
        <Modal
          title="从 Markdown 导入"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={!importText.trim()}
                onClick={() => {
                  useStore.getState().importMarkdown(importText);
                  setImportText('');
                  setImportOpen(false);
                }}
              >
                生成导图
              </button>
            </>
          }
        >
          <p className="modal-tip">
            支持 <code>#</code> 标题或 <code>-</code> 列表的层级结构，粘贴后会自动生成一张新导图。
          </p>
          <textarea
            className="import-area"
            value={importText}
            spellCheck={false}
            placeholder={'# 产品规划\n- 用户调研\n  - 访谈 10 位用户\n- 功能设计\n  - 即开即画'}
            onChange={(event) => setImportText(event.target.value)}
          />
        </Modal>
      )}

      {helpOpen && (
        <Modal title="键盘快捷键" onClose={() => setHelpOpen(false)}>
          <div className="shortcut-grid">
            <span>新建子节点</span>
            <span>
              <kbd>Tab</kbd>
            </span>
            <span>新建同级节点</span>
            <span>
              <kbd>Enter</kbd>
            </span>
            <span>节点内换行</span>
            <span>
              <kbd>Shift</kbd> + <kbd>Enter</kbd>
            </span>
            <span>编辑节点</span>
            <span>
              直接输入 / <kbd>F2</kbd> / 单击
            </span>
            <span>删除节点</span>
            <span>
              <kbd>Delete</kbd>
            </span>
            <span>在节点间移动</span>
            <span>方向键</span>
            <span>撤销 / 重做</span>
            <span>
              <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd>
            </span>
            <span>缩放画布</span>
            <span>
              <kbd>⌘</kbd> + 滚轮
            </span>
            <span>拖拽改父级</span>
            <span>按住节点拖到目标节点上</span>
            <span>折叠 / 展开</span>
            <span>点击节点右侧数字小球</span>
          </div>
        </Modal>
      )}
    </header>
  );
}
