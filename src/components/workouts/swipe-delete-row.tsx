'use client';

import { useRef, useState, type ReactNode } from 'react';

const ACTION_WIDTH = 96;
/** Movimento mínimo (px) antes de decidir se o gesto é horizontal ou vertical. */
const INTENT_THRESHOLD = 8;

interface SwipeDeleteRowProps {
  children: ReactNode;
  /** Chamado ao tocar em "Excluir" revelado. NÃO exclui: só pede a confirmação. */
  onRequestDelete: () => void;
  label?: string;
}

/**
 * Linha que revela "Excluir" ao deslizar para a ESQUERDA. O gesto só decide
 * a direção depois de um pequeno movimento: se for vertical, o navegador rola a
 * página normalmente (`touch-action: pan-y`) e a linha não se mexe. Deslizar
 * nunca exclui nada; apenas expõe o botão.
 */
export function SwipeDeleteRow({ children, onRequestDelete, label = 'Excluir' }: SwipeDeleteRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);

  const open = offset <= -ACTION_WIDTH / 2;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: offset };
    axis.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (axis.current === null) {
      if (Math.abs(dx) < INTENT_THRESHOLD && Math.abs(dy) < INTENT_THRESHOLD) return;
      axis.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
      if (axis.current === 'x') setDragging(true);
    }
    if (axis.current !== 'x') return;
    setOffset(Math.max(-ACTION_WIDTH, Math.min(0, start.current.base + dx)));
  }

  function onTouchEnd() {
    if (axis.current === 'x') setOffset(open ? -ACTION_WIDTH : 0);
    setDragging(false);
    start.current = null;
    axis.current = null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" data-testid="swipe-row">
      <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: ACTION_WIDTH }}>
        <button
          type="button"
          tabIndex={offset === 0 ? -1 : 0}
          aria-hidden={offset === 0}
          onClick={() => {
            setOffset(0);
            onRequestDelete();
          }}
          className="flex w-full items-center justify-center bg-red-600 text-sm font-semibold text-white"
        >
          {label}
        </button>
      </div>
      <div
        data-testid="swipe-surface"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 160ms ease-out',
          touchAction: 'pan-y',
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}
