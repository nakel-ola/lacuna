<div align="center">

<img src="apps/desktop/app-icon.svg" width="112" alt="Lacuna icon" />

# Lacuna

**See what fills your disk. Clear it in a few clicks.**

A fast, native disk space analyzer for macOS, built with Rust and Tauri.

![macOS 10.15+](https://img.shields.io/badge/macOS-10.15%2B-0e0f0e?style=flat-square&logo=apple&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-scanner-0e0f0e?style=flat-square&logo=rust&logoColor=white)
![Tauri 2](https://img.shields.io/badge/Tauri-2-0e0f0e?style=flat-square&logo=tauri&logoColor=white)
![React + TypeScript](https://img.shields.io/badge/React-TypeScript-0e0f0e?style=flat-square&logo=react&logoColor=white)

<br />

<img src="docs/images/screenshot.png" width="860" alt="Lacuna showing space by folder, a storage overview and the contents of the startup disk" />

</div>

<br />

## Why Lacuna

- **Fast.** Reads a whole folder per system call (`getattrlistbulk`) across 16 threads. In testing it scanned 6.2 million files in 32 seconds.
- **Exact.** Totals match `du` to the kilobyte. Hard links are counted once, symlinks aren't followed, and other volumes aren't entered.
- **Safe.** Nothing is deleted outright. Files go to the Trash, and you see the exact paths and total before you confirm.
- **Private.** No network access, no accounts and no telemetry. Your file list never leaves your Mac.
- **Small.** A 6.6 MB app with a native window, light and dark themes, and a custom title bar.

## Features

| | |
|---|---|
| **Disks** | Every mounted disk with free space. Scan one, pick a folder (<kbd>⌘</kbd><kbd>O</kbd>), or drop a folder on the window. |
| **Overview** | *Space by folder* bar chart and a *storage overview* (this folder by file type, everything else, free space). Click a bar to drill in. |
| **Large files** | The 200 biggest files under the current folder. |
| **File types** | Space by category: Apps, Developer, Video, Photos, Audio, Documents, Archives & disk images. `node_modules`, `.git`, `target` and friends count as Developer. |
| **Search** | Find any file or folder by name across the whole scan, largest first (<kbd>⌘</kbd><kbd>F</kbd>). |
| **Cleanup** | Press <kbd>+</kbd> on any row, or drag rows onto the Cleanup card, then review and move them to the Trash. Views update without a rescan. |

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| <kbd>⌘</kbd><kbd>O</kbd> | Scan a folder |
| <kbd>⌘</kbd><kbd>F</kbd> | Search |
| <kbd>⌘</kbd><kbd>R</kbd> | Rescan |
| <kbd>⌘</kbd><kbd>↑</kbd> | Up one folder |
| <kbd>Esc</kbd> | Clear search / close menus |

## Getting started

Lacuna isn't published as a download yet, so build it from source.

**You'll need:** macOS 10.15 or later, [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) 10+.

```bash
git clone <this-repo> lacuna
cd lacuna
pnpm install

pnpm dev      # run the app with hot reload
pnpm build    # → apps/desktop/src-tauri/target/release/bundle/macos/Lacuna.app
pnpm test     # Rust unit tests
```

### Full Disk Access

macOS protects some folders (Mail, Safari, other apps' data). Without **Full Disk Access** they show up as "No permission" and their size can't be counted. Lacuna shows a banner with a shortcut to the setting:

> System Settings → Privacy & Security → Full Disk Access → enable **Lacuna**

On the startup disk Lacuna scans `/System/Volumes/Data`. Since macOS 10.15, `/` is a sealed, read-only system volume, and everything you can change lives on the Data volume.

## How it works

```
┌──────────────────────────── Lacuna.app ────────────────────────────┐
│                                                                    │
│   React + TypeScript UI            Rust core (Tauri commands)      │
│   ─────────────────────            ──────────────────────────      │
│   charts, tables, cleanup   ◀──▶   scanner  · 16 threads,          │
│   zustand store                       getattrlistbulk, arena tree  │
│                                    view     · depth-limited slices │
│        ▲  scan-progress /          insights · large files, types,  │
│        └─ scan-done events                    search               │
│                                    volumes  · statfs               │
│                                    trash    · NSFileManager        │
└────────────────────────────────────────────────────────────────────┘
```

| Piece | Where | What it does |
|---|---|---|
| Bulk directory reads | [`bulk.rs`](apps/desktop/src-tauri/src/bulk.rs) | `getattrlistbulk(2)` returns names, types, inode and allocated size for a whole folder in one call. |
| Parallel scanner | [`scanner.rs`](apps/desktop/src-tauri/src/scanner.rs) | 16 workers drain a shared folder queue into an arena tree (`Vec<Node>` with `u32` ids). Sizes roll up to every ancestor as they're found, so the UI can draw a partial tree while scanning. |
| Views | [`view.rs`](apps/desktop/src-tauri/src/view.rs) | Sends the UI one folder at a time, folding items under 0.2% into "N smaller objects". |
| Insights | [`insights.rs`](apps/desktop/src-tauri/src/insights.rs) | Largest files (min-heap), file-type breakdown and name search. |
| Disks | [`volumes.rs`](apps/desktop/src-tauri/src/volumes.rs) | Mounted volumes and free space via `statfs`. |
| Commands | [`lib.rs`](apps/desktop/src-tauri/src/lib.rs) | Scan lifecycle, tree queries, Reveal in Finder, and Trash. Every deletion is re-checked on the Rust side: it must belong to the current scan, can't be the scanned folder itself, and items inside an already selected folder are dropped. |
| UI | [`apps/desktop/src`](apps/desktop/src) | React components, a zustand store, and typed wrappers for every command in [`api.ts`](apps/desktop/src/lib/api.ts). |

## Project structure

```
.
├── apps/
│   └── desktop/              # the Lacuna app
│       ├── src/              # React + TypeScript UI
│       ├── src-tauri/        # Rust core and Tauri config
│       └── app-icon.svg      # icon source (pnpm --filter @lacuna/desktop icon)
├── docs/                     # design notes and images
├── turbo.json                # Turborepo tasks: dev, build, test, typecheck
└── pnpm-workspace.yaml
```

It's a [Turborepo](https://turborepo.com) monorepo, so the landing page can live next to the app in `apps/web`.

## Roadmap

- [ ] Signed and notarized releases (DMG)
- [ ] Landing page (`apps/web`)
- [ ] Privileged helper to scan folders even Full Disk Access can't read
- [ ] APFS snapshots and purgeable space
- [ ] Quick Look previews
- [ ] Windows and Linux (the scanner already falls back to `std::fs` off macOS)

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
pnpm typecheck
pnpm test
```

Keep changes focused, and match the style of the code around them.
