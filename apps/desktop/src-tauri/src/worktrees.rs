//! Git worktrees: every linked checkout of the repositories in a scan.
//!
//! Coding agents create a worktree per task and don't always remove it, so a
//! repository can quietly collect many full copies of itself. Repositories are
//! found from their `.git` folders, and worktrees from the `.git` files in
//! their checkouts. Git's own records (`.git/worktrees/<name>/`) list every
//! worktree of a repository, including ones outside the scan, and those
//! records are read from disk. Nothing is changed here.
//!
//! Agents sometimes delete git's record of a worktree but leave its folder
//! behind, often full of build output. Those checkouts (a `.git` file with no
//! record, or a folder in `.claude/worktrees` with no `.git` at all) are
//! listed too, as untracked.

use crate::insights::{self, Hit};
use crate::rules::{logical, resolve};
use crate::scanner::{Kind, Tree, ROOT};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Active,
    /// Locked with `git worktree lock`: git won't prune or remove it.
    Locked,
    /// The checkout is gone but git still lists it (`git worktree prune` clears it).
    Missing,
    /// A checkout whose repository no longer exists.
    Orphaned,
    /// A leftover checkout folder git no longer has a record of.
    Untracked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub name: String,
    pub path: String,
    /// Branch name, or "detached at <commit>".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// The tool that usually keeps worktrees at this path.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<&'static str>,
    pub state: State,
    /// The checkout in the scan; None when it's outside the scan or gone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Hit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub name: String,
    /// The main checkout.
    pub path: String,
    pub exists: bool,
    /// Space used by its worktrees that are in the scan.
    pub size: u64,
    pub worktrees: Vec<Worktree>,
}

/// Repositories with worktrees below `id`, biggest first.
pub fn find(tree: &Tree, id: u32) -> Vec<Repo> {
    let root = logical(&tree.root_path);
    let mut git_dirs = BTreeSet::new();
    let mut orphans: BTreeMap<PathBuf, Vec<PathBuf>> = BTreeMap::new();
    // Checkout folders seen in the scan, by repository; matched against git's records later.
    let mut seen: BTreeMap<PathBuf, BTreeSet<PathBuf>> = BTreeMap::new();

    let mut stack = vec![id];
    while let Some(n) = stack.pop() {
        for &c in &tree.nodes[n as usize].children {
            let child = &tree.nodes[c as usize];
            if child.removed {
                continue;
            }
            if &*child.name == ".git" {
                let path = logical(&tree.path_of(c));
                match child.kind {
                    Kind::Dir => {
                        git_dirs.insert(path);
                    }
                    Kind::File => {
                        let checkout = path.parent().unwrap_or(&path).to_path_buf();
                        if let Some(common) = read_gitdir(&path).and_then(|meta| common_dir(&meta)) {
                            if common.is_dir() {
                                git_dirs.insert(common.clone());
                                seen.entry(common).or_default().insert(checkout);
                            } else {
                                orphans.entry(common).or_default().push(checkout);
                            }
                        }
                    }
                    _ => {}
                }
                continue;
            }
            if child.kind == Kind::Dir && !matches!(&*child.name, "node_modules" | ".Trash") {
                // Claude Code keeps worktrees in <repo>/.claude/worktrees; a folder
                // there without a .git file is what's left after a partial cleanup.
                if &*child.name == "worktrees" && &*tree.nodes[n as usize].name == ".claude" {
                    let base = logical(&tree.path_of(c));
                    if let Some(common) = base.parent().and_then(Path::parent).map(|repo| repo.join(".git")).filter(|g| g.is_dir()) {
                        for &w in &child.children {
                            let folder = &tree.nodes[w as usize];
                            let has_git = folder.children.iter().any(|&g| &*tree.nodes[g as usize].name == ".git");
                            if folder.kind == Kind::Dir && !folder.removed && !has_git {
                                git_dirs.insert(common.clone());
                                seen.entry(common.clone()).or_default().insert(base.join(&*folder.name));
                            }
                        }
                    }
                }
                stack.push(c);
            }
        }
    }

    let hit = |path: &Path| {
        let n = resolve(tree, &root, path)?;
        insights::hits(tree, ROOT, vec![n]).pop()
    };
    let mut repos = Vec::new();

    for git_dir in git_dirs {
        let mut worktrees = Vec::new();
        for entry in fs::read_dir(git_dir.join("worktrees")).into_iter().flatten().flatten() {
            let meta = entry.path();
            let Some(dot_git) = read_gitdir(&meta.join("gitdir")) else { continue };
            let checkout = dot_git.parent().map(Path::to_path_buf).unwrap_or(dot_git.clone());
            let state = if !checkout.exists() {
                State::Missing
            } else if meta.join("locked").exists() {
                State::Locked
            } else {
                State::Active
            };
            worktrees.push(Worktree {
                name: file_name(&checkout),
                path: checkout.to_string_lossy().into_owned(),
                branch: branch(&meta),
                agent: agent(&checkout),
                state,
                item: if state == State::Missing { None } else { hit(&checkout) },
            });
        }
        for checkout in seen.remove(&git_dir).unwrap_or_default() {
            if worktrees.iter().any(|w| Path::new(&w.path) == checkout) {
                continue;
            }
            // Empty leftovers aren't worth a row.
            let Some(item) = hit(&checkout).filter(|i| i.size > 0) else { continue };
            worktrees.push(Worktree {
                name: file_name(&checkout),
                path: checkout.to_string_lossy().into_owned(),
                branch: None,
                agent: agent(&checkout),
                state: State::Untracked,
                item: Some(item),
            });
        }
        if !worktrees.is_empty() {
            let main = if git_dir.file_name().is_some_and(|n| n == ".git") { git_dir.parent().unwrap_or(&git_dir) } else { &git_dir };
            repos.push(repo(main, true, worktrees));
        }
    }

    for (common, checkouts) in orphans {
        let main = if common.file_name().is_some_and(|n| n == ".git") { common.parent().unwrap_or(&common) } else { &common };
        let worktrees = checkouts
            .into_iter()
            .map(|checkout| Worktree {
                name: file_name(&checkout),
                path: checkout.to_string_lossy().into_owned(),
                branch: None,
                agent: agent(&checkout),
                state: State::Orphaned,
                item: hit(&checkout),
            })
            .collect();
        repos.push(repo(main, false, worktrees));
    }

    repos.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    repos
}

fn repo(main: &Path, exists: bool, mut worktrees: Vec<Worktree>) -> Repo {
    let size = |w: &Worktree| w.item.as_ref().map_or(0, |i| i.size);
    worktrees.sort_by(|a, b| (a.state == State::Missing).cmp(&(b.state == State::Missing)).then(size(b).cmp(&size(a))).then_with(|| a.name.cmp(&b.name)));
    Repo {
        name: file_name(main),
        path: main.to_string_lossy().into_owned(),
        exists,
        size: worktrees.iter().map(size).sum(),
        worktrees,
    }
}

/// The path in a `gitdir: <path>` file (a worktree's `.git`, or the
/// `gitdir` record in `.git/worktrees/<name>/`). Relative paths are relative
/// to the file's folder.
fn read_gitdir(file: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(file).ok()?;
    let line = text.lines().next()?.trim();
    let target = Path::new(line.strip_prefix("gitdir:").unwrap_or(line).trim());
    if target.as_os_str().is_empty() {
        return None;
    }
    let base = file.parent()?;
    Some(normalize(&base.join(target)))
}

/// `<repo>/.git` from a worktree's `<repo>/.git/worktrees/<name>`. Anything
/// else (a submodule's `.git/modules/<name>`) isn't a worktree.
fn common_dir(meta: &Path) -> Option<PathBuf> {
    let parent = meta.parent()?;
    (parent.file_name()? == "worktrees").then(|| parent.parent().map(Path::to_path_buf))?
}

/// Resolves `.` and `..` without touching the disk, since the target may not exist.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

fn branch(meta: &Path) -> Option<String> {
    let head = fs::read_to_string(meta.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref:") {
        Some(r) => Some(r.trim().strip_prefix("refs/heads/").unwrap_or(r.trim()).to_string()),
        None if head.len() >= 7 => Some(format!("detached at {}", &head[..7])),
        None => None,
    }
}

/// Where coding tools keep the worktrees they create.
fn agent(checkout: &Path) -> Option<&'static str> {
    const KNOWN: &[(&str, &str)] = &[
        ("/.claude/worktrees/", "Claude Code"),
        ("/.codex/worktrees/", "Codex"),
        ("/.cursor/worktrees/", "Cursor"),
        ("/conductor/workspaces/", "Conductor"),
        ("/.t3/worktrees/", "T3 Code"),
    ];
    let path = checkout.to_string_lossy();
    KNOWN.iter().find(|(part, _)| path.contains(part)).map(|&(_, name)| name)
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(|| path.to_string_lossy().into_owned(), |n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Scanner;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    /// Lays out a worktree the way `git worktree add` does.
    fn add_worktree(repo: &Path, name: &str, checkout: &Path, branch: &str) {
        let meta = repo.join(".git/worktrees").join(name);
        write(&meta.join("gitdir"), &format!("{}\n", checkout.join(".git").display()));
        write(&meta.join("HEAD"), &format!("ref: refs/heads/{branch}\n"));
        write(&checkout.join(".git"), &format!("gitdir: {}\n", meta.display()));
        write(&checkout.join("src/main.rs"), &"x".repeat(50_000));
    }

    #[test]
    fn lists_worktrees_by_repository() {
        let dir = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(dir.path()).unwrap();
        let repo = home.join("code/app");
        write(&repo.join(".git/HEAD"), "ref: refs/heads/main\n");
        write(&repo.join("README.md"), "hi");
        add_worktree(&repo, "fix-login", &repo.join(".claude/worktrees/fix-login"), "fix-login");
        add_worktree(&repo, "docs", &home.join("elsewhere/docs"), "docs");
        write(&repo.join(".git/worktrees/docs/locked"), "");
        // Deleted by hand: git still lists it.
        write(&repo.join(".git/worktrees/gone/gitdir"), &format!("{}\n", home.join("gone/.git").display()));
        // A submodule's .git file isn't a worktree.
        write(&repo.join("vendor/lib/.git"), &format!("gitdir: {}\n", repo.join(".git/modules/lib").display()));
        // A worktree whose repository was deleted.
        write(&home.join("old/task/.git"), &format!("gitdir: {}\n", home.join("deleted/.git/worktrees/task").display()));
        // An agent removed git's record but left the folder (with build output).
        write(&repo.join(".claude/worktrees/agent-1/.git"), &format!("gitdir: {}\n", repo.join(".git/worktrees/agent-1").display()));
        write(&repo.join(".claude/worktrees/agent-1/target/big.bin"), &"x".repeat(80_000));
        // Or removed the .git file too.
        write(&repo.join(".claude/worktrees/agent-2/node_modules/a.js"), &"x".repeat(60_000));
        // Empty leftovers are skipped.
        fs::create_dir_all(repo.join(".claude/worktrees/empty")).unwrap();
        // Plain repositories without worktrees are left out.
        write(&home.join("code/plain/.git/HEAD"), "ref: refs/heads/main\n");

        let s = Scanner::new(&home, false).unwrap();
        s.run(2);
        let t = s.tree();
        let repos = find(&t, ROOT);

        assert_eq!(repos.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["app", "deleted"]);
        let app = &repos[0];
        let rows = app.worktrees.iter().map(|w| (w.name.as_str(), w.state, w.branch.as_deref(), w.agent)).collect::<Vec<_>>();
        assert_eq!(rows.len(), 5);
        assert!(rows.contains(&("agent-1", State::Untracked, None, Some("Claude Code"))));
        assert!(rows.contains(&("agent-2", State::Untracked, None, Some("Claude Code"))));
        assert!(rows.contains(&("fix-login", State::Active, Some("fix-login"), Some("Claude Code"))));
        assert!(rows.contains(&("docs", State::Locked, Some("docs"), None)));
        // Missing ones sort last and have no item to collect.
        assert_eq!(rows[4], ("gone", State::Missing, None, None));
        assert!(app.worktrees[4].item.is_none());
        assert!(app.worktrees[..4].iter().all(|w| w.item.as_ref().is_some_and(|i| i.size > 0)));
        assert_eq!(app.size, app.worktrees.iter().filter_map(|w| w.item.as_ref()).map(|i| i.size).sum::<u64>());

        let deleted = &repos[1];
        assert!(!deleted.exists);
        assert_eq!(deleted.worktrees[0].state, State::Orphaned);
        assert_eq!(deleted.worktrees[0].item.as_ref().unwrap().name, "task");
    }

    #[test]
    fn relative_gitdir_paths() {
        let dir = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(dir.path()).unwrap();
        let repo = home.join("app");
        write(&repo.join(".git/HEAD"), "ref: refs/heads/main\n");
        write(&repo.join(".git/worktrees/wt/gitdir"), "../../../../wt/.git\n");
        write(&repo.join(".git/worktrees/wt/HEAD"), "0123456789abcdef0123456789abcdef01234567\n");
        write(&home.join("wt/.git"), "gitdir: ../app/.git/worktrees/wt\n");
        write(&home.join("wt/file"), "x");

        let s = Scanner::new(&home, false).unwrap();
        s.run(2);
        let repos = find(&s.tree(), ROOT);
        assert_eq!(repos.len(), 1);
        let wt = &repos[0].worktrees[0];
        assert_eq!(Path::new(&wt.path), home.join("wt"));
        assert_eq!(wt.state, State::Active);
        assert_eq!(wt.branch.as_deref(), Some("detached at 0123456"));
    }

    /// `DA_BENCH_PATH=$HOME cargo test --release bench_worktrees -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_worktrees() {
        let path = std::env::var("DA_BENCH_PATH").expect("set DA_BENCH_PATH");
        let s = Scanner::new(Path::new(&path), false).unwrap();
        s.run(16);
        let t = s.tree();
        let started = std::time::Instant::now();
        for r in find(&t, ROOT) {
            println!("{:>12} {} ({} worktrees)", r.size, r.path, r.worktrees.len());
            for w in &r.worktrees {
                println!("{:>14} {:?} {:?} {:?} {}", w.item.as_ref().map_or(0, |i| i.size), w.state, w.branch, w.agent, w.path);
            }
        }
        println!("ms={}", started.elapsed().as_millis());
    }
}
