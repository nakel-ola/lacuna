import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Live content size of an element. */
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export type Theme = 'system' | 'light' | 'dark';
const THEMES: Theme[] = ['system', 'light', 'dark'];
const STORAGE_KEY = 'lacuna-theme';

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (value && THEMES.includes(value)) return value;
  } catch {}
  return 'system';
}

/** System / Light / Dark, remembered per machine and applied to the native window too. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    // Match the native window (traffic lights, dialogs) to the chosen theme.
    getCurrentWindow()
      .setTheme(theme === 'system' ? null : theme)
      .catch(() => {});
  }, [theme]);
  const cycle = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  return { theme, cycle };
}
