const { invoke } = window.__TAURI__.core;

const STORAGE_KEY = "desktop-pet-tauri-prototype";
const DEFAULT_PET_IMAGE = "assets/default-british-shorthair.svg";
const POLL_STATUSES = new Set(["queued", "submitted", "running"]);

const state = {
  imageDataUrl: "",
  generatedImageUrl: "",
  filename: "pet.png",
  mimeType: "image/png",
  petType: "",
  taskId: "",
  isGenerating: false,
};

const elements = {};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  loadState();
  installHandlers();
  applyState();
  await bootPetWindow();
}

function bindElements() {
  elements.petUpload = document.getElementById("petUpload");
  elements.uploadLabel = document.getElementById("uploadLabel");
  elements.originalPreview = document.getElementById("originalPreview");
  elements.recognitionBlock = document.getElementById("recognitionBlock");
  elements.petTypeInput = document.getElementById("petTypeInput");
  elements.generateButton = document.getElementById("generateButton");
  elements.jobStatus = document.getElementById("jobStatus");
}

function installHandlers() {
  elements.petUpload.addEventListener("change", handleUpload);
  elements.petTypeInput.addEventListener("input", () => {
    state.petType = elements.petTypeInput.value.trim();
    saveState();
    applyState();
  });
  elements.generateButton.addEventListener("click", generatePet);
}

function loadState() {
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyState() {
  elements.originalPreview.src = state.generatedImageUrl || state.imageDataUrl || "";
  elements.recognitionBlock.hidden = !state.imageDataUrl;
  elements.petTypeInput.value = state.petType || "";
  elements.generateButton.disabled = state.isGenerating || !state.imageDataUrl || !state.petType.trim();
  elements.uploadLabel.textContent = state.imageDataUrl ? "重新上传宠物图片" : "上传宠物图片";
}

async function bootPetWindow() {
  const imageUrl = state.generatedImageUrl || DEFAULT_PET_IMAGE;
  await invoke("set_pet_visible", { visible: true });
  await invoke("set_pet_click_through", { ignore: true });
  await invoke("update_pet_image", { imageUrl });
  await invoke("update_pet_options", {
    payload: JSON.stringify({
      enabled: true,
      dynamic: true,
      size: "small",
      speed: 3,
      reminderMinutes: 60,
    }),
  });
}

async function handleUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件。", true);
    return;
  }

  state.imageDataUrl = await fileToDataUrl(file);
  state.generatedImageUrl = "";
  state.filename = file.name || "pet.png";
  state.mimeType = file.type || "image/png";
  state.petType = guessPetType(file.name);
  state.taskId = "";
  state.isGenerating = false;
  saveState();
  applyState();

  setStatus(`识别您的宠物是 ${state.petType}，可修改后继续生成。`);
  await invoke("update_pet_image", { imageUrl: state.generatedImageUrl || DEFAULT_PET_IMAGE });
  await generatePet();
}

async function generatePet() {
  if (state.isGenerating || !state.imageDataUrl || !state.petType.trim()) return;

  state.isGenerating = true;
  saveState();
  applyState();
  setStatus("已上传，正在自动生成 Q 版桌面宠物...");

  try {
    const submitted = await invoke("submit_pet_generation_task", {
      input: {
        image_data_url: state.imageDataUrl,
        filename: state.filename,
        mime_type: state.mimeType,
        pet_type: state.petType.trim(),
      },
    });

    state.taskId = submitted.task_id;
    saveState();
    setStatus(`${submitted.message || "任务已进入队列"}：${submitted.status}`);
    await pollUntilDone(state.taskId);
  } catch (error) {
    state.isGenerating = false;
    saveState();
    applyState();
    setStatus(`提交失败：${readableError(error)}`, true);
  }
}

async function pollUntilDone(taskId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wait(attempt === 0 ? 1200 : 5000);
    const result = await invoke("poll_pet_generation_task", { taskId });
    if (taskId !== state.taskId) {
      return;
    }
    const status = String(result.status || "").toLowerCase();
    setStatus(`${result.message || "处理中"}：${status}`);

    if (status === "completed") {
      const nextImage = result.artifact_data_url || result.artifact_url;
      if (nextImage) {
        state.generatedImageUrl = nextImage;
        await invoke("update_pet_image", { imageUrl: nextImage });
      }
      state.isGenerating = false;
      saveState();
      applyState();
      setStatus("桌面宠物已生成，并同步到桌面。");
      return;
    }

    if (!POLL_STATUSES.has(status)) {
      state.isGenerating = false;
      saveState();
      applyState();
      setStatus(`生成未完成：${result.message || status || "未知状态"}`, true);
      return;
    }
  }

  state.isGenerating = false;
  saveState();
  applyState();
  setStatus("生成仍在队列中，请稍后再试。", true);
}

function guessPetType(filename) {
  const text = String(filename || "").toLowerCase();
  const table = [
    ["猫", ["cat", "kitten", "miao", "mao", "猫", "橘猫", "狸花"]],
    ["狗", ["dog", "puppy", "gou", "狗", "小狗", "柴犬", "柯基", "边牧"]],
    ["兔子", ["rabbit", "bunny", "tuzi", "兔"]],
    ["仓鼠", ["hamster", "鼠", "仓鼠"]],
    ["鸟", ["bird", "parrot", "niao", "鸟", "鹦鹉"]],
    ["乌龟", ["turtle", "tortoise", "龟", "乌龟"]],
  ];

  for (const [label, keywords] of table) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return label;
    }
  }

  return "猫";
}

function setStatus(message, isError = false) {
  elements.jobStatus.hidden = !message;
  elements.jobStatus.textContent = message;
  elements.jobStatus.classList.toggle("error", isError);
}

function readableError(error) {
  return String(error?.message || error || "未知错误").replace(/^Error:\s*/, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
