import { type PointerEvent, useRef, useState } from 'react';
import './CategoryNoteDrawer.css';

const UNCATEGORIZED = '\u672a\u5206\u985e';

interface CategoryNoteDrawerProps {
  problemSetId?: string;
  category?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CategoryNoteDrawer({ problemSetId, category, open, onOpenChange }: CategoryNoteDrawerProps) {
  const normalizedCategory = normalizeCategory(category);
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
        <header className="category-note-drawer__header">
          <div>
            <p>{'\u30ce\u30fc\u30c8'}</p>
            <h2>{normalizedCategory}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)}>{'\u9589\u3058\u308b'}</button>
        </header>
        <div className="category-note-placeholder">
          <strong>{'\u30ce\u30fc\u30c8\uff1a'}{normalizedCategory}</strong>
          <p>{'\u3053\u3053\u306b\u30ce\u30fc\u30c8\u304c\u8868\u793a\u3055\u308c\u307e\u3059'}</p>
          <span>{'\u624b\u66f8\u304d\u6a5f\u80fd\u306f\u5f8c\u3067\u8ffd\u52a0\u3057\u307e\u3059'}</span>
        </div>
      </aside>
    </>
  );
}

function normalizeCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}