//! Suggestions: known data that can be regenerated or re-downloaded, with a
//! plain reason for each and an honest risk level.
//!
//! Nothing here deletes anything. The UI adds suggested items to Cleanup,
//! where the usual review-then-Trash flow applies.

use crate::insights::{self, Hit};
use crate::scanner::{Kind, Tree, ROOT};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Items smaller than this aren't worth a row.
const MIN_ITEM: u64 = 1_000_000;

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    /// Rebuilt or re-downloaded automatically when needed.
    Safe,
    /// Recoverable, but check first: it may hold something you want.
    Review,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub id: &'static str,
    pub label: &'static str,
    pub why: &'static str,
    pub risk: Risk,
    /// The tool's own cleanup command, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<&'static str>,
    pub size: u64,
    pub items: Vec<Hit>,
}

enum Match {
    /// One folder or file at a path. `~/` is the home folder.
    At(&'static [&'static str]),
    /// Each item inside a folder.
    Each(&'static [&'static str]),
    /// Items inside a folder whose name passes the test.
    EachWhere(&'static str, fn(&str) -> bool),
    /// Folders with this name anywhere in a project, next to a marker file
    /// (or containing it, for `Inside`).
    Project(&'static [&'static str], Marker),
}

enum Marker {
    Beside(&'static [&'static str]),
    Inside(&'static str),
    Any,
}

struct Rule {
    id: &'static str,
    label: &'static str,
    why: &'static str,
    risk: Risk,
    command: Option<&'static str>,
    matcher: Match,
}

use Match::*;
use Risk::*;

/// Specific rules come before general ones: an item claimed by an earlier
/// rule isn't offered again (Homebrew's cache isn't also an "app cache").
const RULES: &[Rule] = &[
    Rule {
        id: "xcode-derived-data",
        label: "Xcode build data",
        why: "Build products and indexes. Xcode rebuilds them the next time you build.",
        risk: Safe,
        command: None,
        matcher: At(&["~/Library/Developer/Xcode/DerivedData"]),
    },
    Rule {
        id: "xcode-device-support",
        label: "Xcode device support",
        why: "Debug symbols copied from devices you've connected. Xcode copies them again when needed.",
        risk: Safe,
        command: None,
        matcher: Each(&[
            "~/Library/Developer/Xcode/iOS DeviceSupport",
            "~/Library/Developer/Xcode/watchOS DeviceSupport",
            "~/Library/Developer/Xcode/tvOS DeviceSupport",
            "~/Library/Developer/Xcode/visionOS DeviceSupport",
        ]),
    },
    Rule {
        id: "simulator-caches",
        label: "Simulator caches",
        why: "Caches the iOS Simulator rebuilds on its own.",
        risk: Safe,
        command: None,
        matcher: At(&["~/Library/Developer/CoreSimulator/Caches"]),
    },
    Rule {
        id: "homebrew-cache",
        label: "Homebrew downloads",
        why: "Downloaded bottles and installers for things already installed.",
        risk: Safe,
        command: Some("brew cleanup --prune=all"),
        matcher: At(&["~/Library/Caches/Homebrew"]),
    },
    Rule {
        id: "package-caches",
        label: "Package manager caches",
        why: "Download caches for npm, Yarn, Bun, pip, CocoaPods, Cargo and Gradle. Packages are downloaded again when a project needs them.",
        risk: Safe,
        command: None,
        matcher: At(&[
            "~/.npm/_cacache",
            "~/Library/Caches/Yarn",
            "~/.bun/install/cache",
            "~/Library/Caches/pip",
            "~/.cache/pip",
            "~/Library/Caches/CocoaPods",
            "~/.cargo/registry",
            "~/.gradle/caches",
        ]),
    },
    Rule {
        id: "package-stores",
        label: "Shared package stores",
        why: "pnpm's store and Go's module cache are shared by your projects. They download again if removed, but it's cleaner to use the tool's own command.",
        risk: Review,
        command: Some("pnpm store prune  ·  go clean -modcache"),
        matcher: At(&["~/Library/pnpm/store", "~/.local/share/pnpm/store", "~/go/pkg/mod"]),
    },
    Rule {
        id: "ai-models",
        label: "Downloaded AI models",
        why: "Local model weights from Ollama, LM Studio and Hugging Face. They can be downloaded again, but they're large.",
        risk: Review,
        command: Some("ollama rm <model>"),
        matcher: Each(&["~/.ollama/models/blobs", "~/.lmstudio/models", "~/.cache/lm-studio/models", "~/.cache/huggingface/hub"]),
    },
    Rule {
        id: "docker-disk",
        label: "Docker disk image",
        why: "Holds every Docker image, container and volume. Removing it resets Docker. Pruning unused data is gentler.",
        risk: Review,
        command: Some("docker system prune -a"),
        matcher: At(&["~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"]),
    },
    Rule {
        id: "ios-backups",
        label: "iPhone and iPad backups",
        why: "Local device backups. Keep at least one recent backup, here or in iCloud.",
        risk: Review,
        command: None,
        matcher: Each(&["~/Library/Application Support/MobileSync/Backup"]),
    },
    Rule {
        id: "xcode-archives",
        label: "Xcode archives",
        why: "Builds you archived for distribution. Keep the ones you need to read crash reports from shipped versions.",
        risk: Review,
        command: None,
        matcher: Each(&["~/Library/Developer/Xcode/Archives"]),
    },
    Rule {
        id: "simulator-devices",
        label: "Simulator devices",
        why: "Apps and data inside each simulator. Deleting only unavailable ones is safest.",
        risk: Review,
        command: Some("xcrun simctl delete unavailable"),
        matcher: At(&["~/Library/Developer/CoreSimulator/Devices"]),
    },
    Rule {
        id: "macos-installers",
        label: "macOS installers",
        why: "Full macOS installers. You can download them again from the App Store.",
        risk: Safe,
        command: None,
        matcher: EachWhere("/Applications", |n| n.starts_with("Install macOS") && n.ends_with(".app")),
    },
    Rule {
        id: "downloaded-installers",
        label: "Installers in Downloads",
        why: "Disk images and packages you've probably installed already.",
        risk: Review,
        command: None,
        matcher: EachWhere("~/Downloads", |n| {
            let n = n.to_ascii_lowercase();
            [".dmg", ".pkg", ".iso", ".xip"].iter().any(|ext| n.ends_with(ext))
        }),
    },
    Rule {
        id: "mail-downloads",
        label: "Mail attachments opened",
        why: "Copies of attachments you opened in Mail. The originals stay in your messages.",
        risk: Safe,
        command: None,
        matcher: At(&["~/Library/Containers/com.apple.mail/Data/Library/Mail Downloads"]),
    },
    Rule {
        id: "logs",
        label: "Logs",
        why: "Diagnostic logs written by apps. Useful only when troubleshooting.",
        risk: Safe,
        command: None,
        matcher: At(&["~/Library/Logs"]),
    },
    Rule {
        id: "app-caches",
        label: "App caches",
        why: "Apps rebuild their caches as needed. Quit an app before removing its cache.",
        risk: Safe,
        command: None,
        matcher: Each(&["~/Library/Caches"]),
    },
    Rule {
        id: "rust-target",
        label: "Rust build folders",
        why: "Compiled output in each project's target folder. `cargo build` recreates it.",
        risk: Safe,
        command: Some("cargo clean"),
        matcher: Project(&["target"], Marker::Beside(&["Cargo.toml"])),
    },
    Rule {
        id: "js-build-caches",
        label: "JavaScript build caches",
        why: "Caches from Next.js, Turborepo, Nuxt, Parcel and SvelteKit. They're rebuilt on the next build.",
        risk: Safe,
        command: None,
        matcher: Project(&[".next", ".turbo", ".nuxt", ".parcel-cache", ".svelte-kit"], Marker::Beside(&["package.json"])),
    },
    Rule {
        id: "python-caches",
        label: "Python bytecode caches",
        why: "Compiled .pyc files that Python writes again on the next run.",
        risk: Safe,
        command: None,
        matcher: Project(&["__pycache__"], Marker::Any),
    },
    Rule {
        id: "node-modules",
        label: "node_modules folders",
        why: "Installed JavaScript packages. `npm install` (or pnpm, yarn, bun) puts them back. Projects you haven't touched in a while are the best candidates.",
        risk: Review,
        command: None,
        matcher: Project(&["node_modules"], Marker::Beside(&["package.json"])),
    },
    Rule {
        id: "python-venvs",
        label: "Python virtual environments",
        why: "Installed Python packages for a project. Recreate with your requirements or lock file.",
        risk: Review,
        command: None,
        matcher: Project(&[".venv", "venv"], Marker::Inside("pyvenv.cfg")),
    },
    Rule {
        id: "cocoapods",
        label: "CocoaPods folders",
        why: "Installed pods for an iOS project. `pod install` puts them back.",
        risk: Review,
        command: Some("pod install"),
        matcher: Project(&["Pods"], Marker::Beside(&["Podfile"])),
    },
];

/// Folders a project search never enters: app-managed data and bundles,
/// where a node_modules or target folder belongs to an app, not a project.
fn skip_for_projects(name: &str) -> bool {
    matches!(name, "Library" | "Applications" | "System" | "private" | ".Trash" | "node_modules" | ".git")
        || name.ends_with(".app")
        || (name.starts_with('.') && name.len() > 1)
}

/// Suggestions for everything below `id`, biggest first.
pub fn suggest(tree: &Tree, id: u32, home: &Path) -> Vec<Suggestion> {
    let root = logical(&tree.root_path);
    let mut claimed = HashSet::new();
    let mut out = Vec::new();
    for rule in RULES {
        let mut ids = Vec::new();
        match &rule.matcher {
            At(paths) => {
                for p in *paths {
                    if let Some(n) = resolve(tree, &root, &expand(p, home)) {
                        ids.push(n);
                    }
                }
            }
            Each(paths) => {
                for p in *paths {
                    if let Some(n) = resolve(tree, &root, &expand(p, home)) {
                        ids.extend(tree.nodes[n as usize].children.iter().copied());
                    }
                }
            }
            EachWhere(p, test) => {
                if let Some(n) = resolve(tree, &root, &expand(p, home)) {
                    ids.extend(tree.nodes[n as usize].children.iter().copied().filter(|&c| test(&tree.nodes[c as usize].name)));
                }
            }
            Project(names, marker) => find_projects(tree, id, names, marker, &claimed, &mut ids),
        }
        ids.retain(|&n| {
            let node = &tree.nodes[n as usize];
            node.size >= MIN_ITEM
                && node.kind != Kind::Mount
                && (n == id || tree.is_ancestor(id, n))
                && !claimed.contains(&n)
                && !claimed.iter().any(|&c| tree.is_ancestor(c, n))
        });
        if ids.is_empty() {
            continue;
        }
        claimed.extend(ids.iter().copied());
        let mut items = insights::hits(tree, id, ids);
        items.sort_by(|a, b| b.size.cmp(&a.size));
        out.push(Suggestion {
            id: rule.id,
            label: rule.label,
            why: rule.why,
            risk: rule.risk,
            command: rule.command,
            size: items.iter().map(|i| i.size).sum(),
            items,
        });
    }
    out.sort_by(|a, b| b.size.cmp(&a.size));
    out
}

fn find_projects(tree: &Tree, id: u32, names: &[&str], marker: &Marker, claimed: &HashSet<u32>, out: &mut Vec<u32>) {
    let mut stack = vec![id];
    while let Some(n) = stack.pop() {
        let node = &tree.nodes[n as usize];
        for &c in &node.children {
            let child = &tree.nodes[c as usize];
            if child.kind != Kind::Dir || claimed.contains(&c) {
                continue;
            }
            if names.contains(&&*child.name) {
                let has = |list: &[u32], name: &str| list.iter().any(|&x| &*tree.nodes[x as usize].name == name);
                let ok = match marker {
                    Marker::Beside(files) => files.iter().any(|f| has(&node.children, f)),
                    Marker::Inside(file) => has(&child.children, file),
                    Marker::Any => true,
                };
                if ok {
                    out.push(c);
                    continue;
                }
            }
            if !skip_for_projects(&child.name) {
                stack.push(c);
            }
        }
    }
}

/// The path as the user sees it: the startup disk's Data volume is
/// firmlinked into `/`, so `/System/Volumes/Data/Users` is `/Users`.
fn logical(path: &Path) -> PathBuf {
    match path.strip_prefix("/System/Volumes/Data") {
        Ok(rest) => Path::new("/").join(rest),
        Err(_) => path.to_path_buf(),
    }
}

fn expand(p: &str, home: &Path) -> PathBuf {
    match p.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => PathBuf::from(p),
    }
}

/// The node at `target`, if it's inside the scan.
fn resolve(tree: &Tree, root: &Path, target: &Path) -> Option<u32> {
    let rel = target.strip_prefix(root).ok()?;
    let mut cur = ROOT;
    for part in rel.components() {
        let name = part.as_os_str().to_str()?;
        cur = *tree.nodes[cur as usize].children.iter().find(|&&c| &*tree.nodes[c as usize].name == name)?;
    }
    tree.get(cur)?;
    Some(cur)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Scanner;
    use std::fs;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![7u8; bytes]).unwrap();
    }

    #[test]
    fn finds_home_rules_and_projects_without_double_counting() {
        let dir = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(dir.path()).unwrap();
        write(&home.join("Library/Developer/Xcode/DerivedData/App-abc/Build/x.o"), 2_000_000);
        write(&home.join("Library/Caches/Homebrew/bottle.tar.gz"), 2_000_000);
        write(&home.join("Library/Caches/com.example.app/cache.db"), 2_000_000);
        write(&home.join("code/web/package.json"), 10);
        write(&home.join("code/web/node_modules/react/index.js"), 2_000_000);
        write(&home.join("code/web/node_modules/dep/node_modules/x/a.js"), 2_000_000);
        write(&home.join("code/rs/Cargo.toml"), 10);
        write(&home.join("code/rs/target/debug/app"), 2_000_000);
        // Not a project: no Cargo.toml next to it.
        write(&home.join("code/notes/target/file.bin"), 2_000_000);
        // App-managed node_modules are left alone.
        write(&home.join(".vscode/extensions/ext/package.json"), 10);
        write(&home.join(".vscode/extensions/ext/node_modules/a.js"), 2_000_000);

        let s = Scanner::new(&home, false).unwrap();
        s.run(2);
        let t = s.tree();
        let found = suggest(&t, ROOT, &home);
        let by_id = |id: &str| found.iter().find(|s| s.id == id).map(|s| s.items.iter().map(|i| i.name.clone()).collect::<Vec<_>>());

        assert_eq!(by_id("xcode-derived-data").unwrap(), ["DerivedData"]);
        assert_eq!(by_id("homebrew-cache").unwrap(), ["Homebrew"]);
        // Homebrew was claimed first, so the generic rule only has the app cache.
        assert_eq!(by_id("app-caches").unwrap(), ["com.example.app"]);
        // One node_modules (the nested one is inside it), not the extension's.
        assert_eq!(by_id("node-modules").unwrap(), ["node_modules"]);
        assert_eq!(found.iter().find(|s| s.id == "node-modules").unwrap().items[0].location, "code/web");
        assert_eq!(by_id("rust-target").unwrap(), ["target"]);
        assert_eq!(found.iter().find(|s| s.id == "rust-target").unwrap().items[0].location, "code/rs");
    }

    #[test]
    fn scoped_to_the_viewed_folder() {
        let dir = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(dir.path()).unwrap();
        write(&home.join("Library/Logs/app.log"), 2_000_000);
        write(&home.join("code/rs/Cargo.toml"), 10);
        write(&home.join("code/rs/target/a"), 2_000_000);
        let s = Scanner::new(&home, false).unwrap();
        s.run(2);
        let t = s.tree();
        let code = resolve(&t, &home, &home.join("code")).unwrap();
        let found = suggest(&t, code, &home);
        assert_eq!(found.iter().map(|s| s.id).collect::<Vec<_>>(), ["rust-target"]);
    }

    /// `DA_BENCH_PATH=$HOME cargo test --release bench_suggest -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_suggest() {
        let path = std::env::var("DA_BENCH_PATH").expect("set DA_BENCH_PATH");
        let s = Scanner::new(Path::new(&path), false).unwrap();
        s.run(16);
        let t = s.tree();
        let started = std::time::Instant::now();
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        for sg in suggest(&t, ROOT, &home) {
            println!("{:>12} {:<6} {:<28} {} item(s), e.g. {}/{}", sg.size, if sg.risk == Safe { "safe" } else { "review" }, sg.label, sg.items.len(), sg.items[0].location, sg.items[0].name);
        }
        println!("ms={}", started.elapsed().as_millis());
    }

    #[test]
    fn data_volume_paths_are_firmlinked() {
        assert_eq!(logical(Path::new("/System/Volumes/Data/Users/me")), Path::new("/Users/me"));
        assert_eq!(logical(Path::new("/System/Volumes/Data")), Path::new("/"));
        assert_eq!(logical(Path::new("/Volumes/USB")), Path::new("/Volumes/USB"));
    }
}
