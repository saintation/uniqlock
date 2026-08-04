use tauri::Emitter;
use std::time::Duration;
use user_idle::UserIdle;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // System Tray setup
            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("UniQlock Smart Idle Widget")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        println!("Tray icon clicked");
                    }
                })
                .build(app)?;

            // Start the OS-level global idle monitoring thread
            std::thread::spawn(move || {
                let mut was_idle = false;
                // Note: For actual production, threshold is typically 1 min. (60 secs)
                // For testing, we use 5 seconds.
                let threshold_secs = 5;

                loop {
                    std::thread::sleep(Duration::from_millis(1000));
                    if let Ok(idle_time) = UserIdle::get_time() {
                        let is_idle_now = idle_time.as_seconds() >= threshold_secs;
                        if is_idle_now && !was_idle {
                            was_idle = true;
                            let _ = app_handle.emit("idle-state-changed", true);
                        } else if !is_idle_now && was_idle {
                            was_idle = false;
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
