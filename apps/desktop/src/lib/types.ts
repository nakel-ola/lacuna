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
  /** Earlier scan being compared against, if any. */
  baseline: SnapshotInfo | null;
}

export interface ViewNode {
  /** null for the folded "N smaller objects" entry. */
  id: number | null;
  name: string;
  kind: Kind;
  size: number;
  count: number;
  /** Newest change or access below this item (Unix seconds, 0 if unknown). */
  time: number;
  /** Size change since the compared scan. */
  delta?: number;
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
  time: number;
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

export interface Suggestion {
  id: string;
  label: string;
  why: string;
  risk: 'safe' | 'review';
  command?: string;
  size: number;
  items: Hit[];
}

export type WorktreeState = 'active' | 'locked' | 'missing' | 'orphaned';

export interface Worktree {
  name: string;
  path: string;
  branch?: string;
  /** The tool that usually keeps worktrees at this path. */
  agent?: string;
  state: WorktreeState;
  /** The checkout in the scan; absent when it's outside the scan or gone. */
  item?: Hit;
}

export interface Repo {
  name: string;
  /** The main checkout. */
  path: string;
  exists: boolean;
  /** Space used by its worktrees that are in the scan. */
  size: number;
  worktrees: Worktree[];
}

export interface DuplicateGroup {
  size: number;
  copies: number;
  reclaimable: number;
  items: Hit[];
}

export interface VolumeUse {
  name: string;
  role: string;
  used: number;
  scanned: boolean;
}

export interface HiddenSpace {
  wholeVolume: boolean;
  total: number;
  free: number;
  purgeable: number | null;
  volumes: VolumeUse[];
  volumeUsed: number | null;
  scanned: number;
  unreadable: number;
  unaccounted: number;
  snapshots: string[];
}

export interface SnapshotInfo {
  id: string;
  root: string;
  label: string;
  /** Unix seconds. */
  taken: number;
  bytes: number;
  files: number;
}

/** A folder's size in one earlier scan. */
export interface TrendPoint {
  /** Unix seconds. */
  taken: number;
  bytes: number;
  /** Full snapshot id, when this scan can be compared with. */
  snapshot?: string;
}

export interface Change {
  id: number | null;
  name: string;
  location: string;
  kind: Kind;
  before: number;
  after: number;
}

export interface Changes {
  baseline: SnapshotInfo;
  before: number;
  after: number;
  hotspots: Change[];
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
