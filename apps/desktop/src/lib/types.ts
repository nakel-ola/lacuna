// Shapes returned by the Rust commands in src-tauri/src (serde camelCase).

export type Kind = 'dir' | 'file' | 'mount' | 'other';
export type ScanStatus = 'scanning' | 'done' | 'cancelled';

export interface Volume {
  name: string;
  mountPoint: string;
  /** What to scan: the startup disk scans /System/Volumes/Data. */
  scanPath: string;
  total: number;
  free: number;
  isBoot: boolean;
}

export interface Space {
  total: number;
  free: number;
}

export interface Stats {
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  current: string;
}

export interface Summary {
  scanId: number;
  status: ScanStatus;
  root: string;
  label: string;
  stats: Stats;
  space: Space | null;
  elapsedMs: number;
}

export interface ViewNode {
  /** null for the folded "N smaller objects" entry. */
  id: number | null;
  name: string;
  kind: Kind;
  size: number;
  count: number;
  error?: string;
  children?: ViewNode[];
  hasChildren?: boolean;
}

export interface Crumb {
  id: number;
  name: string;
}

export interface FolderView {
  scanId: number;
  path: string;
  ancestors: Crumb[];
  tree: ViewNode;
}

export interface Hit {
  id: number;
  name: string;
  /** Path relative to the scanned folder. */
  location: string;
  kind: Kind;
  size: number;
  count: number;
}

export interface TypeTotal {
  category: string;
  size: number;
  count: number;
}

export interface TrashResult {
  items: { id: number; path: string; size: number }[];
  total: number;
  trashed: number[];
  failed: string[];
}

/** Anything that can appear as a table row. */
export type Item = (ViewNode | Hit) & { location?: string; error?: string };

export interface Collected {
  id: number;
  name: string;
  size: number;
  kind: Kind;
  location: string;
}
