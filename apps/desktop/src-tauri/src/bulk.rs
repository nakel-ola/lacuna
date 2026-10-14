//! Directory reading.
//!
//! On macOS this uses `getattrlistbulk(2)`.
//! One syscall returns names *and* attributes (type, device, inode, link
//! count, allocated size) for many entries, so there is no `stat` per file.
//! Other platforms fall back to `read_dir` + `symlink_metadata`.

use std::path::Path;

#[allow(dead_code)]
pub const TYPE_FILE: u32 = 1;
pub const TYPE_DIR: u32 = 2;
pub const TYPE_SYMLINK: u32 = 5;

pub struct Entry {
    pub name: String,
    pub kind: u32,
    pub dev: u64,
    pub ino: u64,
    pub nlink: u32,
    /// Bytes allocated on disk (what deleting it frees), not logical length.
    pub alloc: u64,
    /// Newest of modification and access time, in Unix seconds.
    pub time: u32,
    pub error: i32,
}

#[cfg(target_os = "macos")]
pub fn read_dir(path: &Path, mut f: impl FnMut(Entry)) -> Result<(), i32> {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_int, c_void};
    use std::os::unix::ffi::OsStrExt;

    // Values from <sys/attr.h>.
    const ATTR_CMN_NAME: u32 = 0x0000_0001;
    const ATTR_CMN_DEVID: u32 = 0x0000_0002;
    const ATTR_CMN_OBJTYPE: u32 = 0x0000_0008;
    const ATTR_CMN_MODTIME: u32 = 0x0000_0400;
    const ATTR_CMN_ACCTIME: u32 = 0x0000_1000;
    const ATTR_CMN_FILEID: u32 = 0x0200_0000;
    const ATTR_CMN_ERROR: u32 = 0x2000_0000;
    const ATTR_CMN_RETURNED_ATTRS: u32 = 0x8000_0000;
    const ATTR_FILE_LINKCOUNT: u32 = 0x0000_0001;
    const ATTR_FILE_ALLOCSIZE: u32 = 0x0000_0004;
    const FSOPT_PACK_INVAL_ATTRS: u64 = 0x0000_0008;
    const ATTRIBUTE_SET_SIZE: usize = 20; // attribute_set_t: 5 × u32

    #[repr(C)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    extern "C" {
        fn getattrlistbulk(dirfd: c_int, list: *mut c_void, buf: *mut c_void, size: usize, options: u64) -> c_int;
    }

    let cpath = CString::new(path.as_os_str().as_bytes()).map_err(|_| libc::EINVAL)?;
    let fd = unsafe { libc::open(cpath.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC) };
    if fd < 0 {
        return Err(last_errno());
    }
    struct Fd(c_int);
    impl Drop for Fd {
        fn drop(&mut self) {
            unsafe { libc::close(self.0) };
        }
    }
    let _guard = Fd(fd);

    let mut list = AttrList {
        bitmapcount: 5, // ATTR_BIT_MAP_COUNT
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS
            | ATTR_CMN_ERROR
            | ATTR_CMN_NAME
            | ATTR_CMN_DEVID
            | ATTR_CMN_OBJTYPE
            | ATTR_CMN_MODTIME
            | ATTR_CMN_ACCTIME
            | ATTR_CMN_FILEID,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_LINKCOUNT | ATTR_FILE_ALLOCSIZE,
        forkattr: 0,
    };
    let mut buf = vec![0u64; 32 * 1024]; // 256 KiB, 8-byte aligned
    let buf_len = buf.len() * 8;

    loop {
        // FSOPT_PACK_INVAL_ATTRS: every requested attribute is present in every
        // record (zeroed when not applicable), so the record layout is fixed.
        let count = unsafe {
            getattrlistbulk(fd, &mut list as *mut _ as *mut c_void, buf.as_mut_ptr() as *mut c_void, buf_len, FSOPT_PACK_INVAL_ATTRS)
        };
        if count < 0 {
            return Err(last_errno());
        }
        if count == 0 {
            return Ok(());
        }
        let base = buf.as_ptr() as *const u8;
        let mut offset = 0usize;
        for _ in 0..count {
            unsafe {
                let rec = base.add(offset);
                let len = read::<u32>(rec, 0) as usize;
                let mut p = 4 + ATTRIBUTE_SET_SIZE;
                let error = read::<u32>(rec, p); // ATTR_CMN_ERROR follows RETURNED_ATTRS
                p += 4;
                let name_ref = p;
                let name_off = read::<i32>(rec, p);
                p += 8; // attrreference_t { i32 offset, u32 length }
                let dev = read::<i32>(rec, p);
                p += 4;
                let kind = read::<u32>(rec, p);
                p += 4;
                let mtime = read::<i64>(rec, p); // struct timespec { tv_sec, tv_nsec }
                p += 16;
                let atime = read::<i64>(rec, p);
                p += 16;
                let ino = read::<u64>(rec, p);
                p += 8;
                let nlink = read::<u32>(rec, p);
                p += 4;
                let alloc = read::<i64>(rec, p);

                let name_ptr = rec.add(name_ref).offset(name_off as isize) as *const libc::c_char;
                let name = CStr::from_ptr(name_ptr).to_string_lossy().into_owned();
                f(Entry {
                    name,
                    kind,
                    dev: dev as u64,
                    ino,
                    nlink,
                    alloc: alloc.max(0) as u64,
                    time: unix_secs(mtime.max(atime)),
                    error: error as i32,
                });
                offset += len;
            }
        }
    }
}

#[cfg(target_os = "macos")]
unsafe fn read<T: Copy>(rec: *const u8, at: usize) -> T {
    std::ptr::read_unaligned(rec.add(at) as *const T)
}

#[cfg(not(target_os = "macos"))]
pub fn read_dir(path: &Path, mut f: impl FnMut(Entry)) -> Result<(), i32> {
    let iter = std::fs::read_dir(path).map_err(|e| e.raw_os_error().unwrap_or(libc::EIO))?;
    for item in iter {
        let Ok(item) = item else { continue };
        let name = item.file_name().to_string_lossy().into_owned();
        match std::fs::symlink_metadata(item.path()) {
            Ok(md) => {
                let ft = md.file_type();
                let kind = if ft.is_dir() { TYPE_DIR } else if ft.is_symlink() { TYPE_SYMLINK } else { TYPE_FILE };
                #[cfg(unix)]
                let (dev, ino, nlink, alloc, time) = {
                    use std::os::unix::fs::MetadataExt;
                    (md.dev(), md.ino(), md.nlink() as u32, md.blocks() * 512, unix_secs(md.mtime().max(md.atime())))
                };
                #[cfg(not(unix))]
                let (dev, ino, nlink, alloc, time) = {
                    let secs = |t: std::io::Result<std::time::SystemTime>| {
                        t.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs() as i64)
                    };
                    (0, 0, 1, md.len(), unix_secs(secs(md.modified()).max(secs(md.accessed()))))
                };
                f(Entry { name, kind, dev, ino, nlink, alloc, time, error: 0 });
            }
            Err(e) => f(Entry { name, kind: 0, dev: 0, ino: 0, nlink: 0, alloc: 0, time: 0, error: e.raw_os_error().unwrap_or(libc::EIO) }),
        }
    }
    Ok(())
}

/// Seconds since 1970 in a u32 (good until 2106), clamped.
fn unix_secs(t: i64) -> u32 {
    t.clamp(0, u32::MAX as i64) as u32
}

fn last_errno() -> i32 {
    std::io::Error::last_os_error().raw_os_error().unwrap_or(libc::EIO)
}

/// Device id of a path, comparable with `Entry::dev`.
pub fn device_of(path: &Path) -> std::io::Result<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(std::fs::symlink_metadata(path)?.dev())
    }
    #[cfg(not(unix))]
    {
        std::fs::symlink_metadata(path).map(|_| 0)
    }
}
