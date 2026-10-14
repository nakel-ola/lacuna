//! Duplicate files: same content, byte for byte.
//!
//! Candidates are narrowed cheaply before anything is read in full:
//! 1. same allocated size (already known from the scan),
//! 2. same length, and storage of their own: hard links and APFS clones
//!    share their bytes, so they're one copy and are read once (pnpm, for
//!    one, fills node_modules with clones),
//! 3. same 16 KB samples from the start, middle and end,
//! 4. same BLAKE3 hash of the whole file.
//!
//! Each step runs on several threads, and large files are memory-mapped and
//! hashed on every core. Only step 4 reads much, largest files first.

use crate::insights::{self, Hit};
use crate::scanner::{Kind, Scanner};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

/// Smaller files rarely matter for space and multiply the work.
pub const MIN_SIZE: u64 = 1_000_000;
const SAMPLE: usize = 16 * 1024;
/// Files at least this big are memory-mapped and hashed in parallel.
const MMAP_MIN: u64 = 16 << 20;
/// Hash this much of a mapped file between cancellation checks.
const CHUNK: usize = 256 << 20;
/// Parallel readers: SSDs serve several reads at once much faster than one.
const THREADS: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    /// Bytes each copy takes on disk.
    pub size: u64,
    /// Copies with their own storage.
    pub copies: usize,
    /// Freed by keeping one copy.
    pub reclaimable: u64,
    pub items: Vec<Hit>,
}

/// Bytes read in full so far, and the total that will be.
pub type Progress<'a> = &'a (dyn Fn(u64, u64) + Sync);

/// One stored copy: every path that shares the same bytes on disk.
struct Copy {
    ids: Vec<u32>,
    path: PathBuf,
    len: u64,
    alloc: u64,
}

/// Duplicate groups below `id`, most reclaimable first. The tree lock is held
/// only while candidates are collected, not while files are read.
pub fn find(scanner: &Scanner, id: u32, limit: usize, cancel: &AtomicBool, progress: Progress) -> Vec<Group> {
    let mut by_alloc: HashMap<u64, Vec<(u32, PathBuf)>> = HashMap::new();
    {
        let tree = scanner.tree();
        let mut stack = vec![id];
        while let Some(n) = stack.pop() {
            for &c in &tree.nodes[n as usize].children {
                let child = &tree.nodes[c as usize];
                match child.kind {
                    Kind::Dir => stack.push(c),
                    Kind::File if child.size >= MIN_SIZE => by_alloc.entry(child.size).or_default().push((c, tree.path_of(c))),
                    _ => {}
                }
            }
        }
    }
    let candidates: Vec<(u64, u32, PathBuf)> =
        by_alloc.into_iter().filter(|(_, v)| v.len() > 1).flat_map(|(alloc, v)| v.into_iter().map(move |(i, p)| (alloc, i, p))).collect();

    // 2. Length and storage. Paths sharing storage collapse into one copy.
    let identities = par_map(&candidates, cancel, |(_, _, p)| identity(p));
    let mut copies: HashMap<(u64, Storage), Copy> = HashMap::new();
    for ((alloc, id, path), ident) in candidates.into_iter().zip(identities) {
        let Some((len, storage)) = ident else { continue };
        copies.entry((len, storage)).or_insert_with(|| Copy { ids: Vec::new(), path, len, alloc }).ids.push(id);
    }
    let mut by_len: HashMap<u64, Vec<Copy>> = HashMap::new();
    for ((len, _), copy) in copies {
        by_len.entry(len).or_default().push(copy);
    }
    let copies: Vec<Copy> = by_len.into_values().filter(|v| v.len() > 1).flatten().collect();

    // 3. Samples. 4. Full hash, with progress by bytes.
    let mut copies: Vec<Copy> = matching(copies, cancel, |c| sample(&c.path, c.len)).into_iter().flatten().collect();
    // Biggest first, so the bulk of the reading overlaps with smaller files.
    copies.sort_by(|a, b| b.len.cmp(&a.len));
    let total: u64 = copies.iter().map(|c| c.len).sum();
    let done = AtomicU64::new(0);
    progress(0, total);
    let same = matching(copies, cancel, |c| {
        let d = digest(&c.path, c.len, cancel);
        progress(done.fetch_add(c.len, Ordering::Relaxed) + c.len, total);
        d
    });
    if cancel.load(Ordering::Relaxed) {
        return Vec::new();
    }

    let mut groups: Vec<(u64, usize, Vec<u32>)> = same
        .into_iter()
        .map(|v| (v[0].alloc * (v.len() as u64 - 1), v.len(), v.into_iter().flat_map(|c| c.ids).collect()))
        .collect();
    groups.sort_by(|a, b| b.0.cmp(&a.0));
    groups.truncate(limit);

    let tree = scanner.tree();
    groups
        .into_iter()
        .filter(|(_, _, ids)| ids.iter().all(|&i| tree.is_attached(i)))
        .map(|(reclaimable, copies, ids)| {
            let mut items = insights::hits(&tree, id, ids);
            items.sort_by(|a, b| (&a.location, &a.name).cmp(&(&b.location, &b.name)));
            Group { size: items.iter().map(|i| i.size).max().unwrap_or(0), copies, reclaimable, items }
        })
        .collect()
}

/// Groups of copies with the same length and the same `key` (computed in
/// parallel). Copies alone in their group are dropped.
fn matching(copies: Vec<Copy>, cancel: &AtomicBool, key: impl Fn(&Copy) -> Option<[u8; 32]> + Sync) -> Vec<Vec<Copy>> {
    let keys = par_map(&copies, cancel, key);
    let mut by: HashMap<(u64, [u8; 32]), Vec<Copy>> = HashMap::new();
    for (copy, k) in copies.into_iter().zip(keys) {
        if let Some(k) = k {
            by.entry((copy.len, k)).or_default().push(copy);
        }
    }
    by.into_values().filter(|v| v.len() > 1).collect()
}

/// `f` over `items` on up to `THREADS` threads, results in order. Stops
/// early (leaving `None`s) when cancelled.
fn par_map<T: Sync, R: Send>(items: &[T], cancel: &AtomicBool, f: impl Fn(&T) -> Option<R> + Sync) -> Vec<Option<R>> {
    let next = AtomicUsize::new(0);
    let parts: Vec<Vec<(usize, R)>> = std::thread::scope(|s| {
        let workers: Vec<_> = (0..THREADS.min(items.len()).max(1))
            .map(|_| {
                s.spawn(|| {
                    let mut done = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= items.len() || cancel.load(Ordering::Relaxed) {
                            return done;
                        }
                        if let Some(r) = f(&items[i]) {
                            done.push((i, r));
                        }
                    }
                })
            })
            .collect();
        workers.into_iter().map(|w| w.join().unwrap_or_default()).collect()
    });
    let mut out: Vec<Option<R>> = Vec::with_capacity(items.len());
    out.resize_with(items.len(), || None);
    for (i, r) in parts.into_iter().flatten() {
        out[i] = Some(r);
    }
    out
}

/// Hash of three 16 KB samples: start, middle and end.
fn sample(path: &Path, len: u64) -> Option<[u8; 32]> {
    let mut f = File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; SAMPLE];
    for at in [0, len / 2, len.saturating_sub(SAMPLE as u64)] {
        f.seek(SeekFrom::Start(at)).ok()?;
        let n = read_full(&mut f, &mut buf)?;
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().into())
}

fn read_full(f: &mut File, buf: &mut [u8]) -> Option<usize> {
    let mut n = 0;
    while n < buf.len() {
        match f.read(&mut buf[n..]).ok()? {
            0 => break,
            k => n += k,
        }
    }
    Some(n)
}

/// BLAKE3 of the whole file; gives up when cancelled.
fn digest(path: &Path, len: u64, cancel: &AtomicBool) -> Option<[u8; 32]> {
    let f = File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    if len >= MMAP_MIN {
        // Safety: the map is read-only and dropped before returning. If another
        // process truncates the file meanwhile, reads past the end fault; that
        // is the same risk every mmap reader takes and is vanishingly rare here.
        if let Ok(map) = unsafe { memmap2::MmapOptions::new().map(&f) } {
            let _ = map.advise(memmap2::Advice::Sequential);
            for chunk in map.chunks(CHUNK) {
                if cancel.load(Ordering::Relaxed) {
                    return None;
                }
                hasher.update_rayon(chunk);
            }
            return Some(hasher.finalize().into());
        }
    }
    let mut f = f;
    let mut buf = vec![0u8; 1 << 20];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            return Some(hasher.finalize().into());
        }
        hasher.update(&buf[..n]);
    }
}

/// What a file's bytes are stored as: an APFS clone id where available,
/// otherwise its inode. Equal storage means deleting one frees nothing.
type Storage = (u64, u64);

/// Length and storage of a file, in one system call on macOS.
#[cfg(target_os = "macos")]
fn identity(path: &Path) -> Option<(u64, Storage)> {
    use std::os::raw::{c_char, c_int, c_void};
    use std::os::unix::ffi::OsStrExt;
    const ATTR_CMN_DEVID: u32 = 0x0000_0002;
    const ATTR_CMN_FILEID: u32 = 0x0200_0000;
    const ATTR_FILE_DATALENGTH: u32 = 0x0000_0200;
    const ATTR_CMNEXT_CLONEID: u32 = 0x0000_0100;
    const FSOPT_NOFOLLOW: u32 = 0x0000_0001;
    const FSOPT_ATTR_CMN_EXTENDED: u32 = 0x0000_0020;
    #[repr(C)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }
    extern "C" {
        fn getattrlist(path: *const c_char, list: *mut c_void, buf: *mut c_void, size: usize, options: u32) -> c_int;
    }
    let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    // With FSOPT_ATTR_CMN_EXTENDED, `forkattr` carries ATTR_CMNEXT_* bits,
    // packed after the file attributes.
    let mut list = AttrList {
        bitmapcount: 5,
        reserved: 0,
        commonattr: ATTR_CMN_DEVID | ATTR_CMN_FILEID,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_DATALENGTH,
        forkattr: ATTR_CMNEXT_CLONEID,
    };
    let mut buf = [0u8; 64];
    let opts = FSOPT_NOFOLLOW | FSOPT_ATTR_CMN_EXTENDED;
    if unsafe { getattrlist(c.as_ptr(), (&mut list as *mut AttrList).cast(), buf.as_mut_ptr().cast(), buf.len(), opts) } != 0 {
        return None;
    }
    let read = |at: usize, n: usize| buf.get(at..at + n);
    // u32 length, i32 dev, u64 inode, i64 data length, u64 clone id.
    let dev = i32::from_ne_bytes(read(4, 4)?.try_into().ok()?) as u64;
    let ino = u64::from_ne_bytes(read(8, 8)?.try_into().ok()?);
    let len = i64::from_ne_bytes(read(16, 8)?.try_into().ok()?).max(0) as u64;
    let clone = u64::from_ne_bytes(read(24, 8)?.try_into().ok()?);
    Some((len, if clone != 0 { (dev, clone | 1 << 63) } else { (dev, ino) }))
}

#[cfg(not(target_os = "macos"))]
fn identity(path: &Path) -> Option<(u64, Storage)> {
    use std::os::unix::fs::MetadataExt;
    let md = std::fs::symlink_metadata(path).ok()?;
    Some((md.len(), (md.dev(), md.ino())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// `DA_BENCH_PATH=/some/folder cargo test --release bench_dupes -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_dupes() {
        let path = std::env::var("DA_BENCH_PATH").expect("set DA_BENCH_PATH");
        let s = Scanner::new(Path::new(&path), false).unwrap();
        s.run(16);
        let started = std::time::Instant::now();
        let groups = find(&s, 0, 300, &AtomicBool::new(false), &|_, _| {});
        println!(
            "groups={} reclaimable_mb={} ms={}",
            groups.len(),
            groups.iter().map(|g| g.reclaimable).sum::<u64>() / 1_000_000,
            started.elapsed().as_millis()
        );
    }

    #[test]
    fn finds_identical_files_and_ignores_links_and_clones() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        let data: Vec<u8> = (0..3_000_000u32).map(|i| (i % 251) as u8).collect();
        fs::create_dir(r.join("a")).unwrap();
        fs::write(r.join("one.bin"), &data).unwrap();
        fs::write(r.join("a/two.bin"), &data).unwrap();
        fs::write(r.join("a/three.bin"), &data).unwrap();
        // Same size, different last byte: not a duplicate.
        let mut other = data.clone();
        *other.last_mut().unwrap() ^= 1;
        fs::write(r.join("near.bin"), &other).unwrap();
        fs::write(r.join("near-copy.bin"), &other).unwrap();
        // Hard link of a duplicate: shares storage, adds nothing.
        fs::hard_link(r.join("one.bin"), r.join("link.bin")).unwrap();
        // A clone (cp -c) of near.bin shares storage too, so near.bin and
        // near-copy.bin remain the only stored copies of that content.
        let cloned = std::process::Command::new("cp").args(["-c"]).arg(r.join("near.bin")).arg(r.join("near-clone.bin")).status();

        let s = Scanner::new(r, false).unwrap();
        s.run(2);
        let groups = find(&s, 0, 10, &AtomicBool::new(false), &|_, _| {});
        assert_eq!(groups.len(), 2, "{:?}", groups.iter().map(|g| g.items.iter().map(|i| &i.name).collect::<Vec<_>>()).collect::<Vec<_>>());
        let triple = groups.iter().find(|g| g.items.iter().any(|i| i.name == "two.bin")).unwrap();
        assert_eq!(triple.copies, 3);
        assert_eq!(triple.reclaimable, 2 * triple.size);
        let pair = groups.iter().find(|g| g.items.iter().any(|i| i.name == "near.bin")).unwrap();
        let storage = |f: &str| identity(&r.join(f)).unwrap();
        // Lengths come from the same call; check they're right.
        assert_eq!(storage("one.bin").0, data.len() as u64);
        assert_eq!(storage("one.bin").1, storage("link.bin").1, "hard links share storage");
        assert_ne!(storage("one.bin").1, storage("a/two.bin").1);
        if cloned.is_ok_and(|s| s.success()) {
            assert_eq!(storage("near.bin").1, storage("near-clone.bin").1, "clones share storage");
            assert_eq!(pair.copies, 2, "the clone must not count as a third copy");
        }
    }
}
