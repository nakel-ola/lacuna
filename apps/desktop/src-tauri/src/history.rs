//! Scan history: a small snapshot of folder sizes saved after each complete
//! scan, so the next scan can show what grew or shrank.
//!
//! Snapshots stay on this Mac, in the app's data folder. Each is a text file:
//! a JSON header line, then `size<TAB>kind<TAB>relative/path` per entry.
//! Only folders of `DIR_MIN` and files of `FILE_MIN` or more are kept, which
//! keeps a whole-disk snapshot to a few megabytes.

use crate::scanner::{Kind, Tree, NO_PARENT, ROOT};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};

pub const DIR_MIN: u64 = 8_000_000;
pub const FILE_MIN: u64 = 64_000_000;
/// Changes smaller than this aren't reported as hotspots.
const HOT_MIN: u64 = 50_000_000;
/// Snapshots kept per scanned folder.
const KEEP: usize = 12;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    /// File name; also the id the UI passes back.
    #[serde(skip_deserializing)]
    pub id: String,
    pub root: String,
    pub label: String,
    /// Unix seconds.
    pub taken: u64,
    pub bytes: u64,
    pub files: u64,
}

pub struct Snapshot {
    pub info: Info,
    /// Relative path ("" for the root) → allocated bytes.
    sizes: HashMap<String, u64>,
    kinds: HashMap<String, bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    /// Present when the item still exists in the current scan.
    pub id: Option<u32>,
    pub name: String,
    /// Containing folder, relative to the compared folder.
    pub location: String,
    pub kind: &'static str,
    pub before: u64,
    pub after: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    pub baseline: Info,
    pub before: u64,
    pub after: u64,
    /// The most specific folders and files that changed, biggest change first.
    pub hotspots: Vec<Change>,
}

/// Stable across runs and Rust versions (unlike `DefaultHasher`).
fn key(root: &Path) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in root.as_os_str().as_encoded_bytes() {
        h = (h ^ *b as u64).wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn rel_path(tree: &Tree, id: u32) -> String {
    let mut parts = Vec::new();
    let mut cur = id;
    while cur != ROOT && cur != NO_PARENT {
        let n = &tree.nodes[cur as usize];
        parts.push(&*n.name);
        cur = n.parent;
    }
    parts.reverse();
    parts.join("/")
}

/// Kept entries below `id`, with paths relative to the scan root.
fn entries(tree: &Tree, id: u32, mut f: impl FnMut(u32, &str, bool)) {
    let mut stack = vec![(id, rel_path(tree, id))];
    while let Some((n, path)) = stack.pop() {
        let node = &tree.nodes[n as usize];
        f(n, &path, true);
        for &c in &node.children {
            let child = &tree.nodes[c as usize];
            let child_path = if path.is_empty() { child.name.to_string() } else { format!("{path}/{}", child.name) };
            match child.kind {
                Kind::Dir if child.size >= DIR_MIN => stack.push((c, child_path)),
                Kind::File if child.size >= FILE_MIN => f(c, &child_path, false),
                _ => {}
            }
        }
    }
}

/// Saves a snapshot of a finished scan and prunes old ones for the same folder.
pub fn save(dir: &Path, tree: &Tree, label: &str, taken: u64) -> std::io::Result<Info> {
    fs::create_dir_all(dir)?;
    let root = tree.root_path.to_string_lossy().into_owned();
    let id = format!("{}-{taken}.tsv", key(&tree.root_path));
    let mut info = Info { id: id.clone(), root, label: label.to_string(), taken, bytes: tree.nodes[0].size, files: tree.stats.files };
    let tmp = dir.join(format!("{id}.tmp"));
    {
        let mut w = BufWriter::new(fs::File::create(&tmp)?);
        serde_json::to_writer(&mut w, &info)?;
        w.write_all(b"\n")?;
        let mut result = Ok(());
        entries(tree, ROOT, |n, path, is_dir| {
            if result.is_ok() && !path.contains(['\n', '\t']) {
                result = writeln!(w, "{}\t{}\t{path}", tree.nodes[n as usize].size, if is_dir { 'd' } else { 'f' });
            }
        });
        result?;
        w.flush()?;
    }
    fs::rename(&tmp, dir.join(&id))?;
    for old in list(dir, &tree.root_path).into_iter().skip(KEEP) {
        let _ = fs::remove_file(dir.join(old.id));
    }
    info.id = id;
    Ok(info)
}

/// Snapshots of `root`, newest first.
pub fn list(dir: &Path, root: &Path) -> Vec<Info> {
    let prefix = format!("{}-", key(root));
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<Info> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            if !name.starts_with(&prefix) || !name.ends_with(".tsv") {
                return None;
            }
            let mut line = String::new();
            BufReader::new(fs::File::open(e.path()).ok()?).read_line(&mut line).ok()?;
            let mut info: Info = serde_json::from_str(&line).ok()?;
            info.id = name;
            (Path::new(&info.root) == root).then_some(info)
        })
        .collect();
    out.sort_by(|a, b| b.taken.cmp(&a.taken));
    out
}

pub fn load(dir: &Path, id: &str) -> std::io::Result<Snapshot> {
    // Ids come from the UI: only plain file names from `list`.
    if id.contains(['/', '\\']) || !id.ends_with(".tsv") {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad snapshot id"));
    }
    let mut lines = BufReader::new(fs::File::open(dir.join(id))?).lines();
    let header = lines.next().ok_or(std::io::ErrorKind::InvalidData)??;
    let mut info: Info = serde_json::from_str(&header)?;
    info.id = id.to_string();
    let mut sizes = HashMap::new();
    let mut kinds = HashMap::new();
    for line in lines {
        let line = line?;
        let mut parts = line.splitn(3, '\t');
        let (Some(size), Some(kind), Some(path)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let Ok(size) = size.parse() else { continue };
        sizes.insert(path.to_string(), size);
        kinds.insert(path.to_string(), kind == "d");
    }
    Ok(Snapshot { info, sizes, kinds })
}

pub fn delete_all(dir: &Path, root: &Path) {
    for info in list(dir, root) {
        let _ = fs::remove_file(dir.join(info.id));
    }
}

impl Snapshot {
    /// Size change of one item, when the snapshot can say. Items too small to
    /// have been recorded either time return `None`.
    pub fn delta(&self, tree: &Tree, id: u32) -> Option<i64> {
        let node = &tree.nodes[id as usize];
        let min = if node.kind == Kind::Dir { DIR_MIN } else { FILE_MIN };
        let before = match self.sizes.get(&rel_path(tree, id)) {
            Some(&b) => b,
            None if node.size >= min => 0,
            None => return None,
        };
        Some(node.size as i64 - before as i64)
    }

    /// Where the space went below `id` since this snapshot.
    pub fn changes(&self, tree: &Tree, id: u32, limit: usize) -> Changes {
        let base = rel_path(tree, id);
        let under = |p: &str| base.is_empty() || p == base || p.strip_prefix(&base).is_some_and(|r| r.starts_with('/'));

        struct Entry {
            id: Option<u32>,
            is_dir: bool,
            before: u64,
            after: u64,
        }
        let mut all: HashMap<String, Entry> = HashMap::new();
        entries(tree, id, |n, path, is_dir| {
            let before = self.sizes.get(path).copied().unwrap_or(0);
            all.insert(path.to_string(), Entry { id: Some(n), is_dir, before, after: tree.nodes[n as usize].size });
        });
        for (path, &before) in &self.sizes {
            if !under(path) || all.contains_key(path) {
                continue;
            }
            // Recorded then, below the threshold or gone now.
            let now = resolve(tree, path);
            all.insert(
                path.clone(),
                Entry {
                    id: now,
                    is_dir: self.kinds.get(path).copied().unwrap_or(true),
                    before,
                    after: now.map_or(0, |n| tree.nodes[n as usize].size),
                },
            );
        }

        // A change is a hotspot unless one child explains most of it.
        let delta = |e: &Entry| e.after as i64 - e.before as i64;
        let mut biggest_child: HashMap<&str, (i64, i64)> = HashMap::new();
        for (path, e) in &all {
            if path == &base {
                continue;
            }
            let parent = path.rsplit_once('/').map_or("", |(p, _)| p);
            let d = delta(e);
            let slot = biggest_child.entry(parent).or_default();
            slot.0 = slot.0.max(d);
            slot.1 = slot.1.min(d);
        }
        let mut hotspots: Vec<(&String, &Entry)> = all
            .iter()
            .filter(|(path, e)| {
                let d = delta(e);
                if d.unsigned_abs() < HOT_MIN {
                    return false;
                }
                let (grow, shrink) = biggest_child.get(path.as_str()).copied().unwrap_or_default();
                if d > 0 { grow * 2 < d } else { shrink * 2 > d }
            })
            .collect();
        hotspots.sort_by_key(|(_, e)| std::cmp::Reverse(delta(e).unsigned_abs()));
        hotspots.truncate(limit);

        let base_len = if base.is_empty() { 0 } else { base.len() + 1 };
        let root = all.get(&base);
        Changes {
            baseline: self.info.clone(),
            before: root.map_or(0, |e| e.before),
            after: tree.nodes[id as usize].size,
            hotspots: hotspots
                .into_iter()
                .map(|(path, e)| {
                    let rel = path.get(base_len..).unwrap_or(path);
                    let (location, name) = rel.rsplit_once('/').unwrap_or((".", rel));
                    Change {
                        id: e.id,
                        name: if name.is_empty() { tree.nodes[id as usize].name.to_string() } else { name.to_string() },
                        location: location.to_string(),
                        kind: if e.is_dir { "dir" } else { "file" },
                        before: e.before,
                        after: e.after,
                    }
                })
                .collect(),
        }
    }
}

fn resolve(tree: &Tree, rel: &str) -> Option<u32> {
    let mut cur = ROOT;
    for name in rel.split('/').filter(|s| !s.is_empty()) {
        cur = *tree.nodes[cur as usize].children.iter().find(|&&c| &*tree.nodes[c as usize].name == name)?;
    }
    Some(cur)
}

/// Folder the snapshots live in.
pub fn dir(app_data: PathBuf) -> PathBuf {
    app_data.join("history")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Scanner;

    fn scan(p: &Path) -> Scanner {
        let s = Scanner::new(p, false).unwrap();
        s.run(2);
        s
    }

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; bytes]).unwrap();
    }

    #[test]
    fn saves_lists_and_reports_the_most_specific_change() {
        let data = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        write(&r.join("a/steady/x.bin"), 20_000_000);
        write(&r.join("a/grows/y.bin"), 10_000_000);
        write(&r.join("gone/z.bin"), 60_000_000);

        let first = scan(r);
        let info = save(data.path(), &first.tree(), "Test", 100).unwrap();
        assert_eq!(list(data.path(), &first.tree().root_path)[0].id, info.id);

        // a/grows gains 80 MB in a new subfolder; gone/ disappears.
        write(&r.join("a/grows/deep/new.bin"), 80_000_000);
        fs::remove_dir_all(r.join("gone")).unwrap();
        let second = scan(r);
        let t = second.tree();
        let snap = load(data.path(), &info.id).unwrap();
        let changes = snap.changes(&t, ROOT, 10);

        let names: Vec<(&str, i64)> = changes.hotspots.iter().map(|c| (c.name.as_str(), c.after as i64 - c.before as i64)).collect();
        // The new 80 MB file explains all of a/grows/deep growth, so it is reported, not its folders.
        assert_eq!(names.len(), 2, "{names:?}");
        assert!(names.iter().any(|&(n, d)| n == "new.bin" && d > 75_000_000));
        assert!(names.iter().any(|&(n, d)| n == "gone" && d < -55_000_000));
        let gone = changes.hotspots.iter().find(|c| c.name == "gone").unwrap();
        assert_eq!(gone.id, None);

        let a = resolve(&t, "a").unwrap();
        assert!(snap.delta(&t, a).unwrap() > 75_000_000);
    }

    #[test]
    fn prunes_old_snapshots_and_rejects_odd_ids() {
        let data = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        write(&dir.path().join("f.bin"), 1000);
        let s = scan(dir.path());
        for t in 0..(KEEP as u64 + 3) {
            save(data.path(), &s.tree(), "T", t).unwrap();
        }
        let kept = list(data.path(), &s.tree().root_path);
        assert_eq!(kept.len(), KEEP);
        assert_eq!(kept[0].taken, KEEP as u64 + 2);
        assert!(load(data.path(), "../etc/passwd").is_err());
        delete_all(data.path(), &s.tree().root_path);
        assert!(list(data.path(), &s.tree().root_path).is_empty());
    }
}
