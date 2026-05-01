use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[derive(serde::Serialize)]
struct DesktopBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[tauri::command]
fn get_desktop_bounds(app: AppHandle) -> Result<DesktopBounds, String> {
    let window = app
        .get_webview_window("pet")
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| "No available window handle".to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?)
        .ok_or_else(|| "No monitor detected".to_string())?;

    let position = monitor.position();
    let size = monitor.size();

    Ok(DesktopBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale_factor: monitor.scale_factor(),
    })
}

#[tauri::command]
fn move_pet_window(app: AppHandle, x: i32, y: i32, size: u32) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "Pet window not found".to_string())?;

    pet.set_size(PhysicalSize::new(size, size))
        .map_err(|error| error.to_string())?;
    pet.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_pet_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "Pet window not found".to_string())?;

    if visible {
        pet.show().map_err(|error| error.to_string())?;
    } else {
        pet.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn set_pet_click_through(app: AppHandle, ignore: bool) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "Pet window not found".to_string())?;

    pet.set_ignore_cursor_events(ignore)
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_pet_options(app: AppHandle, payload: String) -> Result<(), String> {
    app.emit_to("pet", "pet-options-updated", payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn trigger_pet_reminder(app: AppHandle) -> Result<(), String> {
    app.emit_to("pet", "pet-reminder", ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(pet) = app.get_webview_window("pet") {
                let _ = pet.set_always_on_top(true);
                let _ = pet.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_bounds,
            move_pet_window,
            set_pet_visible,
            set_pet_click_through,
            update_pet_options,
            trigger_pet_reminder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
