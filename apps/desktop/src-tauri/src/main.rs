// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Any plain word or flag means the command line (`lacuna scan <folder>`):
    // it runs in the terminal and never opens a window. Launch Services
    // starts the app with no arguments (or a `-psn_…` one on old macOS).
    let args: Vec<String> = std::env::args().skip(1).filter(|a| !a.starts_with("-psn_")).collect();
    if !args.is_empty() {
        std::process::exit(lacuna_lib::cli(&args));
    }
    lacuna_lib::run()
}
