const MEBIBYTE = 1024 * 1024;
const RGBA_BYTES_PER_PIXEL = 4;
const HISTORY_ENTRY_OVERHEAD_BYTES = 160;

// Keep the note editor's transient allocations bounded on mobile Safari and
// Android WebView. Persisted note data remains in its existing data-URL shape.
export const NOTE_CANVAS_PIXEL_BUDGET_BYTES = 8 * MEBIBYTE;
export const NOTE_DECODED_IMAGE_CACHE_BUDGET_BYTES = 12 * MEBIBYTE;
export const NOTE_UNDO_HISTORY_BUDGET_BYTES = 24 * MEBIBYTE;

export type ByteBudgetHistory<T> = Readonly<{
  entries: ReadonlyArray<Readonly<{ value: T; byteSize: number }>>;
  byteSize: number;
}>;

export function createByteBudgetHistory<T>(): ByteBudgetHistory<T> {
  return { entries: [], byteSize: 0 };
}

export function appendByteBudgetHistory<T>(
  history: ByteBudgetHistory<T>,
  value: T,
  byteSize: number,
  maxBytes: number,
): ByteBudgetHistory<T> {
  const normalizedSize = normalizeByteSize(byteSize);
  const normalizedBudget = normalizeByteSize(maxBytes);

  // Keeping an older state without the immediately preceding state would make
  // Undo skip a user action. Clear the stack when that state cannot fit.
  if (normalizedSize > normalizedBudget || normalizedBudget === 0) {
    return createByteBudgetHistory<T>();
  }

  const entries = [...history.entries, { value, byteSize: normalizedSize }];
  let totalBytes = history.byteSize + normalizedSize;
  let firstRetainedIndex = 0;
  while (totalBytes > normalizedBudget && firstRetainedIndex < entries.length - 1) {
    totalBytes -= entries[firstRetainedIndex].byteSize;
    firstRetainedIndex += 1;
  }

  return {
    entries: entries.slice(firstRetainedIndex),
    byteSize: totalBytes,
  };
}

export function popByteBudgetHistory<T>(history: ByteBudgetHistory<T>): Readonly<{
  history: ByteBudgetHistory<T>;
  value: T | undefined;
}> {
  const lastEntry = history.entries[history.entries.length - 1];
  if (!lastEntry) return { history, value: undefined };
  return {
    history: {
      entries: history.entries.slice(0, -1),
      byteSize: history.byteSize - lastEntry.byteSize,
    },
    value: lastEntry.value,
  };
}

export function estimateDataUrlMemoryBytes(dataUrl: string): number {
  // JavaScript engines may use two bytes per UTF-16 code unit. Counting that
  // upper bound plus the array/object slot keeps the budget conservative.
  return normalizeByteSize(dataUrl.length * 2 + HISTORY_ENTRY_OVERHEAD_BYTES);
}

export function estimateRgbaPixelBytes(width: number, height: number): number {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const pixels = safeWidth * safeHeight;
  if (!Number.isSafeInteger(pixels) || pixels > Number.MAX_SAFE_INTEGER / RGBA_BYTES_PER_PIXEL) {
    return Number.MAX_SAFE_INTEGER;
  }
  return pixels * RGBA_BYTES_PER_PIXEL;
}

export type CanvasBackingStoreSize = Readonly<{
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  pixelBytes: number;
}>;

export function getCanvasBackingStoreSize(
  logicalWidth: number,
  logicalHeight: number,
  requestedPixelRatio: number,
  maxPixelBytes = NOTE_CANVAS_PIXEL_BUDGET_BYTES,
): CanvasBackingStoreSize {
  const width = Math.max(1, finitePositive(logicalWidth, 1));
  const height = Math.max(1, finitePositive(logicalHeight, 1));
  const ratio = finitePositive(requestedPixelRatio, 1);
  const maxPixels = Math.max(1, Math.floor(normalizeByteSize(maxPixelBytes) / RGBA_BYTES_PER_PIXEL));
  const requestedPixels = width * height * ratio * ratio;
  const budgetScale = requestedPixels > maxPixels
    ? Math.sqrt(maxPixels / (width * height))
    : ratio;
  const scale = Math.min(ratio, budgetScale);

  let backingWidth = Math.max(1, Math.floor(width * scale));
  let backingHeight = Math.max(1, Math.floor(height * scale));
  if (backingWidth * backingHeight > maxPixels) {
    backingHeight = Math.max(1, Math.floor(maxPixels / backingWidth));
  }
  if (backingWidth * backingHeight > maxPixels) {
    backingWidth = Math.max(1, Math.floor(maxPixels / backingHeight));
  }

  return {
    width: backingWidth,
    height: backingHeight,
    scaleX: backingWidth / width,
    scaleY: backingHeight / height,
    pixelBytes: backingWidth * backingHeight * RGBA_BYTES_PER_PIXEL,
  };
}

export class ByteBudgetLruCache<Key, Value> {
  readonly maxBytes: number;
  #entries = new Map<Key, { value: Value; byteSize: number }>();
  #byteSize = 0;

  constructor(maxBytes: number) {
    this.maxBytes = normalizeByteSize(maxBytes);
  }

  get size(): number {
    return this.#entries.size;
  }

  get byteSize(): number {
    return this.#byteSize;
  }

  peek(key: Key): Value | undefined {
    return this.#entries.get(key)?.value;
  }

  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value, byteSize: number): boolean {
    const normalizedSize = normalizeByteSize(byteSize);
    this.delete(key);
    if (normalizedSize > this.maxBytes || this.maxBytes === 0) return false;

    while (this.#byteSize + normalizedSize > this.maxBytes && this.#entries.size > 0) {
      const oldestKey = this.#entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    this.#entries.set(key, { value, byteSize: normalizedSize });
    this.#byteSize += normalizedSize;
    return true;
  }

  delete(key: Key): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    this.#entries.delete(key);
    this.#byteSize -= entry.byteSize;
    return true;
  }

  clear(): void {
    this.#entries.clear();
    this.#byteSize = 0;
  }
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function normalizeByteSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(value));
}
