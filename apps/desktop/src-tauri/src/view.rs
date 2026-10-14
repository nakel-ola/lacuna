//! Depth-limited slices of the tree for the UI.

use crate::history::Snapshot;
use crate::scanner::{Kind, Tree, OTHER_VOLUME};
use serde::Serialize;

/// Children under this fraction of the view root are folded into one
/// "smaller objects" segment.
pub const MIN_FRACTION: f64 = 0.002;
pub const MAX_DEPTH: u32 = 6;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewNode {
    /// None for the "smaller objects" aggregate.
    pub id: Option<u32>,
    pub name: String,
    pub kind: &'static str,
    pub size: u64,
    pub count: u64,
    /// Newest change or access below this item (Unix seconds, 0 if unknown).
    pub time: u32,
    /// Size change since the compared scan, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ViewNode>>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub has_children: bool,
}

pub fn view(tree: &Tree, id: u32, depth: u32, baseline: Option<&Snapshot>) -> ViewNode {
    let min = (tree.nodes[id as usize].size as f64 * MIN_FRACTION) as u64;
    build(tree, id, depth, min, baseline)
}

fn build(tree: &Tree, id: u32, depth: u32, min: u64, baseline: Option<&Snapshot>) -> ViewNode {
    let n = &tree.nodes[id as usize];
    let mut out = ViewNode {
        id: Some(id),
        name: n.name.to_string(),
        kind: match n.kind {
            Kind::Dir => "dir",
            Kind::File | Kind::Symlink => "file",
            Kind::Mount => "mount",
        },
        size: n.size,
        count: n.files,
        time: n.time,
        delta: baseline.and_then(|b| b.delta(tree, id)),
        error: error_name(n.error),
        children: None,
        has_children: false,
    };
    if n.kind != Kind::Dir {
        return out;
    }
    if depth == 0 {
        out.has_children = !n.children.is_empty();
        return out;
    }
    let mut kids: Vec<u32> = n.children.clone();
    kids.sort_unstable_by(|&a, &b| tree.nodes[b as usize].size.cmp(&tree.nodes[a as usize].size));
    let mut children = Vec::new();
    let (mut rest_size, mut rest_count, mut rest_items) = (0u64, 0u64, 0usize);
    for c in kids {
        let child = &tree.nodes[c as usize];
        if child.size >= min && child.size > 0 {
            children.push(build(tree, c, depth - 1, min, baseline));
        } else {
            rest_size += child.size;
            rest_count += child.files;
            rest_items += 1;
        }
    }
    if rest_items > 0 && rest_size > 0 {
        children.push(ViewNode {
            id: None,
            name: format!("{rest_items} smaller object{}", if rest_items == 1 { "" } else { "s" }),
            kind: "other",
            size: rest_size,
            count: rest_count,
            time: 0,
            delta: None,
            error: None,
            children: None,
            has_children: false,
        });
    }
    out.children = Some(children);
    out
}

pub fn error_name(errno: i32) -> Option<String> {
    match errno {
        0 => None,
        OTHER_VOLUME => Some("OTHER_VOLUME".into()),
        libc::EACCES => Some("EACCES".into()),
        libc::EPERM => Some("EPERM".into()),
        e => Some(std::io::Error::from_raw_os_error(e).to_string()),
    }
}
