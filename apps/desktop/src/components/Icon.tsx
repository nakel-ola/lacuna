import type { ReactNode } from 'react';

const PATHS = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />,
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  disk: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 14h18" />
      <circle cx="17" cy="16.5" r=".6" fill="currentColor" />
    </>
  ),
  chevrons: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  external: <path d="M7 17 17 7M9 7h8v8" />,
  sort: <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  branch: (
    <>
      <circle cx="6.5" cy="5.5" r="2" />
      <circle cx="6.5" cy="18.5" r="2" />
      <circle cx="17.5" cy="7.5" r="2" />
      <path d="M6.5 7.5v9M17.5 9.5c0 4-5 4-9.5 7.5" />
    </>
  ),
  spark: <path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5v-2a2.5 2.5 0 0 0-2.5-2.5H6a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 6 16h2.5" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4.5H8" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bars: <path d="M5 20v-7M10 20V5M15 20v-10M20 20v-4" />,
  map: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M12 3.5v17M12 13h8.5M3.5 10H12" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span data-icon={name} className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name]}
      </svg>
    </span>
  );
}

/** The Lacuna mark: three tiles and a lens. */
export function Glyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="2.6" fill="currentColor" />
      <rect x="13" y="2" width="9" height="9" rx="2.6" fill="currentColor" opacity=".55" />
      <rect x="2" y="13" width="9" height="9" rx="2.6" fill="currentColor" opacity=".55" />
      <circle cx="16.6" cy="16.6" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M19.3 19.3l2.4 2.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
