//! Menu bar item: free space at a glance, a low-space alert, and (optionally)
//! staying in the menu bar when the window is closed.
//!
//! Settings live in the app's config folder as `settings.json`.

use crate::{export, volumes};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const CHECK_EVERY: Duration = Duration::from_secs(60);
/// Low means under this many bytes, or under `LOW_FRACTION` of the disk.
const LOW_BYTES: u64 = 10_000_000_000;
const LOW_FRACTION: f64 = 0.05;

#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub keep_in_menu_bar: bool,
    pub low_space_alerts: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { keep_in_menu_bar: false, low_space_alerts: true }
    }
}

pub struct Monitor {
    pub settings: Mutex<Settings>,
    free_item: Mutex<Option<MenuItem<tauri::Wry>>>,
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load(app: &AppHandle) -> Settings {
    settings_path(app).and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(app: &AppHandle, s: Settings) {
    if let Some(p) = settings_path(app) {
        let _ = std::fs::create_dir_all(p.parent().unwrap_or(&p));
        let _ = std::fs::write(p, serde_json::to_vec_pretty(&s).unwrap_or_default());
    }
}

pub fn is_low(total: u64, free: u64) -> bool {
    free < LOW_BYTES || (free as f64) < total as f64 * LOW_FRACTION
}

fn startup_disk() -> Option<volumes::Volume> {
    volumes::list().into_iter().find(|v| v.is_boot)
}

fn free_text(v: &Option<volumes::Volume>) -> String {
    match v {
        Some(v) => format!("{}: {} free of {}", v.name, export::bytes(v.free), export::bytes(v.total)),
        None => "Startup disk unavailable".into(),
    }
}

pub fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Builds the menu bar item and starts the free-space check.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let settings = load(app);
    let disk = startup_disk();
    let free = MenuItem::with_id(app, "free", free_text(&disk), false, None::<&str>)?;
    let keep = CheckMenuItem::with_id(app, "keep", "Keep in Menu Bar When Closed", true, settings.keep_in_menu_bar, None::<&str>)?;
    let alerts = CheckMenuItem::with_id(app, "alerts", "Alert When Space Is Low", true, settings.low_space_alerts, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &free,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open", "Open Lacuna", true, None::<&str>)?,
            &MenuItem::with_id(app, "scan", "Scan Startup Disk", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &keep,
            &alerts,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit Lacuna", true, None::<&str>)?,
        ],
    )?;
    app.manage(Monitor { settings: Mutex::new(settings), free_item: Mutex::new(Some(free)) });

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .tooltip(free_text(&disk))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let monitor = app.state::<Monitor>();
            match event.id().as_ref() {
                "open" => show_window(app),
                "scan" => {
                    show_window(app);
                    let _ = app.emit("scan-startup-disk", ());
                }
                "keep" | "alerts" => {
                    let mut s = monitor.settings.lock().unwrap();
                    s.keep_in_menu_bar = keep.is_checked().unwrap_or(s.keep_in_menu_bar);
                    s.low_space_alerts = alerts.is_checked().unwrap_or(s.low_space_alerts);
                    save(app, *s);
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;

    let app = app.clone();
    std::thread::spawn(move || {
        let mut alerted = false;
        loop {
            std::thread::sleep(CHECK_EVERY);
            let disk = startup_disk();
            let text = free_text(&disk);
            let monitor = app.state::<Monitor>();
            if let Some(item) = monitor.free_item.lock().unwrap().as_ref() {
                let _ = item.set_text(&text);
            }
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(&text));
            }
            let Some(v) = disk else { continue };
            let low = is_low(v.total, v.free);
            let enabled = monitor.settings.lock().unwrap().low_space_alerts;
            if low && !alerted && enabled {
                let _ = app
                    .notification()
                    .builder()
                    .title(format!("{} is almost full", v.name))
                    .body(format!("Only {} left. Open Lacuna to see what's using the space.", export::bytes(v.free)))
                    .show();
                alerted = true;
            }
            // Re-arm once there's comfortably more room again.
            if !is_low(v.total, v.free.saturating_sub(v.free / 3)) {
                alerted = false;
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_space_threshold() {
        assert!(is_low(1_000_000_000_000, 9_000_000_000));
        assert!(!is_low(1_000_000_000_000, 60_000_000_000));
        assert!(is_low(4_000_000_000_000, 150_000_000_000)); // under 5%
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert!(s.low_space_alerts && !s.keep_in_menu_bar);
    }
}
