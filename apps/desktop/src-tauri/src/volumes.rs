//! Mounted disks for the start screen, read with `statfs`.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
    /// What to scan. For the startup disk this is the Data volume: since
    /// macOS 10.15 "/" is a sealed read-only system volume firmlinked to
    /// /System/Volumes/Data, which holds every user-changeable file.
    pub scan_path: String,
    pub total: u64,
    pub free: u64,
    pub is_boot: bool,
}

#[derive(Serialize, Clone, Copy)]
pub struct Space {
    pub total: u64,
    pub free: u64,
}

pub fn space(path: &Path) -> Option<Space> {
    statfs(path).map(|s| Space { total: s.total, free: s.free })
}

struct Fs {
    total: u64,
    free: u64,
    mount_on: String,
    browsable: bool,
}

#[cfg(unix)]
fn statfs(path: &Path) -> Option<Fs> {
    use std::ffi::CString;
    #[cfg(target_os = "macos")]
    use std::ffi::CStr;
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statfs(c.as_ptr(), &mut s) } != 0 {
        return None;
    }
    #[cfg(target_os = "macos")]
    let (mount_on, browsable) = (
        unsafe { CStr::from_ptr(s.f_mntonname.as_ptr()) }.to_string_lossy().into_owned(),
        s.f_flags & 0x0010_0000 == 0, // MNT_DONTBROWSE
    );
    #[cfg(not(target_os = "macos"))]
    let (mount_on, browsable) = (path.to_string_lossy().into_owned(), true);
    Some(Fs {
        total: s.f_blocks as u64 * s.f_bsize as u64,
        free: s.f_bavail as u64 * s.f_bsize as u64,
        mount_on,
        browsable,
    })
}

#[cfg(not(unix))]
fn statfs(_path: &Path) -> Option<Fs> {
    None
}

pub fn list() -> Vec<Volume> {
    let mut boot_name = String::from("Macintosh HD");
    let mut others = Vec::new();
    if let Ok(dir) = std::fs::read_dir("/Volumes") {
        for entry in dir.flatten() {
            let path = entry.path();
            let Some(fs) = statfs(&path) else { continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if fs.mount_on == "/" {
                boot_name = name; // "/Volumes/Macintosh HD" -> "/"
            } else if Path::new(&fs.mount_on) == path && fs.browsable && fs.total > 0 {
                others.push(Volume {
                    name,
                    scan_path: fs.mount_on.clone(),
                    mount_point: fs.mount_on,
                    total: fs.total,
                    free: fs.free,
                    is_boot: false,
                });
            }
        }
    }
    others.sort_by(|a, b| a.name.cmp(&b.name));

    let mut volumes = Vec::new();
    let data = PathBuf::from("/System/Volumes/Data");
    let boot_scan = if data.is_dir() { data } else { PathBuf::from("/") };
    // Capacity numbers come from the Data volume (that's where usage lives).
    if let Some(fs) = statfs(&boot_scan) {
        volumes.push(Volume {
            name: boot_name,
            mount_point: "/".into(),
            scan_path: boot_scan.to_string_lossy().into_owned(),
            total: fs.total,
            free: fs.free,
            is_boot: true,
        });
    }
    volumes.extend(others);
    volumes
}
