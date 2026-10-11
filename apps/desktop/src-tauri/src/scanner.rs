//! Concurrent scanner and in-memory tree.
//!
//! A stack of folders drained by worker threads.
//! Each worker reads a whole folder without holding any lock, then publishes
//! its children and rolls their sizes up to every ancestor under the tree
//! lock — so the UI can render a consistent partial tree mid-scan.

use crate::bulk::{self, TYPE_DIR, TYPE_SYMLINK};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, MutexGuard};

pub const NO_PARENT: u32 = u32::MAX;
pub const ROOT: u32 = 0;
/// Pseudo-errno for folders on another volume (not entered).
pub const OTHER_VOLUME: i32 = -1;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Dir,
    File,
    Symlink,
    Mount,
}

pub struct Node {
    pub name: Box<str>,
    pub parent: u32,
    pub kind: Kind,
    /// Allocated bytes including all descendants.
    pub size: u64,
    /// Files at or below this node.
    pub files: u64,
    pub children: Vec<u32>,
    pub error: i32,
    pub removed: bool,
}

#[derive(Clone, Default, Serialize)]
pub struct Stats {
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub errors: u64,
    pub current: String,
}

/// Arena of nodes; ids are indices and stay valid for the life of the scan.
pub struct Tree {
    pub root_path: PathBuf,
    pub nodes: Vec<Node>,
    pub stats: Stats,
    seen_inodes: HashSet<(u64, u64)>,
}

impl Tree {
    fn new(root_path: PathBuf) -> Self {
        let root = Node {
            name: root_path.to_string_lossy().into(),
            parent: NO_PARENT,
            kind: Kind::Dir,
            size: 0,
            files: 0,
            children: Vec::new(),
            error: 0,
            removed: false,
        };
        Tree { root_path, nodes: vec![root], stats: Stats::default(), seen_inodes: HashSet::new() }
    }

    pub fn get(&self, id: u32) -> Option<&Node> {
        self.nodes.get(id as usize).filter(|n| !n.removed)
    }

    /// True if the node exists and every ancestor is still in the tree.
    pub fn is_attached(&self, id: u32) -> bool {
        let mut cur = id;
        loop {
            match self.get(cur) {
                None => return false,
                Some(n) if n.parent == NO_PARENT => return cur == ROOT,
                Some(n) => cur = n.parent,
            }
        }
    }

    pub fn path_of(&self, id: u32) -> PathBuf {
        let mut parts = Vec::new();
        let mut cur = id;
        while cur != ROOT && cur != NO_PARENT {
            let n = &self.nodes[cur as usize];
            parts.push(&*n.name);
            cur = n.parent;
        }
        let mut path = self.root_path.clone();
        path.extend(parts.into_iter().rev());
        path
    }

    /// (id, name) from the root down to `id`.
    pub fn ancestors(&self, id: u32) -> Vec<(u32, String)> {
        let mut chain = Vec::new();
        let mut cur = id;
        while cur != NO_PARENT {
            let n = &self.nodes[cur as usize];
            chain.push((cur, n.name.to_string()));
            cur = n.parent;
        }
        chain.reverse();
        chain
    }

    pub fn is_ancestor(&self, ancestor: u32, mut id: u32) -> bool {
        while id != NO_PARENT {
            id = self.nodes[id as usize].parent;
            if id == ancestor {
                return true;
            }
        }
        false
    }

    fn roll_up(&mut self, from: u32, bytes: i64, files: i64) {
        let mut cur = from;
        while cur != NO_PARENT {
            let n = &mut self.nodes[cur as usize];
            n.size = n.size.wrapping_add_signed(bytes);
            n.files = n.files.wrapping_add_signed(files);
            cur = n.parent;
        }
        self.stats.bytes = self.stats.bytes.wrapping_add_signed(bytes);
        self.stats.files = self.stats.files.wrapping_add_signed(files);
    }

    /// Detach a node that was deleted on disk and subtract it from its
    /// ancestors — no rescan needed.
    pub fn remove(&mut self, id: u32) {
        if id == ROOT || !self.is_attached(id) {
            return;
        }
        let (parent, size, files) = {
            let n = &self.nodes[id as usize];
            (n.parent, n.size, n.files)
        };
        self.nodes[parent as usize].children.retain(|&c| c != id);
        self.roll_up(parent, -(size as i64), -(files as i64));
        let mut stack = vec![id];
        while let Some(i) = stack.pop() {
            let n = &mut self.nodes[i as usize];
            n.removed = true;
            stack.extend(std::mem::take(&mut n.children));
        }
    }
}

struct Queue {
    pending: Vec<(u32, PathBuf)>,
    active: usize,
}

pub struct Scanner {
    tree: Mutex<Tree>,
    queue: Mutex<Queue>,
    wake: Condvar,
    cancelled: AtomicBool,
    root_dev: u64,
    cross_devices: bool,
}

impl Scanner {
    pub fn new(root: &Path, cross_devices: bool) -> std::io::Result<Self> {
        let root = std::fs::canonicalize(root)?;
        if !std::fs::symlink_metadata(&root)?.is_dir() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a folder"));
        }
        Ok(Scanner {
            root_dev: bulk::device_of(&root)?,
            tree: Mutex::new(Tree::new(root.clone())),
            queue: Mutex::new(Queue { pending: vec![(ROOT, root)], active: 0 }),
            wake: Condvar::new(),
            cancelled: AtomicBool::new(false),
            cross_devices,
        })
    }

    pub fn tree(&self) -> MutexGuard<'_, Tree> {
        self.tree.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        let mut q = self.queue.lock().unwrap();
        q.pending.clear();
        self.wake.notify_all();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Blocks until the whole tree is scanned (or cancelled).
    pub fn run(&self, threads: usize) {
        std::thread::scope(|s| {
            for _ in 1..threads.max(1) {
                s.spawn(|| self.worker());
            }
            self.worker();
        });
    }

    fn worker(&self) {
        loop {
            let (id, path) = {
                let mut q = self.queue.lock().unwrap();
                loop {
                    if self.is_cancelled() {
                        return;
                    }
                    if let Some(item) = q.pending.pop() {
                        q.active += 1;
                        break item;
                    }
                    if q.active == 0 {
                        self.wake.notify_all();
                        return;
                    }
                    q = self.wake.wait(q).unwrap();
                }
            };
            let subdirs = self.scan_dir(id, &path);
            let mut q = self.queue.lock().unwrap();
            q.active -= 1;
            if !self.is_cancelled() {
                q.pending.extend(subdirs);
            }
            self.wake.notify_all();
        }
    }

    fn scan_dir(&self, id: u32, path: &Path) -> Vec<(u32, PathBuf)> {
        let mut entries = Vec::new();
        let result = bulk::read_dir(path, |e| entries.push(e));

        let mut tree = self.tree();
        if let Err(errno) = result {
            // Unreadable folders (EACCES/EPERM without Full Disk Access) stay in
            // the tree, flagged; their contents count as hidden space.
            tree.nodes[id as usize].error = errno;
            tree.stats.errors += 1;
            if entries.is_empty() {
                return Vec::new();
            }
        }

        let mut children = Vec::with_capacity(entries.len());
        let mut subdirs = Vec::new();
        let mut bytes = 0u64;
        let mut files = 0u64;
        for e in entries {
            if e.error != 0 {
                tree.stats.errors += 1;
                continue;
            }
            let child_id = tree.nodes.len() as u32;
            let (kind, size, error) = match e.kind {
                TYPE_DIR if e.dev != self.root_dev && !self.cross_devices => (Kind::Mount, 0, OTHER_VOLUME),
                TYPE_DIR => {
                    subdirs.push((child_id, path.join(&e.name)));
                    (Kind::Dir, 0, 0)
                }
                _ => {
                    // Hard links: only the first path seen keeps the bytes.
                    let counted = e.nlink <= 1 || tree.seen_inodes.insert((e.dev, e.ino));
                    let size = if counted { e.alloc } else { 0 };
                    bytes += size;
                    files += 1;
                    (if e.kind == TYPE_SYMLINK { Kind::Symlink } else { Kind::File }, size, 0)
                }
            };
            tree.nodes.push(Node {
                name: e.name.into_boxed_str(),
                parent: id,
                kind,
                size,
                files: u64::from(!matches!(kind, Kind::Dir | Kind::Mount)),
                children: Vec::new(),
                error,
                removed: false,
            });
            children.push(child_id);
        }
        tree.nodes[id as usize].children = children;
        tree.stats.dirs += 1;
        tree.stats.current = path.to_string_lossy().into_owned();
        tree.roll_up(id, bytes as i64, files as i64);
        subdirs
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn alloc(p: &Path) -> u64 {
        use std::os::unix::fs::MetadataExt;
        fs::symlink_metadata(p).unwrap().blocks() * 512
    }

    fn find(tree: &Tree, rel: &str) -> u32 {
        let want = tree.root_path.join(rel);
        (0..tree.nodes.len() as u32).find(|&i| tree.get(i).is_some() && tree.path_of(i) == want).expect(rel)
    }

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        fs::create_dir_all(r.join("big/nested")).unwrap();
        fs::create_dir(r.join("small")).unwrap();
        fs::write(r.join("big/a.bin"), vec![1u8; 400_000]).unwrap();
        fs::write(r.join("big/nested/b.bin"), vec![1u8; 200_000]).unwrap();
        fs::write(r.join("small/c.txt"), b"hello").unwrap();
        fs::write(r.join("shared.bin"), vec![1u8; 50_000]).unwrap();
        fs::hard_link(r.join("shared.bin"), r.join("small/shared-link.bin")).unwrap();
        std::os::unix::fs::symlink(r.join("big"), r.join("loop")).unwrap();
        dir
    }

    fn scan(dir: &Path) -> Scanner {
        let s = Scanner::new(dir, false).unwrap();
        s.run(4);
        s
    }

    #[test]
    fn sizes_roll_up_and_match_allocated_blocks() {
        let dir = fixture();
        let s = scan(dir.path());
        let t = s.tree();
        let r = &t.root_path;
        let big = t.get(find(&t, "big")).unwrap();
        assert_eq!(big.size, alloc(&r.join("big/a.bin")) + alloc(&r.join("big/nested/b.bin")));
        assert_eq!(big.files, 2);
        assert_eq!(t.nodes[0].size, t.nodes[0].children.iter().map(|&c| t.nodes[c as usize].size).sum::<u64>());
        assert_eq!(t.stats.errors, 0);
        assert_eq!(t.stats.files, 6); // a, b, c, shared, shared-link, loop
    }

    #[test]
    fn hard_links_count_once_and_symlinks_are_not_followed() {
        let dir = fixture();
        let s = scan(dir.path());
        let t = s.tree();
        let mut sizes = [t.nodes[find(&t, "shared.bin") as usize].size, t.nodes[find(&t, "small/shared-link.bin") as usize].size];
        sizes.sort();
        assert_eq!(sizes, [0, alloc(&t.root_path.join("shared.bin"))]);
        assert_eq!(t.nodes[find(&t, "loop") as usize].kind, Kind::Symlink);
    }

    #[test]
    fn unreadable_folders_are_flagged_not_fatal() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let dir = fixture();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let s = scan(dir.path());
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        let t = s.tree();
        assert_eq!(t.nodes[find(&t, "locked") as usize].error, libc::EACCES);
        assert_eq!(t.stats.errors, 1);
    }

    #[test]
    fn remove_subtracts_from_ancestors() {
        let dir = fixture();
        let s = scan(dir.path());
        let mut t = s.tree();
        let before = t.nodes[0].size;
        let nested = find(&t, "big/nested");
        let nested_size = t.nodes[nested as usize].size;
        let b = find(&t, "big/nested/b.bin");
        t.remove(nested);
        assert_eq!(t.nodes[0].size, before - nested_size);
        assert!(!t.is_attached(b));
        t.remove(ROOT); // no-op
        assert!(t.is_attached(ROOT));
    }

    /// `DA_BENCH_PATH=/some/folder cargo test --release bench -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench() {
        let path = std::env::var("DA_BENCH_PATH").expect("set DA_BENCH_PATH");
        let started = std::time::Instant::now();
        let s = Scanner::new(Path::new(&path), false).unwrap();
        s.run(16);
        let t = s.tree();
        println!(
            "KB={} files={} dirs={} errors={} ms={}",
            t.nodes[0].size / 1024,
            t.stats.files,
            t.stats.dirs,
            t.stats.errors,
            started.elapsed().as_millis()
        );
    }
}
