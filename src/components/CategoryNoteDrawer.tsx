import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react';
import './CategoryNoteDrawer.css';

const NOTE_WIDTH = 840;
const NOTE_HEIGHT = 1188;
const UNCATEGORIZED = '\u672a\u5206\u985e';
const COLORS = ['#111111', '#dc2626', '#2563eb'];
const HISTORY_LIMIT = 30;

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
};

interface CategoryNoteDrawerProps {
  problemSetId?: string;
  category?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CategoryNoteDrawer({ problemSetId, category, open, onOpenChange }: CategoryNoteDrawerProps) {
  const normalizedCategory = normalizeCategory(category);
  const storageKey = problemSetId ? getNoteKey(problemSetId, normalizedCategory) : '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawerDragStartRef = useRef<number | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const [drawerOffset, setDrawerOffset] = useState(0);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const [note, setNote] = useState<CategoryNote>(() => createEmptyNote(problemSetId ?? '', normalizedCategory));
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(2);
  const [history, setHistory] = useState<string[]>([]);

  const pages = note.pages.length > 0 ? note.pages : [createBlankPage()];
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)] ?? pages[0];

  useEffect(() => {
    if (!problemSetId) return;
    const loaded = loadNote(storageKey, problemSetId, normalizedCategory);
    setNote(loaded);
    setPageIndex(Math.min(loaded.currentPageIndex, Math.max(loaded.pages.length - 1, 0)));
    setHistory([]);
  }, [problemSetId, storageKey, normalizedCategory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPageToCanvas(canvas, currentPage?.dataUrl ?? '');
  }, [currentPage?.id, currentPage?.dataUrl]);

  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const persistNote = (nextNote: CategoryNote) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextNote));
    } catch (error) {
      console.error('Failed to save category note.', error);
    }
  };

  const updateCurrentPage = (dataUrl: string, nextPageIndex = pageIndex) => {
    const nextPages = [...pages];
    nextPages[nextPageIndex] = { ...nextPages[nextPageIndex], dataUrl, updatedAt: new Date().toISOString() };
    const nextNote = {
      problemSetId: problemSetId ?? '',
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: nextPageIndex,
    };
    setNote(nextNote);
    setPageIndex(nextPageIndex);
    persistNote(nextNote);
  };

  const snapshot = () => canvasRef.current?.toDataURL('image/png') ?? '';

  const pushHistory = () => {
    const image = snapshot();
    if (!image) return;
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), image]);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    const canvas = canvasRef.current;
    if (canvas) drawPageToCanvas(canvas, previous);
    updateCurrentPage(previous);
  };

  const addPage = () => {
    const currentData = snapshot();
    if (currentData) updateCurrentPage(currentData);
    const nextPages = [...pages, createBlankPage()];
    const nextIndex = nextPages.length - 1;
    const nextNote = {
      problemSetId: problemSetId ?? '',
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: nextIndex,
    };
    setNote(nextNote);
    setPageIndex(nextIndex);
    setHistory([]);
    persistNote(nextNote);
  };

  const goToPage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    const currentData = snapshot();
    if (currentData) updateCurrentPage(currentData);
    const nextNote = { ...note, pages, currentPageIndex: nextIndex };
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
    context.lineWidth = tool === 'eraser' ? size * 4 : size;
    context.strokeStyle = color;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
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
    updateCurrentPage(snapshot());
  };

  const beginDrawerDrag = (event: PointerEvent<HTMLElement>) => {
    drawerDragStartRef.current = event.clientX;
    setDrawerDragging(true);
    setDrawerOffset(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrawerDrag = (event: PointerEvent<HTMLElement>) => {
    if (drawerDragStartRef.current === null) return;
    const delta = event.clientX - drawerDragStartRef.current;
    const offset = isOpen ? Math.max(0, Math.min(360, delta)) : Math.min(0, Math.max(-360, delta));
    setDrawerOffset(offset);
  };

  const endDrawerDrag = (event: PointerEvent<HTMLElement>) => {
    if (drawerDragStartRef.current === null) return;
    const delta = event.clientX - drawerDragStartRef.current;
    if (isOpen && delta > 90) setOpen(false);
    if (!isOpen && delta < -70) setOpen(true);
    drawerDragStartRef.current = null;
    setDrawerDragging(false);
    setDrawerOffset(0);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const drawerStyle: CSSProperties | undefined = drawerDragging
    ? { transform: isOpen ? `translateX(${drawerOffset}px)` : `translateX(calc(100% + ${drawerOffset}px))` }
    : undefined;

  if (!problemSetId) return null;

  return (
    <>
      <button
        type="button"
        className="category-note-tab"
        onClick={() => setOpen(true)}
        onPointerDown={beginDrawerDrag}
        onPointerMove={moveDrawerDrag}
        onPointerUp={endDrawerDrag}
        onPointerCancel={endDrawerDrag}
      >
        {'\u30ce\u30fc\u30c8'}
      </button>
      <aside
        className={`category-note-drawer${isOpen ? ' category-note-drawer--open' : ''}${drawerDragging ? ' category-note-drawer--dragging' : ''}`}
        style={drawerStyle}
      >
        <div
          className="category-note-drawer__handle"
          onPointerDown={beginDrawerDrag}
          onPointerMove={moveDrawerDrag}
          onPointerUp={endDrawerDrag}
          onPointerCancel={endDrawerDrag}
        />
        <header className="category-note-drawer__header">
          <div>
            <p>{'\u30ce\u30fc\u30c8'}</p>
            <h2>{normalizedCategory}</h2>
            <span>{'\u30da\u30fc\u30b8'} {pageIndex + 1} / {pages.length}</span>
          </div>
          <button type="button" onClick={() => setOpen(false)}>{'\u9589\u3058\u308b'}</button>
        </header>

        <div className="category-note-toolbar">
          <label>
            {'\u592a\u3055'}
            <input type="range" min="1" max="6" value={size} onChange={(event) => setSize(Number(event.target.value))} />
          </label>
          <div className="category-note-toolbar__colors">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={color === item && tool === 'pen' ? 'is-active' : ''}
                style={{ backgroundColor: item }}
                aria-label={`color ${item}`}
                onClick={() => {
                  setColor(item);
                  setTool('pen');
                }}
              />
            ))}
          </div>
          <button type="button" className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')}>{'\u30da\u30f3'}</button>
          <button type="button" className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')}>{'\u6d88\u3057\u30b4\u30e0'}</button>
          <button type="button" disabled={history.length === 0} onClick={undo}>{'\u623b\u3059'}</button>
          <button type="button" disabled={pageIndex <= 0} onClick={() => goToPage(pageIndex - 1)}>{'\u524d\u3078'}</button>
          <button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => goToPage(pageIndex + 1)}>{'\u6b21\u3078'}</button>
          <button type="button" onClick={addPage}>{'\u30da\u30fc\u30b8\u8ffd\u52a0'}</button>
        </div>

        <div className="category-note-page-wrap">
          <canvas
            ref={canvasRef}
            className="category-note-page"
            width={NOTE_WIDTH}
            height={NOTE_HEIGHT}
            onPointerDown={beginDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
          />
        </div>
      </aside>
    </>
  );
}

function normalizeCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

function getNoteKey(problemSetId: string, category: string) {
  return `quizMake:notes:${encodeURIComponent(problemSetId)}:${encodeURIComponent(category)}`;
}

function createBlankPage(): NotePage {
  return { id: `page_${Date.now()}_${Math.random().toString(36).slice(2)}`, dataUrl: '', updatedAt: new Date().toISOString() };
}

function createEmptyNote(problemSetId: string, category: string): CategoryNote {
  return { problemSetId, category, pages: [createBlankPage()], currentPageIndex: 0 };
}

function loadNote(key: string, problemSetId: string, category: string): CategoryNote {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createEmptyNote(problemSetId, category);
    const parsed = JSON.parse(raw) as Partial<CategoryNote>;
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return createEmptyNote(problemSetId, category);
    return {
      problemSetId,
      category,
      pages: parsed.pages.filter((page): page is NotePage => Boolean(page && typeof page.id === 'string')).map((page) => ({
        id: page.id,
        dataUrl: typeof page.dataUrl === 'string' ? page.dataUrl : '',
        updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : new Date().toISOString(),
      })),
      currentPageIndex: typeof parsed.currentPageIndex === 'number' ? parsed.currentPageIndex : 0,
    };
  } catch {
    return createEmptyNote(problemSetId, category);
  }
}

function canDraw(event: PointerEvent<HTMLCanvasElement>) {
  return event.pointerType === 'pen' || (import.meta.env.DEV && event.pointerType === 'mouse');
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawPageToCanvas(canvas: HTMLCanvasElement, dataUrl: string) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  if (!dataUrl) return;
  const image = new Image();
  image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.src = dataUrl;
}