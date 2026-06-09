export function nowIso(): string {
  return new Date().toISOString();
}

export function toLocalDateKey(dateLike: string | Date): string {
  const date = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isToday(iso: string): boolean {
  return toLocalDateKey(iso) === toLocalDateKey(new Date());
}

export function formatBackupDate(): string {
  return toLocalDateKey(new Date());
}

export function formatShortDateTime(iso: string | null): string {
  if (!iso) return '未回答';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未回答';
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDisplayDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
}
