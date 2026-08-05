use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::time::Duration;
use user_idle::UserIdle;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            // System Tray setup
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("UniQlock")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
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
                            // Toggle for manual testing if needed
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
                // For testing, we use 5 seconds.
                let threshold_secs = 5;

                loop {
                    std::thread::sleep(Duration::from_millis(500));
                    if let Ok(idle_time) = UserIdle::get_time() {
                        let is_idle_now = idle_time.as_seconds() >= threshold_secs;
                        if is_idle_now && !was_idle {
                            was_idle = true;
                            if let Some(window) = app_handle.get_webview_window("main") {
                                // Move to bottom right
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
