import { type PointerEvent, useEffect, useRef, useState } from 'react';
import './CategoryNoteDrawer.css';

const UNCATEGORIZED = '\u672a\u5206\u985e';
const CANVAS_WIDTH = 840;
const CANVAS_HEIGHT = 1188;
const NOTE_COLORS = {
  blue: '#2563eb',
  red: '#dc2626',
  black: '#111827',
} as const;
const NOTE_SIZES = [1, 2, 4, 6] as const;

type NoteColorKey = keyof typeof NOTE_COLORS;
type NoteSize = (typeof NOTE_SIZES)[number];

interface CategoryNoteDrawerProps {
  problemSetId?: string;
  category?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CategoryNoteDrawer({ problemSetId, category, open, onOpenChange }: CategoryNoteDrawerProps) {
  const normalizedCategory = normalizeCategory(category);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [colorKey, setColorKey] = useState<NoteColorKey>('blue');
  const [size, setSize] = useState<NoteSize>(2);
  const isOpen = open ?? internalOpen;
  const color = NOTE_COLORS[colorKey];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const previous = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL('image/png') : '';
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, rect.width, rect.height);
      if (previous) {
        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = previous;
      }
    };

    setupCanvas();
    const observer = new ResizeObserver(setupCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    dragStartRef.current = event.clientX;
    setDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return;
    const delta = event.clientX - dragStartRef.current;
    setDragOffset(isOpen ? Math.max(0, Math.min(360, delta)) : Math.min(0, Math.max(-360, delta)));
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return;
    const delta = event.clientX - dragStartRef.current;
    if (isOpen && delta > 90) setOpen(false);
    if (!isOpen && delta < -70) setOpen(true);
    dragStartRef.current = null;
    setDragging(false);
    setDragOffset(0);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const beginDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw(event)) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(canvas, event);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const moveDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canDraw(event)) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const lastPoint = lastPointRef.current;
    if (!canvas || !lastPoint) return;
    const nextPoint = getCanvasPoint(canvas, event);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = size;
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    context.restore();
    lastPointRef.current = nextPoint;
  };

  const endDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  };

  if (!problemSetId) return null;

  const drawerStyle = dragging
    ? { transform: isOpen ? `translateX(${dragOffset}px)` : `translateX(calc(100% + ${dragOffset}px))` }
    : undefined;

  return (
    <>
      <button
        type="button"
        className="category-note-tab"
        onClick={() => setOpen(true)}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {'\u30ce\u30fc\u30c8'}
      </button>
      <aside
        className={`category-note-drawer${isOpen ? ' category-note-drawer--open' : ''}${dragging ? ' category-note-drawer--dragging' : ''}`}
        style={drawerStyle}
      >
        <div
          className="category-note-drawer__handle"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <header className="category-note-drawer__header">
          <div>
            <p>{'\u30ce\u30fc\u30c8'}</p>
            <h2>{normalizedCategory}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)}>{'\u9589\u3058\u308b'}</button>
        </header>

        <div className="category-note-canvas-area">
          <div className="category-note-page" aria-label="A4 note page">
            <canvas
              ref={canvasRef}
              className="category-note-canvas"
              onPointerDown={beginDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              onPointerLeave={endDraw}
            />
          </div>
        </div>

        <div className="category-note-toolbar" aria-label="note tools">
          <div className="category-note-tool-group">
            <span>{'\u592a\u3055'}</span>
            {NOTE_SIZES.map((item) => (
              <button
                key={item}
                type="button"
                className={size === item ? 'is-active' : ''}
                onClick={() => setSize(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="category-note-tool-group">
            <span>{'\u8272'}</span>
            {(Object.keys(NOTE_COLORS) as NoteColorKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`category-note-color category-note-color--${key}${colorKey === key ? ' is-active' : ''}`}
                aria-label={key}
                onClick={() => setColorKey(key)}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function normalizeCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

function canDraw(event: PointerEvent<HTMLCanvasElement>) {
  return event.pointerType === 'pen' || (import.meta.env.DEV && event.pointerType === 'mouse');
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}