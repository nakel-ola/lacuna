# Lacuna

A desktop disk space analyzer for macOS, built with Tauri 2. Pick a disk or folder, see what fills
it, collect what you don't need, and move it to the Trash.

```bash
npm install
npm run dev        # run the app in development
npm run build      # → src-tauri/target/release/bundle/macos/Lacuna.app
npm test           # Rust unit tests
```

## Using it

- **Disks**: your disks with free space. Click **Scan disk**, use **Scan folder** (⌘O), or drop a
  folder anywhere on the window.
- **Overview**: the *Space by folder* bar chart (click a bar to open that folder, ⌘↑ to go up),
  the *Storage overview* (this folder by file type vs. the rest of the disk vs. free), and a
  contents table with filters (All, Folders, Files, Over 1 GB) and sorting by size or name.
- **Large files**: the 200 largest files under the current folder.
- **File types**: space by category (Apps, Developer, Video, Photos, Audio, Documents,
  Archives & disk images, Other). Everything inside `node_modules`, `.git`, `target` and similar
  folders counts as Developer, and everything inside `.app` bundles counts as Apps.
- **Search** (⌘F): find files and folders by name across the whole scan, largest first.
- **Cleanup**: press `+` on any row, or drag rows onto the Cleanup card. **Move to Trash…** shows
  the exact paths and total first; files are recoverable from the Trash, and the views update
  without a rescan.
- ⌘R rescans.

For the startup disk it scans `/System/Volumes/Data`. Since macOS 10.15, `/` is a sealed read-only
system volume, and everything you can change lives on the Data volume. Folders macOS protects show
as "no permission" until you grant **Full Disk Access** (the app shows a banner with a shortcut to
the setting).

## How it works

| Part | File |
|---|---|
| Read a whole folder per syscall with `getattrlistbulk(2)` | `src-tauri/src/bulk.rs` |
| 16 worker threads draining a folder stack; sizes roll up to ancestors under one lock | `src-tauri/src/scanner.rs` |
| Allocated size (`du`-exact), hard links counted once, symlinks not followed, other volumes not entered | `scanner.rs` |
| Depth-limited slices with small items folded together | `src-tauri/src/view.rs` |
| Large files, file-type breakdown, name search | `src-tauri/src/insights.rs` |
| Disks via `statfs` | `src-tauri/src/volumes.rs` |
| Commands: scan, tree, trash, reveal, folder picker | `src-tauri/src/lib.rs` |
| UI (vanilla JS + SVG, no bundler); icon source `app-icon.svg` | `ui/` |

Deletion validates every item on the Rust side. It must belong to the current scan and must not be
the scanned folder itself; items inside an already-selected folder are dropped. Files go through
`NSFileManager.trashItem`, so they're recoverable and macOS doesn't ask to automate Finder.

**Accuracy:** on a 172 GB folder with 6.2M files, the total matched `du -sk` exactly
(180,448,128 KB), in 32 s.
