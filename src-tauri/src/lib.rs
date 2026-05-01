use base64::{engine::general_purpose, Engine as _};
use reqwest::multipart::{Form, Part};
use serde_json::json;
use std::{
    env, fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

const DEFAULT_BASE_URL: &str = "https://souleye.cc";
const DEFAULT_ORCHESTRATOR_PATH: &str = "/api/codex/orchestrator/v1";
const DEFAULT_SOURCE: &str = "desktop-pet-client";
const BUNDLED_ACCESS_KEY: Option<&str> = option_env!("DESKTOP_PET_ORCHESTRATOR_ACCESS_KEY");

#[derive(serde::Serialize)]
struct DesktopBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[derive(serde::Deserialize)]
struct PetGenerationInput {
    image_data_url: String,
    filename: String,
    mime_type: String,
    pet_type: String,
}

#[derive(serde::Serialize)]
struct PetGenerationSubmitResult {
    task_id: String,
    status: String,
    message: String,
}

#[derive(serde::Serialize)]
struct PetGenerationStatusResult {
    task_id: String,
    status: String,
    message: String,
    artifact_url: String,
    artifact_data_url: String,
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
fn update_pet_image(app: AppHandle, image_url: String) -> Result<(), String> {
    app.emit_to("pet", "pet-image-updated", image_url)
        .map_err(|error| error.to_string())
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

#[tauri::command]
async fn submit_pet_generation_task(
    input: PetGenerationInput,
) -> Result<PetGenerationSubmitResult, String> {
    let access_key = read_orchestrator_access_key()?;
    let base_url = orchestrator_base_url();
    let image_bytes = decode_data_url(&input.image_data_url)?;
    let client = reqwest::Client::new();

    let upload_part = Part::bytes(image_bytes)
        .file_name(safe_filename(&input.filename))
        .mime_str(&safe_mime_type(&input.mime_type))
        .map_err(|error| error.to_string())?;

    let upload_response: serde_json::Value = client
        .post(format!("{base_url}/api/codex/uploads"))
        .bearer_auth(&access_key)
        .header("X-Client-Name", DEFAULT_SOURCE)
        .multipart(Form::new().part("file", upload_part))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let upload_id = upload_response
        .get("item")
        .and_then(|item| item.get("id"))
        .and_then(|id| id.as_str())
        .ok_or_else(|| "Upload response did not include item.id".to_string())?;

    let pet_type = input.pet_type.trim();
    let prompt = format!(
        "请根据上传的宠物图片，先识别并参考宠物的品类、主色、耳朵/尾巴/花纹等特征。用户确认的宠物类型是：{pet_type}。\n\
生成一个适合桌面宠物软件使用的 Q 版同类型宠物形象素材：透明背景 PNG，角色居中，完整身体，边缘干净，风格可爱但不要文字、不要背景、不要道具。\
保持与上传图片的主要颜色和显著特征一致。输出一张可直接作为桌面宠物预览使用的透明 PNG。"
    );

    let request_id = format!("desktop-pet-{}", unix_ms());
    let submit_body = json!({
        "runtimeTargetId": "cloudflare",
        "projectId": "codex-web",
        "kind": "image-draft",
        "source": DEFAULT_SOURCE,
        "prompt": prompt,
        "attachments": [{ "id": upload_id }],
        "metadata": {
            "requestId": request_id,
            "output": "image-artifact",
            "title": "桌面宠物生成",
            "petType": pet_type,
            "desktopPetMode": "q-version-same-type",
            "imagePath": "server1-codex-artifact"
        }
    });

    let submit_response: serde_json::Value = client
        .post(format!("{base_url}{DEFAULT_ORCHESTRATOR_PATH}/tasks"))
        .bearer_auth(&access_key)
        .header("Content-Type", "application/json")
        .header("X-Client-Name", DEFAULT_SOURCE)
        .header("Idempotency-Key", request_id)
        .json(&submit_body)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let task = submit_response.get("task").unwrap_or(&submit_response);
    let task_id = task
        .get("id")
        .and_then(|id| id.as_str())
        .ok_or_else(|| "Submit response did not include task.id".to_string())?
        .to_string();
    let status = task
        .get("status")
        .or_else(|| submit_response.get("status"))
        .and_then(|value| value.as_str())
        .unwrap_or("queued")
        .to_string();
    let message = submit_response
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("任务已进入队列")
        .to_string();

    Ok(PetGenerationSubmitResult {
        task_id,
        status,
        message,
    })
}

#[tauri::command]
async fn poll_pet_generation_task(task_id: String) -> Result<PetGenerationStatusResult, String> {
    let clean_task_id = task_id.trim();
    if clean_task_id.is_empty() {
        return Err("Task id is required".to_string());
    }

    let access_key = read_orchestrator_access_key()?;
    let base_url = orchestrator_base_url();
    let response: serde_json::Value = reqwest::Client::new()
        .get(format!(
            "{base_url}{DEFAULT_ORCHESTRATOR_PATH}/tasks/{clean_task_id}?includeArtifactData=1"
        ))
        .bearer_auth(&access_key)
        .header("X-Client-Name", DEFAULT_SOURCE)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let task = response.get("task").unwrap_or(&response);
    let status = task
        .get("status")
        .or_else(|| response.get("status"))
        .and_then(|value| value.as_str())
        .unwrap_or("queued")
        .to_string();
    let message = response
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    let artifacts = task
        .get("result")
        .and_then(|result| result.get("artifacts"))
        .and_then(|value| value.as_array());
    let first_artifact = artifacts.and_then(|items| items.first());
    let artifact_url = first_artifact
        .and_then(|artifact| artifact.get("downloadUrl").or_else(|| artifact.get("url")))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let artifact_data_url = first_artifact
        .and_then(|artifact| artifact.get("dataUrl"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            let mime_type = first_artifact
                .and_then(|artifact| artifact.get("mimeType"))
                .and_then(|value| value.as_str())
                .unwrap_or("image/png");
            first_artifact
                .and_then(|artifact| artifact.get("base64"))
                .and_then(|value| value.as_str())
                .map(|value| format!("data:{mime_type};base64,{value}"))
        })
        .unwrap_or_default();

    Ok(PetGenerationStatusResult {
        task_id: clean_task_id.to_string(),
        status,
        message,
        artifact_url,
        artifact_data_url,
    })
}

fn orchestrator_base_url() -> String {
    env::var("DESKTOP_PET_QUEUE_BASE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
}

fn read_orchestrator_access_key() -> Result<String, String> {
    if let Ok(value) = env::var("CODEX_ORCHESTRATOR_ACCESS_KEY") {
        let key = value
            .trim()
            .trim_start_matches("Bearer ")
            .trim()
            .to_string();
        if !key.is_empty() {
            return Ok(key);
        }
    }

    if let Some(value) = BUNDLED_ACCESS_KEY {
        let key = value
            .trim()
            .trim_start_matches("Bearer ")
            .trim()
            .to_string();
        if !key.is_empty() {
            return Ok(key);
        }
    }

    let key_file = env::var("CODEX_ORCHESTRATOR_KEY_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            home_dir()
                .join("Desktop")
                .join("codex")
                .join(".storage")
                .join("generated-access-keys")
                .join("latest-image-generation-keys.md")
        });
    let text = fs::read_to_string(&key_file).map_err(|_| {
        format!(
            "Could not read orchestrator key file: {}",
            key_file.display()
        )
    })?;

    for line in text.lines() {
        if let Some((_, value)) = line.split_once("Authorization: Bearer") {
            let key = value.trim().to_string();
            if !key.is_empty() {
                return Ok(key);
            }
        }
    }

    Err(format!("No bearer key found in {}", key_file.display()))
}

fn home_dir() -> PathBuf {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Image data URL is invalid".to_string())?;
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())
}

fn safe_filename(filename: &str) -> String {
    let clean = filename
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
        .collect::<String>();
    if clean.is_empty() {
        "desktop-pet.png".to_string()
    } else {
        clean
    }
}

fn safe_mime_type(mime_type: &str) -> String {
    let clean = mime_type.trim().to_ascii_lowercase();
    if clean.starts_with("image/") {
        clean
    } else {
        "image/png".to_string()
    }
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
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
            update_pet_image,
            update_pet_options,
            trigger_pet_reminder,
            submit_pet_generation_task,
            poll_pet_generation_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
