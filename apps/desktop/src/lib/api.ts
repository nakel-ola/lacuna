import { invoke } from '@tauri-apps/api/core';
import type { Changes, DuplicateGroup, FolderView, HiddenSpace, Hit, Repo, SnapshotInfo, Suggestion, Summary, TrendPoint, TrashResult, TypeTotal, Volume } from './types';

// Typed wrappers for the commands registered in src-tauri/src/lib.rs.
export const api = {
  listVolumes: () => invoke<Volume[]>('list_volumes'),
  hasFullDiskAccess: () => invoke<boolean>('has_full_disk_access'),
  openFullDiskAccessSettings: () => invoke<void>('open_full_disk_access_settings'),
  currentScan: () => invoke<Summary | null>('current_scan'),
  startScan: (path: string, label?: string) => invoke<Summary>('start_scan', { path, label: label ?? null }),
  cancelScan: () => invoke<void>('cancel_scan'),
  getTree: (id: number | null, depth: number) => invoke<FolderView>('get_tree', { id, depth }),
  typeBreakdown: (id: number | null) => invoke<TypeTotal[]>('type_breakdown', { id }),
  largestFiles: (id: number | null, limit: number) => invoke<Hit[]>('largest_files', { id, limit }),
  searchItems: (query: string, limit: number) => invoke<Hit[]>('search_items', { query, limit }),
  untouchedItems: (id: number | null, days: number, limit: number) => invoke<Hit[]>('untouched_items', { id, days, limit }),
  suggestions: (id: number | null) => invoke<Suggestion[]>('suggestions', { id }),
  gitWorktrees: (id: number | null) => invoke<Repo[]>('git_worktrees', { id }),
  findDuplicates: (id: number | null) => invoke<DuplicateGroup[]>('find_duplicates', { id }),
  cancelDuplicates: () => invoke<void>('cancel_duplicates'),
  hiddenSpace: () => invoke<HiddenSpace | null>('hidden_space'),
  listSnapshots: () => invoke<SnapshotInfo[]>('list_snapshots'),
  sizeHistory: (id: number | null) => invoke<TrendPoint[]>('size_history', { id }),
  setBaseline: (snapshot: string | null) => invoke<Summary>('set_baseline', { snapshot }),
  getChanges: (id: number | null) => invoke<Changes | null>('get_changes', { id }),
  clearHistory: () => invoke<Summary>('clear_history'),
  quickLook: (id: number | null) => invoke<void>('quick_look', { id }),
  exportCsv: (id: number | null) => invoke<string | null>('export_csv', { id }),
  trashItems: (scanId: number, ids: number[], dryRun: boolean) => invoke<TrashResult>('trash_items', { scanId, ids, dryRun }),
  reveal: (id: number) => invoke<void>('reveal', { id }),
  chooseFolder: () => invoke<string | null>('choose_folder'),
};
