//! Whole-subtree queries for the Large files, File types and Search views.

use crate::scanner::{Kind, Tree, NO_PARENT};
use serde::Serialize;
use std::cmp::Reverse;
use std::collections::BinaryHeap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub id: u32,
    pub name: String,
    /// Path of the containing folder, relative to the queried folder.
    pub location: String,
    pub kind: &'static str,
    pub size: u64,
    pub count: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TypeTotal {
    pub category: &'static str,
    pub size: u64,
    pub count: u64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
enum Category {
    Other,
    Video,
    Photos,
    Audio,
    Documents,
    Archives,
    Developer,
    Apps,
}

const CATEGORIES: [(Category, &str); 8] = [
    (Category::Apps, "Apps"),
    (Category::Developer, "Developer"),
    (Category::Video, "Video"),
    (Category::Photos, "Photos"),
    (Category::Audio, "Audio"),
    (Category::Documents, "Documents"),
    (Category::Archives, "Archives & disk images"),
    (Category::Other, "Other"),
];

/// Everything inside these folders counts as that category, whatever the
/// file extension (an image inside node_modules is still developer stuff).
fn folder_category(name: &str) -> Option<Category> {
    if name.ends_with(".app") || name.ends_with(".appex") || name.ends_with(".framework") {
        return Some(Category::Apps);
    }
    match name {
        "node_modules" | ".git" | "target" | "DerivedData" | ".gradle" | ".cargo" | ".rustup" | ".npm"
        | ".pnpm-store" | ".bun" | "__pycache__" | ".venv" | "venv" | "Pods" | ".next" | ".turbo"
        | ".cache" | "CoreSimulator" => Some(Category::Developer),
        _ => None,
    }
}

fn file_category(name: &str) -> Category {
    let Some((_, ext)) = name.rsplit_once('.') else { return Category::Other };
    match ext.to_ascii_lowercase().as_str() {
        "mp4" | "mov" | "m4v" | "mkv" | "avi" | "webm" | "wmv" | "flv" | "mts" | "braw" | "r3d" => Category::Video,
        "jpg" | "jpeg" | "png" | "gif" | "heic" | "heif" | "webp" | "tif" | "tiff" | "raw" | "cr2" | "cr3" | "nef"
        | "arw" | "dng" | "psd" | "svg" | "bmp" => Category::Photos,
        "mp3" | "wav" | "aac" | "flac" | "m4a" | "aiff" | "aif" | "ogg" | "opus" | "logicx" => Category::Audio,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "key" | "pages" | "numbers" | "txt" | "md"
        | "rtf" | "csv" | "epub" | "odt" | "fig" | "sketch" => Category::Documents,
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "zst" | "dmg" | "iso" | "pkg" | "img"
        | "ipa" | "apk" | "xip" => Category::Archives,
        "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" | "rs" | "py" | "go" | "java" | "kt" | "c" | "cc" | "cpp"
        | "h" | "hpp" | "swift" | "m" | "rb" | "php" | "json" | "lock" | "map" | "wasm" | "o" | "a" | "rlib"
        | "rmeta" | "d" | "dylib" | "so" | "class" | "jar" | "pyc" | "sqlite" | "db" => Category::Developer,
        _ => Category::Other,
    }
}

/// Size per file category below `id`.
pub fn type_breakdown(tree: &Tree, id: u32) -> Vec<TypeTotal> {
    let mut sizes = [0u64; 8];
    let mut counts = [0u64; 8];
    let start = folder_category(&tree.nodes[id as usize].name);
    let mut stack = vec![(id, start)];
    while let Some((n, inherited)) = stack.pop() {
        let node = &tree.nodes[n as usize];
        for &c in &node.children {
            let child = &tree.nodes[c as usize];
            match child.kind {
                Kind::Dir => stack.push((c, inherited.or_else(|| folder_category(&child.name)))),
                Kind::Mount => {}
                Kind::File | Kind::Symlink => {
                    let cat = inherited.unwrap_or_else(|| file_category(&child.name)) as usize;
                    sizes[cat] += child.size;
                    counts[cat] += 1;
                }
            }
        }
    }
    let mut out: Vec<TypeTotal> = CATEGORIES
        .iter()
        .map(|&(cat, label)| TypeTotal { category: label, size: sizes[cat as usize], count: counts[cat as usize] })
        .filter(|t| t.count > 0)
        .collect();
    out.sort_by(|a, b| b.size.cmp(&a.size));
    out
}

/// The `limit` largest files below `id`.
pub fn largest_files(tree: &Tree, id: u32, limit: usize) -> Vec<Hit> {
    top_by_size(tree, id, limit, |node| matches!(node.kind, Kind::File | Kind::Symlink))
}

/// Files and folders below `id` whose name contains `query` (case-insensitive), largest first.
pub fn search(tree: &Tree, id: u32, query: &str, limit: usize) -> Vec<Hit> {
    let needle = query.to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let ascii = needle.is_ascii();
    top_by_size(tree, id, limit, |node| {
        if ascii {
            node.name.as_bytes().windows(needle.len()).any(|w| w.eq_ignore_ascii_case(needle.as_bytes()))
        } else {
            node.name.to_lowercase().contains(&needle)
        }
    })
}

fn top_by_size(tree: &Tree, id: u32, limit: usize, keep: impl Fn(&crate::scanner::Node) -> bool) -> Vec<Hit> {
    let mut heap: BinaryHeap<Reverse<(u64, u32)>> = BinaryHeap::with_capacity(limit + 1);
    let mut stack = vec![id];
    while let Some(n) = stack.pop() {
        for &c in &tree.nodes[n as usize].children {
            let child = &tree.nodes[c as usize];
            if child.kind == Kind::Dir {
                stack.push(c);
            }
            if keep(child) {
                heap.push(Reverse((child.size, c)));
                if heap.len() > limit {
                    heap.pop();
                }
            }
        }
    }
    let base = tree.path_of(id);
    let mut hits: Vec<Hit> = heap
        .into_iter()
        .map(|Reverse((_, c))| {
            let node = &tree.nodes[c as usize];
            let parent = if node.parent == NO_PARENT { id } else { node.parent };
            let location = tree.path_of(parent);
            let rel = location.strip_prefix(&base).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
            Hit {
                id: c,
                name: node.name.to_string(),
                location: if rel.is_empty() { ".".into() } else { rel },
                kind: if node.kind == Kind::Dir { "dir" } else { "file" },
                size: node.size,
                count: node.files,
            }
        })
        .collect();
    hits.sort_by(|a, b| b.size.cmp(&a.size));
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categories() {
        assert!(matches!(file_category("clip.MOV"), Category::Video));
        assert!(matches!(file_category("Makefile"), Category::Other));
        assert!(matches!(folder_category("Xcode.app"), Some(Category::Apps)));
        assert!(matches!(folder_category("node_modules"), Some(Category::Developer)));
    }
}
