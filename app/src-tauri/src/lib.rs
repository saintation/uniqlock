use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::time::Duration;
use user_idle::UserIdle;
use std::io::Write;
use zip::ZipArchive;

#[tauri::command]
fn check_assets_exist(app: tauri::AppHandle) -> bool {
    if let Ok(dir) = app.path().app_data_dir() {
        let assets_dir = dir.join("external_assets");
        return assets_dir.exists();
    }
    false
}

#[tauri::command]
fn get_asset_path(app: tauri::AppHandle, filename: String) -> String {
    if let Ok(dir) = app.path().app_data_dir() {
        let assets_dir = dir.join("external_assets").join(filename);
        return assets_dir.to_string_lossy().to_string();
    }
    "".to_string()
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn download_and_extract_assets(app: tauri::AppHandle) -> Result<(), String> {
    let url = "https://github.com/saintation/uniqlock/archive/0b6d31c3ac8baaeb800df17418cd0c37909a9698.zip";
    
    let _ = app.emit("download-progress", "Downloading media archive (1.3GB)... This may take a few minutes.");
    
    let mut response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    
    let temp_dir = std::env::temp_dir();
    let zip_path = temp_dir.join("uniqlock_assets.zip");
    let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    
    let _ = app.emit("download-progress", "Extracting media files...");
    
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target_dir = app_data_dir.join("external_assets");
    
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        
        let components: Vec<_> = outpath.components().collect();
        // Archive format: uniqlock-<hash>/reference/assets/...
        if components.len() > 3 && components[1].as_os_str() == "reference" && components[2].as_os_str() == "assets" {
            let mut new_path = target_dir.clone();
            for comp in components.into_iter().skip(3) {
                new_path.push(comp);
            }
            
            if (*file.name()).ends_with('/') {
                std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = new_path.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = std::fs::File::create(&new_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
    }
    
    let _ = std::fs::remove_file(zip_path);
    let _ = app.emit("download-progress", "Done");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![check_assets_exist, get_asset_path, download_and_extract_assets, exit_app])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Immediately show window if assets are missing
            let assets_exist = if let Ok(dir) = app_handle.path().app_data_dir() {
                dir.join("external_assets").exists()
            } else {
                false
            };
            if !assets_exist {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            
            let vol_100 = MenuItem::with_id(app, "vol_100", "Volume: 100%", true, None::<&str>)?;
            let vol_75 = MenuItem::with_id(app, "vol_75", "Volume: 75%", true, None::<&str>)?;
            let vol_50 = MenuItem::with_id(app, "vol_50", "Volume: 50%", true, None::<&str>)?;
            let vol_25 = MenuItem::with_id(app, "vol_25", "Volume: 25%", true, None::<&str>)?;
            let vol_0 = MenuItem::with_id(app, "vol_0", "Mute", true, None::<&str>)?;
            let vol_submenu = Submenu::with_items(app, "Volume", true, &[&vol_100, &vol_75, &vol_50, &vol_25, &vol_0])?;
            
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&vol_submenu, &quit_i])?;

            // System Tray setup
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("UniQlock")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    } else if event.id.as_ref().starts_with("vol_") {
                        let vol_str = event.id.as_ref().replace("vol_", "");
                        let vol: f32 = vol_str.parse().unwrap_or(100.0) / 100.0;
                        let _ = app.emit("volume-change", vol);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                            }
                        }
                    }
                })
                .build(app)?;

            // Start the OS-level global idle monitoring thread
            std::thread::spawn(move || {
                let mut was_idle = false;
                let threshold_secs = 5;

                loop {
                    std::thread::sleep(Duration::from_millis(500));
                    if let Ok(idle_time) = UserIdle::get_time() {
                        let is_idle_now = idle_time.as_seconds() >= threshold_secs;
                        if is_idle_now && !was_idle {
                            was_idle = true;
                            if let Some(window) = app_handle.get_webview_window("main") {
                                if let Ok(Some(monitor)) = window.current_monitor() {
                                    let size = window.outer_size().unwrap_or_default();
                                    let monitor_size = monitor.size();
                                    let x = monitor_size.width.saturating_sub(size.width + 20) as i32;
                                    let y = monitor_size.height.saturating_sub(size.height + 40) as i32;
                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                                }
                                let _ = window.show();
                            }
                            let _ = app_handle.emit("idle-state-changed", true);
                        } else if !is_idle_now && was_idle {
                            was_idle = false;
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                            let _ = app_handle.emit("idle-state-changed", false);
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
