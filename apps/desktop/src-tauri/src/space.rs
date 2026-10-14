//! Hidden space: why "used" on the disk is more than the files a scan finds.
//!
//! On an APFS disk every volume in a container shares the same free space, so
//! the disk's "used" includes the sealed macOS volume, swap, Preboot and
//! Recovery, plus snapshots and folders the scan couldn't read. `diskutil`
//! reports each volume's usage without needing an administrator password.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// The scan covers a whole volume (not just a folder on it).
    pub whole_volume: bool,
    pub total: u64,
    pub free: u64,
    /// Space macOS can free on demand (snapshots, iCloud copies, caches),
    /// already counted inside "used".
    pub purgeable: Option<u64>,
    /// Other volumes sharing this disk, largest first. The scanned one is flagged.
    pub volumes: Vec<VolumeUse>,
    /// Bytes the scanned volume says it holds; None when it can't say.
    pub volume_used: Option<u64>,
    pub scanned: u64,
    /// Folders the scan couldn't read (sizes unknown).
    pub unreadable: u64,
    /// Used by the scanned volume but not found by the scan.
    pub unaccounted: u64,
    pub snapshots: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeUse {
    pub name: String,
    pub role: String,
    pub used: u64,
    pub scanned: bool,
}

struct Mount {
    on: String,
    from: String,
    total: u64,
    free: u64,
}

pub fn report(root: &Path, scanned: u64, unreadable: u64) -> Option<Report> {
    let m = mount_of(root)?;
    let whole_volume = Path::new(&m.on) == root || (m.on == "/" && root == Path::new("/System/Volumes/Data"));
    let device = m.from.strip_prefix("/dev/").unwrap_or(&m.from).to_string();
    let (mut volumes, mut volume_used) = (Vec::new(), None);
    if let Some(container) = apfs_container_of(&device) {
        for v in container {
            if v.0 == device {
                volume_used = Some(v.3);
            }
            volumes.push(VolumeUse { scanned: v.0 == device, name: v.1, role: v.2, used: v.3 });
        }
        volumes.sort_by(|a, b| b.used.cmp(&a.used));
    }
    let used_here = volume_used.unwrap_or(m.total.saturating_sub(m.free));
    if volume_used.is_none() {
        // Not APFS (or diskutil failed): the volume is the whole disk.
        volume_used = Some(used_here);
    }
    Some(Report {
        whole_volume,
        total: m.total,
        free: m.free,
        purgeable: purgeable(root, m.free),
        volumes,
        volume_used,
        scanned,
        unreadable,
        unaccounted: if whole_volume { used_here.saturating_sub(scanned) } else { 0 },
        snapshots: snapshots(&device),
    })
}

#[cfg(unix)]
fn mount_of(path: &Path) -> Option<Mount> {
    #[cfg(target_os = "macos")]
    use std::ffi::CStr;
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statfs(c.as_ptr(), &mut s) } != 0 {
        return None;
    }
    #[cfg(target_os = "macos")]
    let (on, from) = unsafe {
        (
            CStr::from_ptr(s.f_mntonname.as_ptr()).to_string_lossy().into_owned(),
            CStr::from_ptr(s.f_mntfromname.as_ptr()).to_string_lossy().into_owned(),
        )
    };
    #[cfg(not(target_os = "macos"))]
    let (on, from) = (path.to_string_lossy().into_owned(), String::new());
    Some(Mount { on, from, total: s.f_blocks as u64 * s.f_bsize as u64, free: s.f_bavail as u64 * s.f_bsize as u64 })
}

#[cfg(not(unix))]
fn mount_of(_path: &Path) -> Option<Mount> {
    None
}

fn diskutil_plist(args: &[&str]) -> Option<plist::Value> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let out = Command::new("/usr/sbin/diskutil").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    plist::from_bytes(&out.stdout).ok()
}

/// (device, name, role, used) for each volume in the APFS container that
/// holds `device`. A snapshot mount like `disk3s1s1` belongs to `disk3s1`.
fn apfs_container_of(device: &str) -> Option<Vec<(String, String, String, u64)>> {
    let list = diskutil_plist(&["apfs", "list", "-plist"])?;
    let containers = list.as_dictionary()?.get("Containers")?.as_array()?;
    for c in containers {
        let vols = c.as_dictionary()?.get("Volumes")?.as_array()?;
        let parsed: Vec<_> = vols
            .iter()
            .filter_map(|v| {
                let v = v.as_dictionary()?;
                let dev = v.get("DeviceIdentifier")?.as_string()?.to_string();
                let name = v.get("Name").and_then(|n| n.as_string()).unwrap_or("").to_string();
                let role = v
                    .get("Roles")
                    .and_then(|r| r.as_array())
                    .and_then(|r| r.first())
                    .and_then(|r| r.as_string())
                    .unwrap_or("")
                    .to_string();
                let used = v.get("CapacityInUse").and_then(|u| u.as_unsigned_integer()).unwrap_or(0);
                Some((dev, name, role, used))
            })
            .collect();
        if parsed.iter().any(|v| device == v.0 || device.strip_prefix(&*v.0).is_some_and(|rest| rest.starts_with('s'))) {
            // Report the snapshot mount as its volume.
            return Some(
                parsed
                    .into_iter()
                    .map(|mut v| {
                        if device.starts_with(&v.0) && device != v.0 {
                            v.0 = device.to_string();
                        }
                        v
                    })
                    .collect(),
            );
        }
    }
    None
}

fn snapshots(device: &str) -> Vec<String> {
    let Some(list) = diskutil_plist(&["apfs", "listSnapshots", "-plist", device]) else { return Vec::new() };
    list.as_dictionary()
        .and_then(|d| d.get("Snapshots"))
        .and_then(|s| s.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_dictionary()?.get("SnapshotName")?.as_string().map(str::to_string))
                // The sealed system volume's own snapshot isn't a backup.
                .filter(|n| !n.starts_with("com.apple.os.update-"))
                .collect()
        })
        .unwrap_or_default()
}

/// "Available for important usage" minus truly free space: what macOS will
/// purge on demand. This is the number Finder adds to free space.
#[cfg(target_os = "macos")]
fn purgeable(path: &Path, free: u64) -> Option<u64> {
    use objc2_foundation::{NSArray, NSNumber, NSString, NSURLVolumeAvailableCapacityForImportantUsageKey, NSURL};
    let key = unsafe { NSURLVolumeAvailableCapacityForImportantUsageKey };
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    let values = url.resourceValuesForKeys_error(&NSArray::from_slice(&[key])).ok()?;
    let number = values.objectForKey(key)?;
    let available = number.downcast_ref::<NSNumber>()?.longLongValue();
    Some((available.max(0) as u64).saturating_sub(free))
}

#[cfg(not(target_os = "macos"))]
fn purgeable(_path: &Path, _free: u64) -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs against this Mac's real startup disk.
    #[test]
    #[cfg(target_os = "macos")]
    fn startup_disk_report_adds_up() {
        let r = report(Path::new("/System/Volumes/Data"), 0, 0).expect("report");
        assert!(r.whole_volume);
        assert!(r.total > 0 && r.free > 0);
        assert!(r.volumes.iter().any(|v| v.scanned && v.role == "Data"), "volumes: {:?}", r.volumes.iter().map(|v| &v.role).collect::<Vec<_>>());
        assert!(r.volumes.iter().any(|v| v.role == "System"));
        assert_eq!(r.unaccounted, r.volume_used.unwrap());
        assert!(r.purgeable.is_some());
        // A folder on the disk isn't the whole volume.
        assert!(!report(Path::new("/System/Volumes/Data/Users"), 0, 0).unwrap().whole_volume);
    }
}
