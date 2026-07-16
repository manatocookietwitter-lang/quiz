import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from './ConfirmDialog';
import { createId } from '../utils/id';
import { loadCategoryNoteRaw, saveCategoryNoteRaw } from '../utils/noteStorage';
import './CategoryNoteDrawer.css';

const UNCATEGORIZED = '\u672a\u5206\u985e';
const NOTE_COLORS = {
  blue: '#2563eb',
  red: '#dc2626',
  black: '#111827',
} as const;
const PEN_WIDTHS = [1, 2, 3] as const;
const ERASER_WIDTHS = [10, 15, 30] as const;
const MAX_HISTORY = 30;
const OVERSCROLL_LIMIT = 36;
const PAN_EDGE_BREATHING_ROOM = 18;
const NOTE_IMAGE_CACHE_LIMIT = 100;
const noteImageCache = new Map<string, HTMLImageElement>();

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
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const pagePanGestureRef = useRef<{ x: number; y: number; pointerId: number; startPan: { x: number; y: number } } | null>(null);
  const pageScaleRef = useRef(1);
  const pagePanRef = useRef({ x: 0, y: 0 });
  const pagePinchingRef = useRef(false);
  const pageElementRef = useRef<HTMLDivElement | null>(null);
  const pageSwipeFrameRef = useRef<number | null>(null);
  const pageSwipeOffsetRef = useRef(0);
  const pagePanFrameRef = useRef<number | null>(null);
  const activePageRef = useRef<HTMLDivElement | null>(null);
  const primaryTouchIdRef = useRef<number | null>(null);
  const pageDataUrlRef = useRef('');
  const toolRef = useRef<NoteTool>('pen');
  const colorRef = useRef<string>(NOTE_COLORS.black);
  const widthRef = useRef<number>(1);
  const noteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestNoteSaveIdRef = useRef(0);

  const [note, setNote] = useState<CategoryNote>(() => createEmptyNote(problemSetId ?? '', normalizedCategory));
  const [pageIndex, setPageIndex] = useState(0);
  const [colorKey, setColorKey] = useState<NoteColorKey>('black');
  const [penSize, setPenSize] = useState<PenSize>(1);
  const [eraserSize, setEraserSize] = useState<EraserSize>(10);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [canUndo, setCanUndo] = useState(false);
  const [pageSwiping, setPageSwiping] = useState(false);
  const [pageScale, setPageScaleState] = useState(1);
  const [pagePan, setPagePanState] = useState({ x: 0, y: 0 });
  const [pagePinching, setPagePinchingState] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [deletePageConfirmOpen, setDeletePageConfirmOpen] = useState(false);

  const getPagePanMetrics = (scale = pageScaleRef.current) => {
    const page = canvasRef.current?.parentElement as HTMLElement | null;
    const slot = page?.parentElement as HTMLElement | null;
    const pageWidth = page?.offsetWidth ?? 0;
    const pageHeight = page?.offsetHeight ?? 0;
    const viewportWidth = slot?.clientWidth ?? 0;
    const viewportHeight = slot?.clientHeight ?? 0;

    return {
      scaledPageWidth: pageWidth * scale,
      scaledPageHeight: pageHeight * scale,
      viewportWidth,
      viewportHeight,
    };
  };

  const clampAxisPan = (pan: number, pageSize: number, viewportSize: number, allowOverscroll = false) => {
    const overflow = Math.max(0, pageSize - viewportSize);
    if (overflow <= 0) return 0;
    const maxPan = overflow / 2;
    const overscroll = allowOverscroll ? OVERSCROLL_LIMIT : PAN_EDGE_BREATHING_ROOM;
    return Math.max(-maxPan - overscroll, Math.min(maxPan + overscroll, pan));
  };

  const clampPagePan = (nextPan: { x: number; y: number }, scale = pageScaleRef.current, allowOverscroll = false) => {
    const metrics = getPagePanMetrics(scale);
    return {
      x: clampAxisPan(nextPan.x, metrics.scaledPageWidth, metrics.viewportWidth, allowOverscroll),
      y: clampAxisPan(nextPan.y, metrics.scaledPageHeight, metrics.viewportHeight, allowOverscroll),
    };
  };

  const setPagePanValue = (nextPan: { x: number; y: number }, scale = pageScaleRef.current, allowOverscroll = false) => {
    const clamped = clampPagePan(nextPan, scale, allowOverscroll);
    pagePanRef.current = clamped;
    setPagePanState(clamped);
    activePageRef.current?.style.setProperty('transform', scale === 1 ? '' : 'translate3d(' + clamped.x + 'px, ' + clamped.y + 'px, 0) scale(' + scale + ')');
  };

  const setPagePanInteractive = (nextPan: { x: number; y: number }, scale = pageScaleRef.current, allowOverscroll = true) => {
    const clamped = clampPagePan(nextPan, scale, allowOverscroll);
    pagePanRef.current = clamped;
    if (pagePanFrameRef.current !== null) return;
    pagePanFrameRef.current = requestAnimationFrame(() => {
      pagePanFrameRef.current = null;
      const page = activePageRef.current;
      if (!page) return;
      page.style.transform = 'translate3d(' + pagePanRef.current.x + 'px, ' + pagePanRef.current.y + 'px, 0) scale(' + scale + ')';
    });
  };

  const resetPageView = () => {
    if (pagePanFrameRef.current !== null) {
      cancelAnimationFrame(pagePanFrameRef.current);
      pagePanFrameRef.current = null;
    }
    pageScaleRef.current = 1;
    pagePanRef.current = { x: 0, y: 0 };
    setPageScaleState(1);
    setPagePanState({ x: 0, y: 0 });
    setPagePinchingValue(false);
  };

  const setPageScaleValue = (nextScale: number) => {
    const normalizedScale = Math.max(1, nextScale);
    pageScaleRef.current = normalizedScale;
    setPageScaleState(normalizedScale);
    if (normalizedScale <= 1.02) setPagePanValue({ x: 0, y: 0 }, 1);
    else setPagePanValue(pagePanRef.current, normalizedScale);
  };

  const setPagePinchingValue = (nextPinching: boolean) => {
    pagePinchingRef.current = nextPinching;
    setPagePinchingState(nextPinching);
  };

  const resetTouchGesture = () => {
    touchPointsRef.current.clear();
    primaryTouchIdRef.current = null;
    pageSwipeRef.current = null;
    pagePanGestureRef.current = null;
    pinchRef.current = null;
    setPagePinchingValue(false);
    if (pageScaleRef.current <= 1.02) {
      setPageScaleValue(1);
      setPagePanValue({ x: 0, y: 0 }, 1);
    }
  };

  const pages = note.pages.length > 0 ? note.pages : [createBlankPage()];
  const currentPageIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const activeWidth = tool === 'eraser' ? eraserSize : penSize;
  const activeWidths = tool === 'eraser' ? ERASER_WIDTHS : PEN_WIDTHS;
  const saveStatusText = saveState === 'error' ? '保存失敗' : '';

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
    let cancelled = false;
    setSaveState('idle');
    setSaveError('');

    void loadCategoryNoteRaw(noteKey)
      .then((raw) => {
        if (cancelled) return;
        const loaded = parseNote(raw, problemSetId, normalizedCategory);
        setNote(loaded);
        setPageIndex(Math.min(loaded.currentPageIndex, Math.max(loaded.pages.length - 1, 0)));
        clearHistory();
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load category note.', error);
        const fallback = createEmptyNote(problemSetId, normalizedCategory);
        setNote(fallback);
        setPageIndex(0);
        clearHistory();
        setSaveState('error');
        setSaveError('ノートの読み込みに失敗しました');
      });

    return () => {
      cancelled = true;
    };
  }, [problemSetId, noteKey, normalizedCategory]);

  useEffect(() => {
    [pages[currentPageIndex - 1]?.dataUrl, currentPage?.dataUrl, pages[currentPageIndex + 1]?.dataUrl].forEach(preloadNoteImage);
  }, [currentPage?.dataUrl, currentPageIndex, pages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    pageDataUrlRef.current = currentPage?.dataUrl ?? '';

    const setupCanvas = (forceDraw = false) => {
      const { width, height } = getCanvasLogicalSize(canvas);
      if (width === 0 || height === 0) return;
      if (drawingRef.current) {
        pendingResizeRef.current = true;
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      const nextWidth = Math.round(width * ratio);
      const nextHeight = Math.round(height * ratio);
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
        drawDataUrlToContext(context, pageDataUrlRef.current, width, height);
      }
    };

    setupCanvas(true);
    const observer = new ResizeObserver(() => setupCanvas(false));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [currentPage?.id, noteKey]);

  const snapshot = () => canvasRef.current?.toDataURL('image/png') ?? '';

  const persistNote = (nextNote: CategoryNote): Promise<void> => {
    if (!noteKey) return Promise.resolve();

    const raw = JSON.stringify(nextNote);
    const saveId = latestNoteSaveIdRef.current + 1;
    latestNoteSaveIdRef.current = saveId;
    setSaveState('saving');
    setSaveError('');

    const queuedSave = noteSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveCategoryNoteRaw(noteKey, raw));
    noteSaveQueueRef.current = queuedSave;

    void queuedSave
      .then(() => {
        if (latestNoteSaveIdRef.current === saveId) setSaveState('saved');
      })
      .catch((error) => {
        if (latestNoteSaveIdRef.current !== saveId) return;
        console.warn('Failed to save category note.', error);
        setSaveState('error');
        setSaveError(error instanceof Error ? error.message : 'ノートの保存に失敗しました。');
      });

    return queuedSave;
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
    resetPageView();
    clearHistory();
    persistNote(nextNote);
  };

  const deletePage = () => {
    if (pages.length <= 1) return;
    setDeletePageConfirmOpen(true);
  };

  const confirmDeletePage = () => {
    setDeletePageConfirmOpen(false);
    if (pages.length <= 1) return;
    const saved = updateCurrentPage();
    const nextPages = saved.pages.filter((_, index) => index !== currentPageIndex);
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
    resetPageView();
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
    resetPageView();
    clearHistory();
    persistNote(nextNote);
  };

  const beginPageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== 'touch' || isPalmLikeTouch(event)) return;
    event.preventDefault();
    if (touchPointsRef.current.size === 0) {
      primaryTouchIdRef.current = event.pointerId;
    }
    touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (touchPointsRef.current.size >= 2) {
      pageSwipeRef.current = null;
      pagePanGestureRef.current = null;
      setPageSwiping(false);
      const points = Array.from(touchPointsRef.current.values()).slice(0, 2);
      pinchRef.current = { startDistance: getPointDistance(points[0], points[1]), startScale: pageScaleRef.current };
      setPagePinchingValue(true);
      return;
    }

    if (pageScaleRef.current > 1.02) {
      pageSwipeRef.current = null;
      pagePanGestureRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        startPan: pagePanRef.current,
      };
      setPageSwiping(false);
      setPagePinchingValue(true);
      return;
    }

    pageSwipeRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setPageSwiping(true);
    setPageTransform(0);
  };

  const movePageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointsRef.current.size >= 2 && !pinchRef.current) {
        pageSwipeRef.current = null;
        setPageSwiping(false);
        const startPoints = Array.from(touchPointsRef.current.values()).slice(0, 2);
        pinchRef.current = { startDistance: getPointDistance(startPoints[0], startPoints[1]), startScale: pageScaleRef.current };
        setPagePinchingValue(true);
      }
      if (pinchRef.current && touchPointsRef.current.size >= 2) {
        event.preventDefault();
        const points = Array.from(touchPointsRef.current.values()).slice(0, 2);
        const nextDistance = getPointDistance(points[0], points[1]);
        const nextScale = pinchRef.current.startScale * (nextDistance / Math.max(pinchRef.current.startDistance, 1));
        setPageScaleValue(Math.max(1, Math.min(2.5, nextScale)));
        return;
      }
    }
    const pan = pagePanGestureRef.current;
    if (pan && pan.pointerId === event.pointerId && pageScaleRef.current > 1.02) {
      event.preventDefault();
      setPagePanInteractive({
        x: pan.startPan.x + event.clientX - pan.x,
        y: pan.startPan.y + event.clientY - pan.y,
      }, pageScaleRef.current, true);
      return;
    }

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
    pageSwipeOffsetRef.current = offset;
    if (pageSwipeFrameRef.current !== null) cancelAnimationFrame(pageSwipeFrameRef.current);
    pageSwipeFrameRef.current = requestAnimationFrame(() => {
      pageSwipeFrameRef.current = null;
      if (!pageElementRef.current) return;
      pageElementRef.current.style.transform = offset === 0 ? 'translate3d(-33.333333%, 0, 0)' : `translate3d(calc(-33.333333% + ${offset}px), 0, 0)`;
    });
  };
  const endPageSwipe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') {
      touchPointsRef.current.delete(event.pointerId);
      if (primaryTouchIdRef.current === event.pointerId) primaryTouchIdRef.current = null;
      if (pinchRef.current || pagePinchingRef.current) {
        if (pageScaleRef.current <= 1.02) {
      setPageScaleValue(1);
      setPagePanValue({ x: 0, y: 0 }, 1);
    }
        if (touchPointsRef.current.size < 2) {
          pinchRef.current = null;
          setPagePinchingValue(false);
          setPagePanValue(pagePanRef.current, pageScaleRef.current, false);
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        return;
      }
    }
    const pan = pagePanGestureRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      pagePanGestureRef.current = null;
      setPagePinchingValue(false);
      setPagePanValue(pagePanRef.current, pageScaleRef.current, false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      return;
    }

    const swipe = pageSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      return;
    }
    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    const shouldChangePage = Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    pageSwipeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (shouldChangePage && deltaX < 0 && currentPageIndex < pages.length - 1) {
      animatePageCommit('next', currentPageIndex + 1);
      return;
    }
    if (shouldChangePage && deltaX > 0 && currentPageIndex > 0) {
      animatePageCommit('prev', currentPageIndex - 1);
      return;
    }

    setPageSwiping(false);
    resetPageRail();
  };

  const resetPageRail = () => {
    pageSwipeOffsetRef.current = 0;
    if (pageSwipeFrameRef.current !== null) {
      cancelAnimationFrame(pageSwipeFrameRef.current);
      pageSwipeFrameRef.current = null;
    }
    if (pageElementRef.current) {
      pageElementRef.current.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)';
      pageElementRef.current.style.transform = 'translate3d(-33.333333%, 0, 0)';
      pageElementRef.current.style.opacity = '';
      window.setTimeout(() => {
        if (pageElementRef.current) pageElementRef.current.style.transition = '';
      }, 190);
    }
    if (prevPageRef.current) prevPageRef.current.style.opacity = '';
    if (nextPageRef.current) nextPageRef.current.style.opacity = '';
  };
  const animatePageCommit = (direction: 'prev' | 'next', targetIndex: number) => {
    const rail = pageElementRef.current;
    if (!rail) {
      goToPage(targetIndex);
      return;
    }

    const dataUrl = snapshot();
    const nextPages = [...pages];
    if (dataUrl) {
      nextPages[currentPageIndex] = { ...nextPages[currentPageIndex], dataUrl, updatedAt: new Date().toISOString() };
    }
    const nextNote: CategoryNote = {
      problemSetId: problemSetId ?? '',
      category: normalizedCategory,
      pages: nextPages,
      currentPageIndex: targetIndex,
      updatedAt: new Date().toISOString(),
    };
    preloadNoteImage(nextPages[targetIndex]?.dataUrl ?? '');

    const finishCommit = () => {
      rail.removeEventListener('transitionend', finishCommit);
      pageDataUrlRef.current = nextPages[targetIndex]?.dataUrl ?? '';
      resetTouchGesture();
      resetPageView();
      rail.style.transition = 'none';
      rail.style.transform = 'translate3d(-33.333333%, 0, 0)';
      flushSync(() => {
        setNote(nextNote);
        setPageIndex(targetIndex);
        clearHistory();
      });
      drawDataUrlToCanvas(pageDataUrlRef.current);
      persistNote(nextNote);
      void rail.offsetHeight;
      rail.style.transition = '';
    };

    if (pageSwipeFrameRef.current !== null) {
      cancelAnimationFrame(pageSwipeFrameRef.current);
      pageSwipeFrameRef.current = null;
    }

    const currentOffset = pageSwipeOffsetRef.current;
    rail.style.transition = 'none';
    rail.style.transform = currentOffset === 0 ? 'translate3d(-33.333333%, 0, 0)' : `translate3d(calc(-33.333333% + ${currentOffset}px), 0, 0)`;
    void rail.offsetHeight;

    rail.addEventListener('transitionend', finishCommit, { once: true });
    setPageSwiping(false);
    rail.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
    requestAnimationFrame(() => {
      rail.style.transform = direction === 'next' ? 'translate3d(-66.666667%, 0, 0)' : 'translate3d(0, 0, 0)';
    });
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
    if (pageSwipeRef.current || pinchRef.current || pagePinchingRef.current || touchPointsRef.current.has(event.pointerId)) {
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
    const { width, height } = getCanvasLogicalSize(canvas);
    if (width === 0 || height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const nextWidth = Math.round(width * ratio);
    const nextHeight = Math.round(height * ratio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    ctxRef.current = context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawDataUrlToContext(context, dataUrl, width, height);
  };

  const redrawCanvasFromCurrentImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = getCanvasLogicalSize(canvas);
    if (width === 0 || height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const nextWidth = Math.round(width * ratio);
    const nextHeight = Math.round(height * ratio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    ctxRef.current = context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawDataUrlToContext(context, pageDataUrlRef.current, width, height);
  };

  const handleClose = () => {
    updateCurrentPage();
    const pendingSave = noteSaveQueueRef.current;
    void pendingSave
      .catch(() => undefined)
      .then(() => onClose?.());
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
          <div className="category-note-drawer__title-row">
            <h2>{normalizedCategory}</h2>
            <span>{'\u30da\u30fc\u30b8'} {currentPageIndex + 1} / {pages.length}</span>
            {saveStatusText ? <span className={`category-note-save-state category-note-save-state--${saveState}`} title={saveError || saveStatusText}>{saveStatusText}</span> : null}
          </div>
        </div>
        <div className="category-note-drawer__header-actions">
          <button type="button" onClick={addPage}>{'\u8ffd\u52a0'}</button>
          <button type="button" className="category-note-drawer__danger-button" disabled={pages.length <= 1} onClick={deletePage}>{'\u524a\u9664'}</button>
          {onClose ? <button type="button" onClick={handleClose}>{'\u9589\u3058\u308b'}</button> : null}
        </div>
      </header>

      <div className="category-note-canvas-area">
        <div className="category-note-page-viewport">
          <div
            ref={pageElementRef}
            className={`category-note-page-rail${pageSwiping ? ' category-note-page-rail--swiping' : ''}`}
            aria-label="A4 note page slider"
          >
            <div className="category-note-page-slot" aria-hidden="true">
              <div
                ref={prevPageRef}
                className={`category-note-page category-note-page--preview${currentPageIndex <= 0 ? ' category-note-page--missing' : ''}`}
                style={{ backgroundImage: pages[currentPageIndex - 1]?.dataUrl ? `url(${pages[currentPageIndex - 1].dataUrl})` : undefined }}
              />
            </div>
            <div className="category-note-page-slot">
              <div
                ref={activePageRef}
                className={`category-note-page category-note-page--active${pagePinching ? ' category-note-page--pinching' : ''}`}
                style={{ transform: pageScale === 1 ? undefined : `translate3d(${pagePan.x}px, ${pagePan.y}px, 0) scale(${pageScale})` }}
              >
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
            <div className="category-note-page-slot" aria-hidden="true">
              <div
                ref={nextPageRef}
                className={`category-note-page category-note-page--preview${currentPageIndex >= pages.length - 1 ? ' category-note-page--missing' : ''}`}
                style={{ backgroundImage: pages[currentPageIndex + 1]?.dataUrl ? `url(${pages[currentPageIndex + 1].dataUrl})` : undefined }}
              />
            </div>
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

      <ConfirmDialog
        open={deletePageConfirmOpen}
        title={'\u3053\u306e\u30da\u30fc\u30b8\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f'}
        message={'\u3053\u306e\u30da\u30fc\u30b8\u306b\u66f8\u3044\u305f\u30ce\u30fc\u30c8\u306f\u524a\u9664\u3055\u308c\u307e\u3059\u3002\n\u5143\u306b\u623b\u305b\u307e\u305b\u3093\u3002'}
        confirmLabel={'\u524a\u9664'}
        onCancel={() => setDeletePageConfirmOpen(false)}
        onConfirm={confirmDeletePage}
      />
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
      <path d="M9 8 4 13l5 5" />
      <path d="M4.8 13h9.7a5.2 5.2 0 0 1 0 10.4H11" />
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
  return { id: createId('notePage'), dataUrl: '', updatedAt: new Date().toISOString() };
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

function parseNote(raw: string | null, problemSetId: string, category: string): CategoryNote {
  try {
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

function getCanvasLogicalSize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    width: canvas.offsetWidth || canvas.clientWidth || rect.width,
    height: canvas.offsetHeight || canvas.clientHeight || rect.height,
  };
}
function canDraw(event: PointerEvent<HTMLCanvasElement>) {
  return event.pointerType === 'pen' || (import.meta.env.DEV && event.pointerType === 'mouse');
}

function isPalmLikeTouch(event: PointerEvent<HTMLCanvasElement>) {
  if (event.pointerType !== 'touch') return false;
  const contactArea = event.width * event.height;
  return event.width >= 64 || event.height >= 64 || contactArea >= 3600;
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.offsetWidth > 0 ? canvas.offsetWidth / rect.width : 1;
  const scaleY = canvas.offsetHeight > 0 ? canvas.offsetHeight / rect.height : 1;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function getPointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function preloadNoteImage(dataUrl: string | undefined) {
  if (!dataUrl || getCachedNoteImage(dataUrl)) return;
  const image = new Image();
  image.src = dataUrl;
  setCachedNoteImage(dataUrl, image);
}

function getCachedNoteImage(dataUrl: string) {
  const image = noteImageCache.get(dataUrl);
  if (!image) return undefined;
  noteImageCache.delete(dataUrl);
  noteImageCache.set(dataUrl, image);
  return image;
}

function setCachedNoteImage(dataUrl: string, image: HTMLImageElement) {
  if (noteImageCache.has(dataUrl)) noteImageCache.delete(dataUrl);
  noteImageCache.set(dataUrl, image);
  while (noteImageCache.size > NOTE_IMAGE_CACHE_LIMIT) {
    const oldestKey = noteImageCache.keys().next().value;
    if (!oldestKey) break;
    noteImageCache.delete(oldestKey);
  }
}
function drawDataUrlToContext(context: CanvasRenderingContext2D, dataUrl: string, width: number, height: number) {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  if (!dataUrl) return;

  const cached = getCachedNoteImage(dataUrl);
  if (cached?.complete) {
    context.drawImage(cached, 0, 0, width, height);
    return;
  }

  const image = cached ?? new Image();
  image.onload = () => context.drawImage(image, 0, 0, width, height);
  if (!cached) {
    image.src = dataUrl;
    setCachedNoteImage(dataUrl, image);
  }
}

























