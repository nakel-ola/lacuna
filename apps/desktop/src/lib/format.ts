import type { Item } from './types';

export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let i = -1;
  do {
    n /= 1000;
    i++;
  } while (n >= 1000 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export const formatCount = (n: number) => n.toLocaleString();

export function formatElapsed(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
}

export function formatPct(part: number, whole: number): string {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return p >= 10 ? `${p.toFixed(0)}%` : p >= 0.1 ? `${p.toFixed(1)}%` : '<0.1%';
}

export const baseName = (p: string) => p.split('/').filter(Boolean).pop() || p;

export const truncate = (str: string, n: number) => (str.length > n ? `${str.slice(0, n - 1)}…` : str);

export function kindLabel(item: Pick<Item, 'kind' | 'name'>): string {
  if (item.kind === 'dir') return 'Folder';
  if (item.kind === 'other') return 'Grouped';
  if (item.kind === 'mount') return 'Volume';
  const ext = item.name.includes('.') ? item.name.split('.').pop() : '';
  return ext && ext.length <= 6 ? `${ext.toUpperCase()} file` : 'File';
}

export function describeError(code: string): string {
  return ({ EACCES: 'No permission', EPERM: 'No permission', OTHER_VOLUME: 'Other volume' } as Record<string, string>)[code] ?? code;
}

export const usedPct = (total: number, free: number) => `${(((total - free) / total) * 100).toFixed(1)}%`;
