const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const STORAGE_KEY = "desktop-pet-tauri-prototype";

const options = {
  enabled: true,
  dynamic: true,
  size: "small",
  speed: 3,
  reminderMinutes: 60,
};

const sizeMap = {
  small: 150,
  medium: 190,
  large: 235,
};

const elements = {};
let moveTimer = 0;
let reminderTimer = 0;
let speechTimer = 0;
let currentX = 80;

window.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.stage = document.getElementById("petStage");
  elements.image = document.getElementById("petImage");
  elements.speech = document.getElementById("petSpeech");

  loadSavedState();
  applyOptions();
  await placeAtStart();
  await installListeners();
  scheduleMove(500);
  resetReminderTimer();
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    Object.assign(options, {
      enabled: saved.enabled ?? true,
      dynamic: saved.dynamic ?? true,
      size: saved.size ?? "small",
      speed: saved.speed ?? 3,
      reminderMinutes: saved.reminderMinutes ?? 60,
    });
    elements.image.src = saved.imageUrl || createDefaultPetSvg();
  } catch {
    elements.image.src = createDefaultPetSvg();
  }
}

async function installListeners() {
  await listen("pet-image-updated", (event) => {
    elements.image.src = event.payload || createDefaultPetSvg();
  });

  await listen("pet-options-updated", (event) => {
    try {
      Object.assign(options, JSON.parse(event.payload));
      applyOptions();
      resetReminderTimer();
      scheduleMove(150);
    } catch {
      // Ignore malformed prototype payloads.
    }
  });

  await listen("pet-reminder", () => {
    showReminder("测试提醒：休息一下，看看远处。");
  });
}

function applyOptions() {
  elements.image.classList.toggle("pet-breath", options.dynamic);
  invoke("set_pet_visible", { visible: options.enabled });
}

async function placeAtStart() {
  const bounds = await invoke("get_desktop_bounds");
  const size = currentWindowSize();
  currentX = bounds.x + Math.round(bounds.width * 0.12);
  const y = bounds.y + bounds.height - size - 44;
  await invoke("move_pet_window", { x: currentX, y, size });
}

function scheduleMove(delay = randomBetween(2600, 5200)) {
  window.clearTimeout(moveTimer);
  if (!options.enabled) return;

  moveTimer = window.setTimeout(async () => {
    await moveToRandomDesktopPoint();
    scheduleMove(nextDelay());
  }, delay);
}

async function moveToRandomDesktopPoint() {
  const bounds = await invoke("get_desktop_bounds");
  const size = currentWindowSize();
  const margin = 22;
  const maxX = bounds.x + bounds.width - size - margin;
  const maxY = bounds.y + bounds.height - size - margin;
  const minX = bounds.x + margin;
  const minY = bounds.y + margin;
  const bottomBias = Math.random() > 0.34;
  const targetX = randomBetween(minX, Math.max(minX, maxX));
  const targetY = bottomBias
    ? randomBetween(Math.max(minY, bounds.y + Math.round(bounds.height * 0.62)), Math.max(minY, maxY))
    : randomBetween(minY, Math.max(minY, maxY));

  elements.image.style.transform = targetX < currentX ? "scaleX(-1)" : "scaleX(1)";
  currentX = targetX;
  await invoke("move_pet_window", { x: targetX, y: targetY, size });
}

function resetReminderTimer() {
  window.clearInterval(reminderTimer);
  reminderTimer = window.setInterval(() => {
    showReminder(`休息一下吧，已经连续使用 ${options.reminderMinutes} 分钟了。`);
  }, options.reminderMinutes * 60 * 1000);
}

function showReminder(message) {
  elements.image.classList.remove("pet-remind");
  void elements.image.offsetWidth;
  elements.image.classList.add("pet-remind");
  showSpeech(message, 6200);
}

function showSpeech(message, duration) {
  window.clearTimeout(speechTimer);
  elements.speech.textContent = message;
  elements.speech.hidden = false;
  speechTimer = window.setTimeout(() => {
    elements.speech.hidden = true;
  }, duration);
}

function currentWindowSize() {
  return sizeMap[options.size] || sizeMap.small;
}

function nextDelay() {
  const base = 7000 - options.speed * 900;
  return randomBetween(Math.max(1700, base - 900), Math.max(2400, base + 1300));
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function createDefaultPetSvg() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs><linearGradient id="body" x1="30" x2="135" y1="26" y2="140"><stop stop-color="#71c7bd"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>
      <path d="M36 92c0-31 18-57 44-57s44 26 44 57c0 28-18 43-44 43s-44-15-44-43Z" fill="url(#body)"/>
      <path d="M52 53c-10-17 5-25 19-12M108 53c10-17-5-25-19-12" fill="none" stroke="#0f4f4a" stroke-width="10" stroke-linecap="round"/>
      <circle cx="63" cy="83" r="7" fill="#102326"/><circle cx="97" cy="83" r="7" fill="#102326"/>
      <path d="M67 108c10 8 18 8 28 0" fill="none" stroke="#102326" stroke-width="6" stroke-linecap="round"/>
      <path d="M38 97c-16 3-23 12-26 25M122 97c16 3 23 12 26 25" fill="none" stroke="#0f766e" stroke-width="8" stroke-linecap="round"/>
      <circle cx="57" cy="95" r="9" fill="#f3b19a" opacity=".55"/><circle cx="103" cy="95" r="9" fill="#f3b19a" opacity=".55"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
