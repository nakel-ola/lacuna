//! `lacuna scan <folder>`: the scanner from a terminal, without the window.
//!
//! Link it onto your PATH with:
//!   ln -s /Applications/Lacuna.app/Contents/MacOS/lacuna /usr/local/bin/lacuna

use crate::export;
use crate::insights;
use crate::scanner::{Kind, Scanner, ROOT};
use serde_json::json;
use std::path::PathBuf;
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
}
