import { type PointerEvent, useEffect, useRef, useState } from 'react';
import './CategoryNoteDrawer.css';

const UNCATEGORIZED = '\u672a\u5206\u985e';
const NOTE_COLORS = {
  blue: '#2563eb',
  red: '#dc2626',
  black: '#111827',
} as const;
const PEN_WIDTHS = [1, 2, 3] as const;
const ERASER_WIDTHS = [5, 10, 15] as const;
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
  const prevPageRef = useRef<HTMLDivElement | null>(null);
  const nextPageRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const pendingResizeRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<string[]>([]);
  const pageSwipeRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const pageElementRef = useRef<HTMLDivElement | null>(null);
  const pageSwipeFrameRef = useRef<number | null>(null);
  const pageDataUrlRef = useRef('');
  const toolRef = useRef<NoteTool>('pen');
  const colorRef = useRef<string>(NOTE_COLORS.blue);
  const widthRef = useRef<number>(2);

  const [note, setNote] = useState<CategoryNote>(() => createEmptyNote(problemSetId ?? '', normalizedCategory));
  const [pageIndex, setPageIndex] = useState(0);
  const [colorKey, setColorKey] = useState<NoteColorKey>('blue');
  const [penSize, setPenSize] = useState<PenSize>(2);
  const [eraserSize, setEraserSize] = useState<EraserSize>(10);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [canUndo, setCanUndo] = useState(false);
  const [pageSwiping, setPageSwiping] = useState(false);

  const pages = note.pages.length > 0 ? note.pages : [createBlankPage()];
  const currentPageIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const activeWidth = tool === 'eraser' ? eraserSize : penSize;
  const activeWidths = tool === 'eraser' ? ERASER_WIDTHS : PEN_WIDTHS;

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    colorRef.current = NOTE_COLORS[colorKey];
  }, [colorKey]);

  useEffect(() => {
    widthRef.current = activeWidth;
  }, [activeWidth]);

  useEffect(() => {
    if (!problemSetId || !noteKey) return;
    const loaded = loadNote(noteKey, problemSetId, normalizedCategory);
    setNote(loaded);
    setPageIndex(Math.min(loaded.currentPageIndex, Math.max(loaded.pages.length - 1, 0)));
    clearHistory();
  }, [problemSetId, noteKey, normalizedCategory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    pageDataUrlRef.current = currentPage?.dataUrl ?? '';

    const setupCanvas = (forceDraw = false) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (drawingRef.current) {
        pendingResizeRef.current = true;
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      const nextWidth = Math.round(rect.width * ratio);
      const nextHeight = Math.round(rect.height * ratio);
      const sizeChanged = canvas.width !== nextWidth || canvas.height !== nextHeight;

      if (sizeChanged) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      const context = canvas.getContext('2d');
      if (!context) return;
      ctxRef.current = context;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (sizeChanged || forceDraw) {
        drawDataUrlToContext(context, pageDataUrlRef.current, rect.width, rect.height);
      }
    };

    setupCanvas(true);
    const observer = new ResizeObserver(() => setupCanvas(false));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [currentPage?.id, noteKey]);

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
    pageDataUrlRef.current = dataUrl;
    setNote(nextNote);
    setPageIndex(nextIndex);
    persistNote(nextNote);
    return nextNote;
  };

  function clearHistory() {
    historyRef.current = [];
    setCanUndo(false);
  }

  const pushHistory = () => {
    const image = snapshot();
    if (!image) return;
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), image];
    setCanUndo(historyRef.current.length > 0);
  };

  const undo = () => {
    const previous = historyRef.current[historyRef.current.length - 1];
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setCanUndo(historyRef.current.length > 0);
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
    pageDataUrlRef.current = '';
    setNote(nextNote);
    setPageIndex(nextIndex);
    clearHistory();
    persistNote(nextNote);
  };

  const deletePage = () => {
    if (pages.length <= 1) return;
    const confirmed = window.confirm('\u3053\u306e\u30da\u30fc\u30b8\u3092\u524a\u9664\u3057\u307e\u3059\u3002\u3053\u306e\u30da\u30fc\u30b8\u306b\u66f8\u3044\u305f\u30ce\u30fc\u30c8\u306f\u524a\u9664\u3055\u308c\u307e\u3059\u3002\u672c\u5f53\u306b\u524a\u9664\u3057\u307e\u3059\u304b\uff1f');
    if (!confirmed) return;
    const nextPages = pages.filter((_, index) => index !== currentPageIndex);
    const nextIndex = Math.min(currentPageIndex, nextPages.length - 1);
    const nextNote: CategoryNote = {
      problemSetId: problemSetId ?? '',
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    };
    pageDataUrlRef.current = nextPages[nextIndex]?.dataUrl ?? '';
    setNote(nextNote);
    setPageIndex(nextIndex);
    clearHistory();
    persistNote(nextNote);
  };

  const goToPage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    const saved = updateCurrentPage();
    const nextNote = { ...saved, currentPageIndex: nextIndex, updatedAt: new Date().toISOString() };
    pageDataUrlRef.current = nextNote.pages[nextIndex]?.dataUrl ?? '';
    setNote(nextNote);
    setPageIndex(nextIndex);
    clearHistory();
    persistNote(nextNote);
  };

  const beginPageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== 'touch') return;
    pageSwipeRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setPageSwiping(true);
    setPageTransform(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    const swipe = pageSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
      const limit = canvasRef.current?.clientWidth ?? 240;
      setPageTransform(Math.max(-limit, Math.min(limit, deltaX)));
    }
  };

  const setPageTransform = (offset: number) => {
    if (pageSwipeFrameRef.current !== null) cancelAnimationFrame(pageSwipeFrameRef.current);
    pageSwipeFrameRef.current = requestAnimationFrame(() => {
      pageSwipeFrameRef.current = null;
      if (!pageElementRef.current) return;
      pageElementRef.current.style.transform = offset === 0 ? '' : `translate3d(calc(-33.333333% + ${offset}px), 0, 0)`;
    });
  };
  const endPageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    const swipe = pageSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    const shouldChangePage = Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    pageSwipeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (shouldChangePage && deltaX < 0 && currentPageIndex < pages.length - 1) {
      setPageSwiping(false);
      animatePageCommit('next', () => goToPage(currentPageIndex + 1));
      return;
    }
    if (shouldChangePage && deltaX > 0 && currentPageIndex > 0) {
      setPageSwiping(false);
      animatePageCommit('prev', () => goToPage(currentPageIndex - 1));
      return;
    }

    setPageSwiping(false);
    resetPageRail();
  };

  const resetPageRail = () => {
    if (pageSwipeFrameRef.current !== null) {
      cancelAnimationFrame(pageSwipeFrameRef.current);
      pageSwipeFrameRef.current = null;
    }
    if (pageElementRef.current) {
      pageElementRef.current.style.transform = 'translate3d(-33.333333%, 0, 0)';
      pageElementRef.current.style.opacity = '';
    }
    if (prevPageRef.current) prevPageRef.current.style.opacity = '';
    if (nextPageRef.current) nextPageRef.current.style.opacity = '';
  };
  const animatePageCommit = (direction: 'prev' | 'next', onComplete: () => void) => {
    const rail = pageElementRef.current;
    if (!rail) {
      onComplete();
      return;
    }
    rail.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease';
    rail.style.transform = direction === 'next' ? 'translate3d(-66.666667%, 0, 0)' : 'translate3d(0, 0, 0)';
    window.setTimeout(() => {
      rail.style.transition = '';
      resetPageRail();
      rail.style.opacity = '';
      if (prevPageRef.current) prevPageRef.current.style.opacity = '';
      if (nextPageRef.current) nextPageRef.current.style.opacity = '';
      onComplete();
    }, 180);
  };
  const beginDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw(event)) {
      beginPageSwipe(event);
      return;
    }
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
    drawingRef.current = true;
    pendingResizeRef.current = false;
    lastPointRef.current = getCanvasPoint(canvas, event);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const moveDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canDraw(event)) {
      movePageSwipe(event);
      return;
    }
    event.preventDefault();
    const canvas = canvasRef.current;
    const lastPoint = lastPointRef.current;
    const context = ctxRef.current ?? canvas?.getContext('2d');
    if (!canvas || !lastPoint || !context) return;
    ctxRef.current = context;
    const nextPoint = getCanvasPoint(canvas, event);
    const drawingTool = toolRef.current;

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = widthRef.current;
    context.strokeStyle = drawingTool === 'eraser' ? '#ffffff' : colorRef.current;
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    context.restore();
    lastPointRef.current = nextPoint;
  };

  const endDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pageSwipeRef.current) {
      endPageSwipe(event);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    window.setTimeout(() => {
      updateCurrentPage();
      if (pendingResizeRef.current) {
        pendingResizeRef.current = false;
        redrawCanvasFromCurrentImage();
      }
    }, 0);
  };

  const drawDataUrlToCanvas = (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (!context) return;
    ctxRef.current = context;
    drawDataUrlToContext(context, dataUrl, rect.width, rect.height);
  };

  const redrawCanvasFromCurrentImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const nextWidth = Math.round(rect.width * ratio);
    const nextHeight = Math.round(rect.height * ratio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    ctxRef.current = context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawDataUrlToContext(context, pageDataUrlRef.current, rect.width, rect.height);
  };

  const selectColor = (key: NoteColorKey) => {
    setColorKey(key);
    setTool('pen');
  };

  return (
    <section className={`category-note-panel ${className}`.trim()}>
      <header className="category-note-drawer__header">
        <div className="category-note-drawer__title-block">
          <p>{'\u30ce\u30fc\u30c8'}</p>
          <h2>{normalizedCategory}</h2>
          <span>{'\u30da\u30fc\u30b8'} {currentPageIndex + 1} / {pages.length}</span>
        </div>
        <div className="category-note-drawer__header-actions">
          <button type="button" onClick={addPage}>{'\u8ffd\u52a0'}</button>
          <button type="button" className="category-note-drawer__danger-button" disabled={pages.length <= 1} onClick={deletePage}>{'\u524a\u9664'}</button>
          {onClose ? <button type="button" onClick={onClose}>{'\u9589\u3058\u308b'}</button> : null}
        </div>
      </header>

      <div className="category-note-canvas-area">
        <div className="category-note-page-viewport">
          <div
            ref={pageElementRef}
            className={`category-note-page-rail${pageSwiping ? ' category-note-page-rail--swiping' : ''}`}
            aria-label="A4 note page slider"
          >
            <div
              ref={prevPageRef}
              className="category-note-page category-note-page--preview"
              style={{ backgroundImage: pages[currentPageIndex - 1]?.dataUrl ? `url(${pages[currentPageIndex - 1].dataUrl})` : undefined }}
              aria-hidden="true"
            />
            <div className="category-note-page category-note-page--active">
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
            <div
              ref={nextPageRef}
              className="category-note-page category-note-page--preview"
              style={{ backgroundImage: pages[currentPageIndex + 1]?.dataUrl ? `url(${pages[currentPageIndex + 1].dataUrl})` : undefined }}
              aria-hidden="true"
            />
          </div>
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
        <div className="category-note-tool-group category-note-tool-group--tools">
          <span>{'\u8272'}</span>
          {(Object.keys(NOTE_COLORS) as NoteColorKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`category-note-color category-note-color--${key}${colorKey === key && tool === 'pen' ? ' is-active' : ''}`}
              aria-label={key}
              title={key}
              onClick={() => selectColor(key)}
            />
          ))}
          <button
            type="button"
            className={`category-note-icon-button${tool === 'eraser' ? ' is-active' : ''}`}
            aria-label="\u6d88\u3057\u30b4\u30e0"
            title="\u6d88\u3057\u30b4\u30e0"
            onClick={() => setTool('eraser')}
          >
            <EraserIcon />
          </button>
          <button
            type="button"
            className="category-note-icon-button"
            aria-label="\u623b\u3059"
            title="\u623b\u3059"
            disabled={!canUndo}
            onClick={undo}
          >
            <UndoIcon />
          </button>
        </div>
      </div>
    </section>
  );
}

function EraserIcon() {
  return (
    <svg className="category-note-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.7 14.2 13.2 5.7a2.2 2.2 0 0 1 3.1 0l2 2a2.2 2.2 0 0 1 0 3.1l-7.1 7.1H6.4l-1.7-1.7a1.4 1.4 0 0 1 0-2Z" />
      <path d="M10.2 18h9" />
      <path d="m9.2 9.7 5.1 5.1" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="category-note-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7H5v4" />
      <path d="M5.7 10.3A7 7 0 1 0 12 6h-1.8" />
    </svg>
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











