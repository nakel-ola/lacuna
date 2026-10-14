//! CSV export and number formatting shared by the app and the command line.

use crate::scanner::{Kind, Tree};
use std::io::Write;

/// Items smaller than this are left out of exports (a whole-disk listing of
/// every file would be millions of rows).
pub const MIN_SIZE: u64 = 1_000_000;

/// Every folder and file of at least `min` bytes below `id`, parents before children.
pub fn csv(tree: &Tree, id: u32, min: u64, mut w: impl Write) -> std::io::Result<u64> {
    writeln!(w, "path,kind,size_bytes,files,last_changed_or_opened")?;
    let mut rows = 0;
    let mut stack = vec![id];
    while let Some(n) = stack.pop() {
        let node = &tree.nodes[n as usize];
        let kind = match node.kind {
            Kind::Dir => "folder",
            Kind::File => "file",
            Kind::Symlink => "symlink",
            Kind::Mount => "volume",
        };
        let path = tree.path_of(n);
        writeln!(w, "{},{kind},{},{},{}", field(&path.to_string_lossy()), node.size, node.files, date(node.time))?;
        rows += 1;
        let mut kids: Vec<u32> = node.children.iter().copied().filter(|&c| tree.nodes[c as usize].size >= min).collect();
        // Largest ends up on top of the stack, so it's written first.
        kids.sort_by_key(|&c| tree.nodes[c as usize].size);
        stack.extend(kids);
    }
    Ok(rows)
}

fn field(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// `YYYY-MM-DD` (UTC) for Unix seconds; empty when unknown.
pub fn date(secs: u32) -> String {
    if secs == 0 {
        return String::new();
    }
    // Howard Hinnant's days-to-civil algorithm.
    let z = secs as i64 / 86_400 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Same units as the app: decimal, like Finder.
pub fn bytes(n: u64) -> String {
    if n < 1000 {
        return format!("{n} B");
    }
    let mut v = n as f64;
    let mut unit = "B";
    for u in ["KB", "MB", "GB", "TB", "PB"] {
        v /= 1000.0;
        unit = u;
        if v < 1000.0 {
            break;
        }
    }
    if v < 10.0 { format!("{v:.1} {unit}") } else { format!("{v:.0} {unit}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats() {
        assert_eq!(date(0), "");
        assert_eq!(date(1_000_000_000), "2001-09-09");
        assert_eq!(date(1_709_251_200), "2024-03-01");
        assert_eq!(bytes(999), "999 B");
        assert_eq!(bytes(1_500_000), "1.5 MB");
        assert_eq!(bytes(412_300_000_000), "412 GB");
        assert_eq!(field("a,b\"c"), "\"a,b\"\"c\"");
    }

    #[test]
    fn csv_lists_big_items_parents_first() {
        use crate::scanner::Scanner;
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("big, folder")).unwrap();
        std::fs::write(dir.path().join("big, folder/a.bin"), vec![1u8; 2_000_000]).unwrap();
        std::fs::write(dir.path().join("tiny.txt"), b"x").unwrap();
        let s = Scanner::new(dir.path(), false).unwrap();
        s.run(2);
        let mut out = Vec::new();
        let rows = csv(&s.tree(), 0, MIN_SIZE, &mut out).unwrap();
        let text = String::from_utf8(out).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(rows, 3, "{text}");
        assert!(lines[2].contains("big, folder\",folder,"), "{text}");
        assert!(lines[3].contains("big, folder/a.bin\",file,"), "{text}");
        assert!(!text.contains("tiny.txt"));
    }
}
