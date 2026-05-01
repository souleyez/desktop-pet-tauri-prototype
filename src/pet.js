const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const STORAGE_KEY = "desktop-pet-tauri-prototype";

const options = {
  enabled: true,
  dynamic: false,
  size: "small",
  speed: 3,
  reminderMinutes: 60,
};

const sizeMap = {
  small: 150,
  medium: 190,
  large: 235,
};

const WALK_SCALE = 1.8;
const WALK_DURATION_RANGE = [26000, 43000];
const IDLE_DELAY_RANGE = [60000, 90000];

const actionSprites = {
  idle: "assets/pet/actions/idle.png",
  blink: "assets/pet/actions/blink.png",
  "look-left": "assets/pet/actions/look-left.png",
  "look-right": "assets/pet/actions/look-right.png",
  sit: "assets/pet/actions/sit.png",
  stretch: "assets/pet/actions/stretch.png",
  "paw-raise": "assets/pet/actions/paw-raise.png",
  "lie-down": "assets/pet/actions/lie-down.png",
  sleep: "assets/pet/actions/sleep.png",
  hop: "assets/pet/actions/hop.png",
};

const walkSprites = [
  "assets/pet/walk/walk-01.png",
  "assets/pet/walk/walk-02.png",
  "assets/pet/walk/walk-03.png",
  "assets/pet/walk/walk-04.png",
  "assets/pet/walk/walk-05.png",
  "assets/pet/walk/walk-06.png",
  "assets/pet/walk/walk-07.png",
  "assets/pet/walk/walk-08.png",
];

const idleActions = [
  "idle",
  "blink",
  "look-left",
  "look-right",
  "sit",
  "stretch",
  "paw-raise",
  "lie-down",
  "sleep",
  "hop",
];

const elements = {};
let moveTimer = 0;
let reminderTimer = 0;
let speechTimer = 0;
let walkFrameTimer = 0;
let moveFrame = 0;
let moveToken = 0;
let currentX = 80;
let currentY = 80;
let walkIndex = 0;

window.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.stage = document.getElementById("petStage");
  elements.image = document.getElementById("petImage");
  elements.speech = document.getElementById("petSpeech");
  elements.image.addEventListener("click", handlePetClick);

  preloadSprites();
  loadSavedState();
  setStaticAction("idle");
  applyOptions();
  await placeAtStart();
  await installListeners();
  scheduleMove(IDLE_DELAY_RANGE[0]);
  resetReminderTimer();
}

function preloadSprites() {
  [...Object.values(actionSprites), ...walkSprites].forEach((src) => {
    const image = new Image();
    image.src = src;
  });
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    Object.assign(options, {
      enabled: saved.enabled ?? true,
      dynamic: false,
      size: saved.size ?? "small",
      speed: saved.speed ?? 3,
      reminderMinutes: saved.reminderMinutes ?? 60,
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function installListeners() {
  await listen("pet-options-updated", (event) => {
    try {
      Object.assign(options, JSON.parse(event.payload));
      options.dynamic = false;
      applyOptions();
      resetReminderTimer();
      scheduleMove(options.enabled ? IDLE_DELAY_RANGE[0] : 0);
    } catch {
      // Ignore malformed prototype payloads.
    }
  });

  await listen("pet-reminder", () => {
    showReminder("休息一下，看看远处。");
  });
}

function applyOptions() {
  elements.image.classList.remove("pet-breath");
  invoke("set_pet_visible", { visible: options.enabled });

  if (!options.enabled) {
    stopMovement();
  }
}

async function handlePetClick() {
  if (!options.enabled) return;

  window.clearTimeout(moveTimer);
  if (walkFrameTimer) return;

  await walkToRandomDesktopPoint();
  scheduleMove(nextDelay());
}

async function placeAtStart() {
  const bounds = await invoke("get_desktop_bounds");
  const size = currentWindowSize();
  currentX = bounds.x + Math.round(bounds.width * 0.12);
  currentY = bounds.y + bounds.height - size - 44;
  await invoke("move_pet_window", { x: currentX, y: currentY, size });
}

function scheduleMove(delay = nextDelay()) {
  window.clearTimeout(moveTimer);
  if (!options.enabled) return;

  moveTimer = window.setTimeout(async () => {
    await walkToRandomDesktopPoint();
    scheduleMove(nextDelay());
  }, delay);
}

async function walkToRandomDesktopPoint() {
  if (!options.enabled) return;

  const bounds = await invoke("get_desktop_bounds");
  const size = currentWalkWindowSize();
  const margin = 22;
  const maxX = bounds.x + bounds.width - size - margin;
  const maxY = bounds.y + bounds.height - size - margin;
  const minX = bounds.x + margin;
  const minY = bounds.y + margin;
  const bottomBias = Math.random() > 0.32;
  const targetX = randomBetween(minX, Math.max(minX, maxX));
  const targetY = bottomBias
    ? randomBetween(Math.max(minY, bounds.y + Math.round(bounds.height * 0.62)), Math.max(minY, maxY))
    : randomBetween(minY, Math.max(minY, maxY));

  await walkTo(targetX, targetY, randomBetween(WALK_DURATION_RANGE[0], WALK_DURATION_RANGE[1]));
}

function walkTo(targetX, targetY, duration) {
  const startX = currentX;
  const startY = currentY;
  const token = ++moveToken;
  const size = currentWalkWindowSize();
  const startedAt = performance.now();
  let lastMove = 0;

  setFacing(targetX < startX ? -1 : 1);
  startWalking();

  return new Promise((resolve) => {
    const step = (now) => {
      if (token !== moveToken || !options.enabled) {
        stopWalking();
        resolve();
        return;
      }

      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeInOut(progress);
      currentX = Math.round(startX + (targetX - startX) * eased);
      currentY = Math.round(startY + (targetY - startY) * eased);

      if (now - lastMove > 42 || progress === 1) {
        lastMove = now;
        invoke("move_pet_window", { x: currentX, y: currentY, size });
      }

      if (progress < 1) {
        moveFrame = window.requestAnimationFrame(step);
      } else {
        stopWalking();
        invoke("move_pet_window", { x: currentX, y: currentY, size: currentWindowSize() });
        setRandomIdleAction();
        resolve();
      }
    };

    moveFrame = window.requestAnimationFrame(step);
  });
}

function startWalking() {
  window.clearInterval(walkFrameTimer);
  elements.image.classList.remove("pet-breath");
  elements.image.classList.add("is-walking");
  walkIndex = 0;
  elements.image.src = walkSprites[walkIndex];
  walkFrameTimer = window.setInterval(() => {
    walkIndex = (walkIndex + 1) % walkSprites.length;
    elements.image.src = walkSprites[walkIndex];
  }, 135);
}

function stopWalking() {
  window.clearInterval(walkFrameTimer);
  walkFrameTimer = 0;
  elements.image.classList.remove("is-walking", "pet-breath");
}

function stopMovement() {
  window.clearTimeout(moveTimer);
  window.cancelAnimationFrame(moveFrame);
  moveToken += 1;
  stopWalking();
}

function setStaticAction(action) {
  elements.image.src = actionSprites[action] || actionSprites.idle;
  elements.image.classList.remove("is-walking", "pet-breath");
}

function setRandomIdleAction() {
  setStaticAction(idleActions[randomBetween(0, idleActions.length - 1)]);
}

function setFacing(direction) {
  elements.image.style.setProperty("--pet-face", String(direction));
}

function resetReminderTimer() {
  window.clearInterval(reminderTimer);
  if (!options.enabled) return;

  reminderTimer = window.setInterval(() => {
    showReminder(`休息一下吧，已经连续使用 ${options.reminderMinutes} 分钟了。`);
  }, options.reminderMinutes * 60 * 1000);
}

function showReminder(message) {
  elements.image.classList.remove("pet-remind");
  void elements.image.offsetWidth;
  elements.image.classList.add("pet-remind");
  setStaticAction("paw-raise");
  showSpeech(message, 6200);
  window.setTimeout(() => {
    elements.image.classList.remove("pet-remind");
  }, 4600);
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

function currentWalkWindowSize() {
  return Math.round(currentWindowSize() * WALK_SCALE);
}

function nextDelay() {
  return randomBetween(IDLE_DELAY_RANGE[0], IDLE_DELAY_RANGE[1]);
}

function easeInOut(value) {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}
