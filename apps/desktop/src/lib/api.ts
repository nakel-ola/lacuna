import { invoke } from '@tauri-apps/api/core';
import type { FolderView, Hit, Summary, TrashResult, TypeTotal, Volume } from './types';

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
  trashItems: (scanId: number, ids: number[], dryRun: boolean) => invoke<TrashResult>('trash_items', { scanId, ids, dryRun }),
  reveal: (id: number) => invoke<void>('reveal', { id }),
  chooseFolder: () => invoke<string | null>('choose_folder'),
};
