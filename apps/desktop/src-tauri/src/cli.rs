//! `lacuna scan <folder>`: the scanner from a terminal, without the window.
//!
//! "Install Command Line Tool…" in the menu bar item links it onto the PATH
//! (`install_link`), or by hand:
//!   sudo ln -s /Applications/Lacuna.app/Contents/MacOS/lacuna /usr/local/bin/lacuna

use crate::export;
use crate::insights;
use crate::scanner::{Kind, Scanner, ROOT};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::time::Instant;

const USAGE: &str = "\
Lacuna: see what fills your disk.

Usage:
  lacuna scan <folder> [--top N] [--json] [--csv FILE]

Options:
  --top N      How many folders and files to list (default 15)
  --json       Print the result as JSON
  --csv FILE   Also write every item of 1 MB or more to FILE (- for stdout)

Sizes are space allocated on disk, in decimal units like Finder.
Nothing is ever deleted from the command line.";

/// Runs the command line; returns the process exit code.
pub fn run(args: &[String]) -> i32 {
    match parse(args) {
        Ok(Some(opts)) => scan(opts),
        Ok(None) => {
            println!("{USAGE}");
            0
        }
        Err(e) => {
            eprintln!("lacuna: {e}\n\n{USAGE}");
            2
        }
    }
}

struct Opts {
    path: PathBuf,
    top: usize,
    json: bool,
    csv: Option<String>,
}

fn parse(args: &[String]) -> Result<Option<Opts>, String> {
    let mut it = args.iter();
    match it.next().map(String::as_str) {
        Some("scan") => {}
        Some("help" | "-h" | "--help") | None => return Ok(None),
        Some(other) => return Err(format!("unknown command '{other}'")),
    }
    let (mut path, mut top, mut json, mut csv) = (None, 15, false, None);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => json = true,
            "--top" => top = it.next().and_then(|n| n.parse().ok()).ok_or("--top needs a number")?,
            "--csv" => csv = Some(it.next().ok_or("--csv needs a file")?.clone()),
            "-h" | "--help" => return Ok(None),
            flag if flag.starts_with("--") => return Err(format!("unknown option '{flag}'")),
            p if path.is_none() => path = Some(PathBuf::from(p)),
            _ => return Err("only one folder at a time".into()),
        }
    }
    Ok(Some(Opts { path: path.ok_or("which folder? e.g. lacuna scan ~")?, top, json, csv }))
}

fn scan(o: Opts) -> i32 {
    let scanner = match Scanner::new(&o.path, false) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("lacuna: can't scan {}: {e}", o.path.display());
            return 1;
        }
    };
    let started = Instant::now();
    scanner.run(crate::SCAN_THREADS);
    let elapsed = started.elapsed();
    let tree = scanner.tree();
    let root = &tree.nodes[ROOT as usize];

    let mut kids = root.children.clone();
    kids.sort_by(|&a, &b| tree.nodes[b as usize].size.cmp(&tree.nodes[a as usize].size));
    kids.truncate(o.top);
    let largest = insights::largest_files(&tree, ROOT, o.top);

    if let Some(file) = &o.csv {
        let result = if file == "-" {
            export::csv(&tree, ROOT, export::MIN_SIZE, std::io::stdout().lock())
        } else {
            std::fs::File::create(file).and_then(|f| export::csv(&tree, ROOT, export::MIN_SIZE, std::io::BufWriter::new(f)))
        };
        if let Err(e) = result {
            eprintln!("lacuna: can't write {file}: {e}");
            return 1;
        }
        if file == "-" {
            return 0;
        }
    }

    if o.json {
        let out = json!({
            "root": tree.root_path,
            "bytes": root.size,
            "files": tree.stats.files,
            "folders": tree.stats.dirs,
            "unreadable": tree.stats.errors,
            "elapsedMs": elapsed.as_millis() as u64,
            "items": kids.iter().map(|&c| {
                let n = &tree.nodes[c as usize];
                json!({ "name": &*n.name, "kind": if n.kind == Kind::Dir { "dir" } else { "file" }, "bytes": n.size, "files": n.files })
            }).collect::<Vec<_>>(),
            "largestFiles": largest,
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return 0;
    }

    println!(
        "{}  {}  ·  {} files  ·  {:.1}s{}",
        tree.root_path.display(),
        export::bytes(root.size),
        tree.stats.files,
        elapsed.as_secs_f64(),
        if tree.stats.errors > 0 { format!("  ·  {} unreadable (grant Full Disk Access to Terminal)", tree.stats.errors) } else { String::new() }
    );
    println!();
    for &c in &kids {
        let n = &tree.nodes[c as usize];
        let slash = if n.kind == Kind::Dir { "/" } else { "" };
        println!("  {:>9}  {:>5.1}%  {}{slash}", export::bytes(n.size), n.size as f64 * 100.0 / root.size.max(1) as f64, n.name);
    }
    if !largest.is_empty() {
        println!("\nLargest files");
        for h in &largest {
            let loc = if h.location == "." { String::new() } else { format!("{}/", h.location) };
            println!("  {:>9}  {loc}{}", export::bytes(h.size), h.name);
        }
    }
    0
}

/// Where the menu bar's "Install Command Line Tool…" puts the `lacuna` command.
/// macOS has `/usr/local/bin` on every shell's PATH.
pub const LINK: &str = "/usr/local/bin/lacuna";

#[derive(Debug, PartialEq)]
pub enum Install {
    Installed,
    AlreadyInstalled,
    Cancelled,
}

#[derive(Debug, PartialEq)]
enum Plan {
    Done,
    /// Create the link, replacing one that points at an older copy of Lacuna.
    Link,
}

fn plan(link: &Path, exe: &Path) -> Result<Plan, String> {
    let exe_text = exe.to_string_lossy();
    if exe_text.contains("/AppTranslocation/") || exe_text.starts_with("/Volumes/") {
        return Err("Move Lacuna to your Applications folder first, then try again.".into());
    }
    match std::fs::symlink_metadata(link) {
        Ok(m) if m.file_type().is_symlink() => {
            Ok(if std::fs::read_link(link).is_ok_and(|t| t == exe) { Plan::Done } else { Plan::Link })
        }
        Ok(_) => Err(format!("{} already exists and isn't from Lacuna, so it was left alone.", link.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Plan::Link),
        Err(e) => Err(format!("Can't check {}: {e}", link.display())),
    }
}

/// Links `LINK` to this app's binary. Tries directly first, then asks for an
/// administrator password the standard macOS way, since `/usr/local/bin`
/// usually belongs to root.
pub fn install_link(exe: &Path) -> Result<Install, String> {
    let link = Path::new(LINK);
    if plan(link, exe)? == Plan::Done {
        return Ok(Install::AlreadyInstalled);
    }
    let direct = std::fs::remove_file(link)
        .or_else(|e| if e.kind() == std::io::ErrorKind::NotFound { Ok(()) } else { Err(e) })
        .and_then(|_| std::os::unix::fs::symlink(exe, link));
    if direct.is_ok() {
        return Ok(Install::Installed);
    }
    let out = std::process::Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            "do shell script \"mkdir -p /usr/local/bin && ln -sfn \" & quoted form of (item 1 of argv) & \" \" & quoted form of (item 2 of argv) with prompt \"Lacuna wants to add the lacuna command to your terminal.\" with administrator privileges",
            "-e",
            "end run",
        ])
        .arg(exe)
        .arg(link)
        .output()
        .map_err(|e| format!("Couldn't ask for permission: {e}"))?;
    if out.status.success() {
        Ok(Install::Installed)
    } else if String::from_utf8_lossy(&out.stderr).contains("-128") {
        Ok(Install::Cancelled)
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn parses_options() {
        let o = parse(&args("scan /tmp --top 3 --json")).unwrap().unwrap();
        assert_eq!((o.path, o.top, o.json), (PathBuf::from("/tmp"), 3, true));
        assert!(parse(&args("help")).unwrap().is_none());
        assert!(parse(&args("scan")).is_err());
        assert!(parse(&args("scan /a /b")).is_err());
        assert!(parse(&args("scan /a --nope")).is_err());
        assert!(parse(&args("erase /")).is_err());
    }

    #[test]
    fn install_plan() {
        let dir = tempfile::tempdir().unwrap();
        let exe = Path::new("/Applications/Lacuna.app/Contents/MacOS/lacuna");
        let link = dir.path().join("lacuna");
        assert_eq!(plan(&link, exe), Ok(Plan::Link));
        std::os::unix::fs::symlink("/Users/me/Downloads/Lacuna.app/Contents/MacOS/lacuna", &link).unwrap();
        assert_eq!(plan(&link, exe), Ok(Plan::Link), "points at an old copy");
        std::fs::remove_file(&link).unwrap();
        std::os::unix::fs::symlink(exe, &link).unwrap();
        assert_eq!(plan(&link, exe), Ok(Plan::Done));
        std::fs::remove_file(&link).unwrap();
        std::fs::write(&link, b"someone else's tool").unwrap();
        assert!(plan(&link, exe).is_err());
        assert!(plan(&dir.path().join("x"), Path::new("/Volumes/Lacuna/Lacuna.app/Contents/MacOS/lacuna")).is_err());
    }
}
