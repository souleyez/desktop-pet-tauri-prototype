const { invoke } = window.__TAURI__.core;

const STORAGE_KEY = "solara-desktop-pet";

const state = {
  enabled: true,
  dynamic: false,
  size: "small",
  speed: 3,
  reminderMinutes: 60,
};

const elements = {};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.enableButton = document.getElementById("enableButton");
  elements.stopButton = document.getElementById("stopButton");

  loadState();
  installHandlers();
  await syncPet();
}

function installHandlers() {
  elements.enableButton.addEventListener("click", () => setEnabled(true));
  elements.stopButton.addEventListener("click", () => setEnabled(false));
}

function loadState() {
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    state.dynamic = false;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function setEnabled(enabled) {
  state.enabled = enabled;
  saveState();
  await syncPet();
}

async function syncPet() {
  elements.enableButton.disabled = state.enabled;
  elements.stopButton.disabled = !state.enabled;
  elements.enableButton.setAttribute("aria-pressed", String(state.enabled));
  elements.stopButton.setAttribute("aria-pressed", String(!state.enabled));

  await invoke("set_pet_click_through", { ignore: false });
  await invoke("set_pet_visible", { visible: state.enabled });
  await invoke("update_pet_options", {
    payload: JSON.stringify(state),
  });
}
