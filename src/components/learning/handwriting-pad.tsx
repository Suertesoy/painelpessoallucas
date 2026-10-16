'use client';

import { useRef, useState } from 'react';
import { Eraser, Redo2, Undo2 } from 'lucide-react';

type Point = [number, number];
const SIZE = 300;

/**
 * Área de escrita (dedo, mouse ou caneta) em SVG. Cada traço é uma lista de
 * pontos; desfazer/refazer operam por traço. Sem reconhecimento de
 * caligrafia: a pessoa compara com o modelo (lado a lado ou sobreposto) e
 * se autoavalia.
 */
export function HandwritingPad({
  reference,
  showGuide,
  compare,
}: {
  reference: string;
  /** Mostra o modelo esmaecido atrás do traço (guia). */
  showGuide: boolean;
  /** Sobrepõe o modelo ao traço feito, para comparar. */
  compare: boolean;
}) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [redo, setRedo] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toPoint = (e: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * SIZE, ((e.clientY - rect.top) / rect.height) * SIZE];
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setCurrent([toPoint(e)]);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!current) return;
    setCurrent([...current, toPoint(e)]);
  };
  const onUp = () => {
    if (current && current.length > 0) {
      setStrokes([...strokes, current]);
      setRedo([]);
    }
    setCurrent(null);
  };

  const undo = () => {
    const last = strokes[strokes.length - 1];
    if (!last) return;
    setStrokes(strokes.slice(0, -1));
    setRedo([...redo, last]);
  };
  const redoStroke = () => {
    const last = redo[redo.length - 1];
    if (!last) return;
    setRedo(redo.slice(0, -1));
    setStrokes([...strokes, last]);
  };
  const clear = () => {
    setStrokes([]);
    setRedo([]);
    setCurrent(null);
  };

  const path = (pts: Point[]) => pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const all = current ? [...strokes, current] : strokes;
  const iconBtn =
    'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40';

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm rounded-3xl border border-gray-300 bg-white">
        {(showGuide || compare) && (
          <span
            aria-hidden="true"
            lang="ja"
            className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[11rem] leading-none ${
              compare ? 'text-blue-400/50' : 'text-gray-300/40'
            }`}
          >
            {reference}
          </span>
        )}
        <svg
          ref={svgRef}
          role="img"
          aria-label="Área de escrita: desenhe com o dedo, mouse ou caneta"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 z-20 h-full w-full touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-strokes={strokes.length}
        >
          {all.map((pts, i) => (
            <polyline
              key={i}
              points={path(pts)}
              fill="none"
              stroke="currentColor"
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-900"
            />
          ))}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={undo} disabled={strokes.length === 0} className={iconBtn} aria-label="Desfazer último traço">
          <Undo2 size={18} /> Desfazer
        </button>
        <button type="button" onClick={redoStroke} disabled={redo.length === 0} className={iconBtn} aria-label="Refazer traço">
          <Redo2 size={18} /> Refazer
        </button>
        <button type="button" onClick={clear} disabled={all.length === 0} className={iconBtn} aria-label="Apagar tudo">
          <Eraser size={18} /> Apagar
        </button>
      </div>
    </div>
  );
}
