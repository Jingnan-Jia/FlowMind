import { useEffect, useRef, useState } from 'react';
import type { LaidNode } from '../lib/layout';
import { LINE_HEIGHT, PAD_X, PAD_Y } from '../lib/text';
import { nodeStyle } from '../lib/theme';
import { useStore } from '../store';
import type { ThemeMode } from '../types';

interface Props {
  laid: LaidNode;
  theme: ThemeMode;
}

export default function NodeEditor({ laid, theme }: Props) {
  const [value, setValue] = useState(() => {
    const state = useStore.getState();
    const doc = state.currentId ? state.docs[state.currentId] : null;
    return doc?.nodes[laid.id]?.text ?? '';
  });
  const valueRef = useRef(value);
  const committed = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const style = nodeStyle(laid.depth, laid.color, theme);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const commit = (after?: () => void): void => {
    if (committed.current) return;
    committed.current = true;
    useStore.getState().commitEditing(laid.id, valueRef.current);
    after?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const state = useStore.getState();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit(() => state.addSibling(laid.id));
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commit(() => state.addChild(laid.id));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Backspace' && valueRef.current === '') {
      event.preventDefault();
      commit(() => state.deleteNode(laid.id));
    }
  };

  return (
    <textarea
      ref={textareaRef}
      className="node-editor"
      value={value}
      spellCheck={false}
      placeholder={laid.depth === 0 ? '中心主题' : '输入内容'}
      style={{
        left: laid.x - laid.w / 2,
        top: laid.y - laid.h / 2,
        width: laid.w,
        height: laid.h,
        fontSize: laid.fontSize,
        fontWeight: laid.depth === 0 ? 600 : 450,
        lineHeight: `${LINE_HEIGHT}px`,
        padding: `${PAD_Y}px ${PAD_X}px`,
        color: style.text,
        caretColor: style.text,
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        valueRef.current = next;
        useStore.getState().setText(laid.id, next);
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => commit()}
    />
  );
}
