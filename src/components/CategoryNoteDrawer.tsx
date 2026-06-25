import { type PointerEvent, useEffect, useRef, useState } from 'react';
import './CategoryNoteDrawer.css';

const UNCATEGORIZED = '\u672a\u5206\u985e';
const NOTE_COLORS = {
  blue: '#2563eb',
  red: '#dc2626',
  black: '#111827',
} as const;
const PEN_WIDTHS = [1, 2] as const;
const ERASER_WIDTHS = [5, 10] as const;
const MAX_HISTORY = 30;

type NoteColorKey = keyof typeof NOTE_COLORS;
type PenSize = (typeof PEN_WIDTHS)[number];
type EraserSize = (typeof ERASER_WIDTHS)[number];
type NoteTool = 'pen' | 'eraser';

type NotePage = {
  id: string;
  dataUrl: string;
  updatedAt: string;
};

type CategoryNote = {
  problemSetId: string;
  category: string;
  pages: NotePage[];
  currentPageIndex: number;
  updatedAt: string;
};

interface CategoryNoteProps {
  problemSetId?: string;
  category?: string;
  className?: string;
  onClose?: () => void;
}

interface CategoryNoteDrawerProps extends CategoryNoteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CategoryNoteDrawer({ problemSetId, category, open, onOpenChange }: CategoryNoteDrawerProps) {
  const dragStartRef = useRef<number | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const isOpen = open ?? internalOpen;

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
        <CategoryNotePanel problemSetId={problemSetId} category={category} onClose={() => setOpen(false)} />
      </aside>
    </>
  );
}

export function CategoryNotePanel({ problemSetId, category, className = '', onClose }: CategoryNoteProps) {
  const normalizedCategory = normalizeCategory(category);
  const noteKey = problemSetId ? getNoteKey(problemSetId, normalizedCategory) : '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState<CategoryNote>(() => createEmptyNote(problemSetId ?? '', normalizedCategory));
  const [pageIndex, setPageIndex] = useState(0);
  const [colorKey, setColorKey] = useState<NoteColorKey>('blue');
  const [penSize, setPenSize] = useState<PenSize>(2);
  const [eraserSize, setEraserSize] = useState<EraserSize>(10);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [history, setHistory] = useState<string[]>([]);

  const pages = note.pages.length > 0 ? note.pages : [createBlankPage()];
  const currentPageIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const color = NOTE_COLORS[colorKey];
  const activeWidth = tool === 'eraser' ? eraserSize : penSize;
  const activeWidths = tool === 'eraser' ? ERASER_WIDTHS : PEN_WIDTHS;

  useEffect(() => {
    if (!problemSetId || !noteKey) return;
    const loaded = loadNote(noteKey, problemSetId, normalizedCategory);
    setNote(loaded);
    setPageIndex(Math.min(loaded.currentPageIndex, Math.max(loaded.pages.length - 1, 0)));
    setHistory([]);
  }, [problemSetId, noteKey, normalizedCategory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (drawingRef.current || rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawDataUrlToContext(context, currentPage?.dataUrl ?? '', rect.width, rect.height);
    };

    setupCanvas();
    const observer = new ResizeObserver(setupCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [currentPage?.id, currentPage?.dataUrl]);

  const snapshot = () => canvasRef.current?.toDataURL('image/png') ?? '';

  const persistNote = (nextNote: CategoryNote) => {
    if (!noteKey) return;
    try {
      localStorage.setItem(noteKey, JSON.stringify(nextNote));
    } catch (error) {
      console.warn('Failed to save category note.', error);
    }
  };

  const updateCurrentPage = (dataUrl = snapshot(), nextIndex = currentPageIndex) => {
    if (!problemSetId || !dataUrl) return note;
    const nextPages = [...pages];
    nextPages[nextIndex] = { ...nextPages[nextIndex], dataUrl, updatedAt: new Date().toISOString() };
    const nextNote: CategoryNote = {
      problemSetId,
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    };
    setNote(nextNote);
    setPageIndex(nextIndex);
    persistNote(nextNote);
    return nextNote;
  };

  const pushHistory = () => {
    const image = snapshot();
    if (!image) return;
    setHistory((items) => [...items.slice(-(MAX_HISTORY - 1)), image]);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    drawDataUrlToCanvas(previous);
    updateCurrentPage(previous);
  };

  const addPage = () => {
    const saved = updateCurrentPage();
    const nextPages = [...saved.pages, createBlankPage()];
    const nextIndex = nextPages.length - 1;
    const nextNote: CategoryNote = {
      problemSetId: problemSetId ?? '',
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    };
    setNote(nextNote);
    setPageIndex(nextIndex);
    setHistory([]);
    persistNote(nextNote);
  };

  const goToPage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    const saved = updateCurrentPage();
    const nextNote = { ...saved, currentPageIndex: nextIndex, updatedAt: new Date().toISOString() };
    setNote(nextNote);
    setPageIndex(nextIndex);
    setHistory([]);
    persistNote(nextNote);
  };

  const beginDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw(event)) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
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
    context.lineWidth = activeWidth;
    context.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
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
    updateCurrentPage();
  };

  const drawDataUrlToCanvas = (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (!context) return;
    drawDataUrlToContext(context, dataUrl, rect.width, rect.height);
  };

  return (
    <section className={`category-note-panel ${className}`.trim()}>
      <header className="category-note-drawer__header">
        <div>
          <p>{'\u30ce\u30fc\u30c8'}</p>
          <h2>{normalizedCategory}</h2>
          <span>{'\u30da\u30fc\u30b8'} {currentPageIndex + 1} / {pages.length}</span>
        </div>
        {onClose ? <button type="button" onClick={onClose}>{'\u9589\u3058\u308b'}</button> : null}
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
          {activeWidths.map((item) => (
            <button
              key={item}
              type="button"
              className={activeWidth === item ? 'is-active' : ''}
              onClick={() => {
                if (tool === 'eraser') setEraserSize(item as EraserSize);
                else setPenSize(item as PenSize);
              }}
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
              className={`category-note-color category-note-color--${key}${colorKey === key && tool === 'pen' ? ' is-active' : ''}`}
              aria-label={key}
              onClick={() => {
                setColorKey(key);
                setTool('pen');
              }}
            />
          ))}
        </div>
        <div className="category-note-tool-group">
          <button type="button" className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')}>{'\u30da\u30f3'}</button>
          <button type="button" className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')}>{'\u6d88\u3057\u30b4\u30e0'}</button>
          <button type="button" disabled={history.length === 0} onClick={undo}>{'\u623b\u3059'}</button>
        </div>
        <div className="category-note-tool-group">
          <button type="button" disabled={currentPageIndex <= 0} onClick={() => goToPage(currentPageIndex - 1)}>{'\u524d\u3078'}</button>
          <button type="button" disabled={currentPageIndex >= pages.length - 1} onClick={() => goToPage(currentPageIndex + 1)}>{'\u6b21\u3078'}</button>
          <button type="button" onClick={addPage}>{'\u30da\u30fc\u30b8\u8ffd\u52a0'}</button>
        </div>
      </div>
    </section>
  );
}

function normalizeCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

function getNoteKey(problemSetId: string, category: string) {
  return `quizMake:notes:${problemSetId}:${category}`;
}

function createBlankPage(): NotePage {
  return { id: `page_${Date.now()}_${Math.random().toString(36).slice(2)}`, dataUrl: '', updatedAt: new Date().toISOString() };
}

function createEmptyNote(problemSetId: string, category: string): CategoryNote {
  return {
    problemSetId,
    category,
    pages: [createBlankPage()],
    currentPageIndex: 0,
    updatedAt: new Date().toISOString(),
  };
}

function loadNote(key: string, problemSetId: string, category: string): CategoryNote {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createEmptyNote(problemSetId, category);
    const parsed = JSON.parse(raw) as Partial<CategoryNote>;
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return migrateSinglePageNote(parsed, problemSetId, category);
    const pages = parsed.pages
      .filter((page): page is NotePage => Boolean(page && typeof page.id === 'string'))
      .map((page) => ({
        id: page.id,
        dataUrl: typeof page.dataUrl === 'string' ? page.dataUrl : '',
        updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : new Date().toISOString(),
      }));
    return {
      problemSetId,
      category,
      pages: pages.length > 0 ? pages : [createBlankPage()],
      currentPageIndex: typeof parsed.currentPageIndex === 'number' ? parsed.currentPageIndex : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return createEmptyNote(problemSetId, category);
  }
}

function migrateSinglePageNote(parsed: Partial<CategoryNote> & { dataUrl?: unknown }, problemSetId: string, category: string): CategoryNote {
  const page = createBlankPage();
  if (typeof parsed.dataUrl === 'string') page.dataUrl = parsed.dataUrl;
  return {
    problemSetId,
    category,
    pages: [page],
    currentPageIndex: 0,
    updatedAt: new Date().toISOString(),
  };
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

function drawDataUrlToContext(context: CanvasRenderingContext2D, dataUrl: string, width: number, height: number) {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  if (!dataUrl) return;
  const image = new Image();
  image.onload = () => context.drawImage(image, 0, 0, width, height);
  image.src = dataUrl;
}