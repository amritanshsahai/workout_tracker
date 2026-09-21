/* ===================== Constants ===================== */

const DB_NAME = "routine-tracker";
const DB_VERSION = 1;
const STORES = ["routines", "exercises", "settings", "rotationState", "logs"];

const DIFFICULTY_TYPES = [
  { id: "weight", label: "Weight" },
  { id: "reps", label: "Reps" },
  { id: "time", label: "Time (sec)" },
  { id: "per_side", label: "Per side" },
];

const LOW_DEFAULTS = { weight: 0, reps: 5, time: 15, per_side: 5 };

const ROUTINE_COLORS = ["#E8B23D", "#4CAF6D", "#5A9BD8", "#C97BD8", "#E0574C", "#63C7C0", "#D8A05A", "#8B8DF0"];

const LBS_PER_KG = 2.2046226218;

/* ===================== Utilities ===================== */

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function todayKey() {
  const d = new Date();
  return dateToKey(d);
}

function dateToKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lbsToKg(lbs) { return lbs / LBS_PER_KG; }
function kgToLbs(kg) { return kg * LBS_PER_KG; }

/* Weight is always stored canonically in lbs. Convert only for display. */
function displayWeight(lbsValue, unit) {
  if (unit === "kg") return Math.round(lbsToKg(lbsValue) * 2) / 2; // nearest 0.5 kg
  return Math.round(lbsValue);
}
function storageWeightFromDisplay(displayValue, unit) {
  if (unit === "kg") return Math.round(kgToLbs(displayValue));
  return Math.round(displayValue);
}

function formatDifficultyValue(exercise, value, unit) {
  if (value === null || value === undefined) return "—";
  if (exercise.difficultyType === "weight") {
    return `${displayWeight(value, unit)} ${unit}`;
  }
  if (exercise.difficultyType === "time") return `${value}s`;
  if (exercise.difficultyType === "per_side") return `${value}/side`;
  return `${value}`;
}

/* ===================== IndexedDB layer ===================== */

let dbInstance = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("routines")) db.createObjectStore("routines", { keyPath: "id" });
      if (!db.objectStoreNames.contains("exercises")) db.createObjectStore("exercises", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("rotationState")) db.createObjectStore("rotationState", { keyPath: "key" });
      if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "date" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getDb() {
  if (!dbInstance) dbInstance = await openDb();
  return dbInstance;
}

function txStore(db, storeName, mode = "readonly") {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

async function dbGetAll(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, value) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, "readwrite");
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, "readwrite");
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ===================== Seed data ===================== */

async function seedIfEmpty() {
  const existingRoutines = await dbGetAll("routines");
  if (existingRoutines.length > 0) return;

  const routineDefs = [
    {
      name: "Back + Biceps",
      exercises: [
        ["Bent Over Rowing", "weight", 50, 47],
        ["Dumbbell Pullover Floor", "weight", 50, 33],
        ["Dumbbell Bicep Curls", "weight", 30, 27],
        ["Bicep Concentration Curls", "weight", 40, 23],
        ["Decline Reverse Crunches", "reps", 30, 25],
        ["High Knee", "per_side", 50, 25],
      ],
    },
    {
      name: "Chest + Triceps",
      exercises: [
        ["Floor Pushups", "reps", 25, 20],
        ["Dumbbell Chest Press Floor", "weight", 50, 53],
        ["Dumbbell Floor Hex Press", "weight", 50, 47],
        ["DB Floor Chest Fly", "weight", 30, 27],
        ["DB Overhead Triceps Extension", "weight", 50, 27],
        ["Dumbbell Skull Crushers", "weight", 30, 27],
        ["Deadbug", "per_side", 30, 20],
      ],
    },
    {
      name: "Legs + Shoulders",
      exercises: [
        ["Bodyweight Box Squats", "weight", 40, 33],
        ["DB Stiff Leg Deadlifts", "weight", 50, 67],
        ["DB Glute Bridge", "weight", 50, 53],
        ["DB Shoulder Press Seated", "weight", 40, 33],
        ["DB Lateral Raise", "weight", 20, 20],
        ["DB Upright Row", "weight", 30, 27],
      ],
    },
  ];

  let routineOrder = 0;
  for (const rDef of routineDefs) {
    const routineId = uuid();
    await dbPut("routines", { id: routineId, name: rDef.name, order: routineOrder });
    let exOrder = 0;
    for (const [name, type, benchmark, aspiration] of rDef.exercises) {
      await dbPut("exercises", {
        id: uuid(),
        name,
        routineId,
        difficultyType: type,
        currentBenchmark: benchmark,
        aspiration: aspiration,
        numberOfSets: 3,
        order: exOrder,
      });
      exOrder++;
    }
    routineOrder++;
  }

  await dbPut("settings", { key: "app", unit: "lbs" });
  await dbPut("rotationState", { key: "state", currentRoutineId: null, lastAction: null });
}

/* ===================== App state ===================== */

const state = {
  routines: [],
  exercises: [],
  settings: { unit: "lbs" },
  rotation: { currentRoutineId: null, lastAction: null },
  logs: {}, // date -> routineId
  calendarCursor: new Date(), // month being viewed
  calendarEditMode: false,
  manageSelectedRoutineId: null,
};

async function loadAllData() {
  const [routines, exercises, settingsRow, rotationRow, logRows] = await Promise.all([
    dbGetAll("routines"),
    dbGetAll("exercises"),
    dbGet("settings", "app"),
    dbGet("rotationState", "state"),
    dbGetAll("logs"),
  ]);
  state.routines = routines.sort((a, b) => a.order - b.order);
  state.exercises = exercises;
  state.settings = settingsRow || { key: "app", unit: "lbs" };
  state.rotation = rotationRow || { key: "state", currentRoutineId: null, lastAction: null };
  state.logs = {};
  for (const row of logRows) state.logs[row.date] = row.routineId;

  // If no current routine set yet, default to first routine.
  if (!state.rotation.currentRoutineId && state.routines.length > 0) {
    state.rotation.currentRoutineId = state.routines[0].id;
    await dbPut("rotationState", state.rotation);
  }

  // Clear stale undo state if it's from a previous day.
  if (state.rotation.lastAction) {
    const actionDate = new Date(state.rotation.lastAction.timestamp);
    if (dateToKey(actionDate) !== todayKey()) {
      state.rotation.lastAction = null;
      await dbPut("rotationState", state.rotation);
    }
  }
}

function getRoutineById(id) {
  return state.routines.find((r) => r.id === id) || null;
}

function getExercisesForRoutine(routineId) {
  return state.exercises
    .filter((e) => e.routineId === routineId)
    .sort((a, b) => a.order - b.order);
}

function routineColor(routineId) {
  const idx = state.routines.findIndex((r) => r.id === routineId);
  if (idx === -1) return "#8B8D98";
  return ROUTINE_COLORS[idx % ROUTINE_COLORS.length];
}

/* ===================== Rotation logic ===================== */

async function markCurrentRoutineComplete() {
  const currentId = state.rotation.currentRoutineId;
  if (!currentId || state.routines.length === 0) return;

  const today = todayKey();
  const previousLogEntryForToday = state.logs[today] !== undefined ? state.logs[today] : null;

  // Save undo snapshot.
  state.rotation.lastAction = {
    previousRoutineId: currentId,
    previousLogEntryForToday,
    timestamp: Date.now(),
  };

  // Upsert today's log entry.
  state.logs[today] = currentId;
  await dbPut("logs", { date: today, routineId: currentId });

  // Advance to next routine in rotation order.
  const idx = state.routines.findIndex((r) => r.id === currentId);
  const nextIdx = (idx + 1) % state.routines.length;
  state.rotation.currentRoutineId = state.routines[nextIdx].id;

  await dbPut("rotationState", state.rotation);
  renderHome();
}

async function undoLastCompletion() {
  const action = state.rotation.lastAction;
  if (!action) return;
  // Only allow undo if the action happened today.
  if (dateToKey(new Date(action.timestamp)) !== todayKey()) {
    state.rotation.lastAction = null;
    await dbPut("rotationState", state.rotation);
    renderHome();
    return;
  }

  const today = todayKey();
  if (action.previousLogEntryForToday === null) {
    delete state.logs[today];
    await dbDelete("logs", today);
  } else {
    state.logs[today] = action.previousLogEntryForToday;
    await dbPut("logs", { date: today, routineId: action.previousLogEntryForToday });
  }

  state.rotation.currentRoutineId = action.previousRoutineId;
  state.rotation.lastAction = null;
  await dbPut("rotationState", state.rotation);
  renderHome();
}

/* ===================== Modal helpers ===================== */

const modalRoot = () => document.getElementById("modal-root");

function closeModal() {
  modalRoot().innerHTML = "";
}

function openModal(innerHtml, onMount) {
  modalRoot().innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal-sheet">${innerHtml}</div></div>`;
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  if (onMount) onMount();
}

/* Build the list of selectable values for a given difficulty type + unit. */
function buildValueOptions(difficultyType, unit) {
  if (difficultyType === "weight") {
    const opts = [];
    const maxDisplay = unit === "kg" ? 140 : 300;
    const step = unit === "kg" ? 2.5 : 5;
    for (let v = 0; v <= maxDisplay; v += step) opts.push(v);
    return opts;
  }
  if (difficultyType === "time") {
    const opts = [];
    for (let v = 5; v <= 300; v += 5) opts.push(v);
    return opts;
  }
  // reps, per_side
  const opts = [];
  for (let v = 1; v <= 50; v += 1) opts.push(v);
  return opts;
}

/* Opens a scroll-picker for a numeric value. `currentStoredValue` is in canonical units
   (lbs for weight). Calls onSelect(newStoredValue) when the user confirms. */
function openValuePicker({ title, difficultyType, currentStoredValue, unit, allowClear, onSelect, onClear }) {
  const options = buildValueOptions(difficultyType, unit);
  let displayCurrent;
  if (currentStoredValue === null || currentStoredValue === undefined) {
    displayCurrent = options[0];
  } else if (difficultyType === "weight") {
    displayCurrent = displayWeight(currentStoredValue, unit);
  } else {
    displayCurrent = currentStoredValue;
  }
  // Snap to nearest available option.
  let closestIdx = 0;
  let closestDiff = Infinity;
  options.forEach((v, i) => {
    const diff = Math.abs(v - displayCurrent);
    if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
  });

  const unitSuffix = difficultyType === "weight" ? ` ${unit}` : (difficultyType === "time" ? "s" : (difficultyType === "per_side" ? "/side" : ""));

  const optionsHtml = options.map((v, i) =>
    `<div class="picker-option${i === closestIdx ? " selected" : ""}" data-value="${v}">${v}${unitSuffix}</div>`
  ).join("");

  const clearBtnHtml = allowClear ? `<button class="btn btn-secondary" id="picker-clear-btn">Clear</button>` : "";

  openModal(`
    <h2 class="modal-title">${title}</h2>
    <div class="picker-wheel" id="picker-wheel">
      <div class="picker-pad"></div>
      ${optionsHtml}
      <div class="picker-pad"></div>
    </div>
    <div class="modal-actions">
      ${clearBtnHtml}
      <button class="btn btn-primary" id="picker-confirm-btn">Set</button>
    </div>
  `, () => {
    const wheel = document.getElementById("picker-wheel");
    // Scroll to selected option.
    requestAnimationFrame(() => {
      const optionEls = wheel.querySelectorAll(".picker-option");
      const target = optionEls[closestIdx];
      if (target) wheel.scrollTop = target.offsetTop - wheel.clientHeight / 2 + target.clientHeight / 2;
    });

    let selectedValue = options[closestIdx];
    wheel.addEventListener("scroll", () => {
      const optionEls = Array.from(wheel.querySelectorAll(".picker-option"));
      const center = wheel.scrollTop + wheel.clientHeight / 2;
      let closest = optionEls[0];
      let minDist = Infinity;
      for (const el of optionEls) {
        const elCenter = el.offsetTop + el.clientHeight / 2;
        const dist = Math.abs(elCenter - center);
        if (dist < minDist) { minDist = dist; closest = el; }
      }
      optionEls.forEach((el) => el.classList.remove("selected"));
      if (closest) {
        closest.classList.add("selected");
        selectedValue = Number(closest.dataset.value);
      }
    }, { passive: true });

    document.getElementById("picker-confirm-btn").addEventListener("click", () => {
      let storedValue = selectedValue;
      if (difficultyType === "weight") storedValue = storageWeightFromDisplay(selectedValue, unit);
      onSelect(storedValue);
      closeModal();
    });

    if (allowClear) {
      document.getElementById("picker-clear-btn").addEventListener("click", () => {
        onClear();
        closeModal();
      });
    }
  });
}

/* Simple integer picker for number of sets (1-5). */
function openSetsPicker(currentValue, onSelect) {
  const options = [1, 2, 3, 4, 5];
  openModal(`
    <h2 class="modal-title">Number of sets</h2>
    <div class="routine-picker-list">
      ${options.map((v) => `<div class="routine-picker-option" data-value="${v}">${v} set${v > 1 ? "s" : ""}${v === currentValue ? " ✓" : ""}</div>`).join("")}
    </div>
  `, () => {
    document.querySelectorAll(".routine-picker-option").forEach((el) => {
      el.addEventListener("click", () => {
        onSelect(Number(el.dataset.value));
        closeModal();
      });
    });
  });
}

/* ===================== Home rendering ===================== */

function renderHome() {
  const routine = getRoutineById(state.rotation.currentRoutineId);
  document.getElementById("home-routine-name").textContent = routine ? routine.name : "No routines yet";

  const listEl = document.getElementById("home-exercise-list");
  if (!routine) {
    listEl.innerHTML = `<p style="color:var(--text-dim);padding:20px 4px;">Add a routine in the Manage tab to get started.</p>`;
    document.getElementById("btn-complete").hidden = true;
  } else {
    document.getElementById("btn-complete").hidden = false;
    const exercises = getExercisesForRoutine(routine.id);
    if (exercises.length === 0) {
      listEl.innerHTML = `<p style="color:var(--text-dim);padding:20px 4px;">No exercises in this routine yet.</p>`;
    } else {
      listEl.innerHTML = exercises.map((ex) => renderExerciseRow(ex)).join("");
    }
  }

  const undoBtn = document.getElementById("btn-undo");
  undoBtn.hidden = !state.rotation.lastAction;

  attachHomeListeners();
}

function renderExerciseRow(ex) {
  const unit = state.settings.unit;
  const benchmarkText = formatDifficultyValue(ex, ex.currentBenchmark, unit);
  const isMet = ex.aspiration !== null && ex.aspiration !== undefined && ex.currentBenchmark >= ex.aspiration;
  const aspirationText = (ex.aspiration === null || ex.aspiration === undefined)
    ? "Set aspiration"
    : `Aim: ${formatDifficultyValue(ex, ex.aspiration, unit)}`;

  return `
    <div class="exercise-row" data-id="${ex.id}">
      <div class="exercise-info">
        <p class="exercise-name">${escapeHtml(ex.name)}</p>
        <p class="exercise-meta">${DIFFICULTY_TYPES.find(d => d.id === ex.difficultyType).label}</p>
      </div>
      <div class="exercise-controls">
        <button class="sets-btn" data-action="sets" data-id="${ex.id}">${ex.numberOfSets}×</button>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <button class="pill-btn${isMet ? " benchmark-met" : ""}" data-action="benchmark" data-id="${ex.id}">${benchmarkText}</button>
          <button class="pill-btn aspiration" data-action="aspiration" data-id="${ex.id}">${aspirationText}</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function attachHomeListeners() {
  document.querySelectorAll('[data-action="benchmark"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const ex = state.exercises.find((e) => e.id === btn.dataset.id);
      openValuePicker({
        title: `${ex.name} — current benchmark`,
        difficultyType: ex.difficultyType,
        currentStoredValue: ex.currentBenchmark,
        unit: state.settings.unit,
        allowClear: false,
        onSelect: async (val) => {
          ex.currentBenchmark = val;
          await dbPut("exercises", ex);
          renderHome();
        },
      });
    });
  });

  document.querySelectorAll('[data-action="aspiration"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const ex = state.exercises.find((e) => e.id === btn.dataset.id);
      openValuePicker({
        title: `${ex.name} — aspiration`,
        difficultyType: ex.difficultyType,
        currentStoredValue: ex.aspiration,
        unit: state.settings.unit,
        allowClear: ex.aspiration !== null && ex.aspiration !== undefined,
        onSelect: async (val) => {
          ex.aspiration = val;
          await dbPut("exercises", ex);
          renderHome();
        },
        onClear: async () => {
          ex.aspiration = null;
          await dbPut("exercises", ex);
          renderHome();
        },
      });
    });
  });

  document.querySelectorAll('[data-action="sets"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const ex = state.exercises.find((e) => e.id === btn.dataset.id);
      openSetsPicker(ex.numberOfSets, async (val) => {
        ex.numberOfSets = val;
        await dbPut("exercises", ex);
        renderHome();
      });
    });
  });
}

document.getElementById("btn-complete").addEventListener("click", () => {
  markCurrentRoutineComplete();
});
document.getElementById("btn-undo").addEventListener("click", () => {
  undoLastCompletion();
});

/* ===================== Tab navigation ===================== */

const VIEWS = ["home", "manage", "calendar", "settings"];

function switchView(viewName) {
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== viewName;
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  if (viewName === "home") renderHome();
  if (viewName === "manage") { state.manageSelectedRoutineId = null; renderManage(); }
  if (viewName === "calendar") renderCalendar();
  if (viewName === "settings") renderSettings();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

/* ===================== Manage rendering ===================== */

function renderManage() {
  const backBtn = document.getElementById("btn-manage-back");
  const title = document.getElementById("manage-title");
  const routinesList = document.getElementById("manage-routines-list");
  const addRoutineBtn = document.getElementById("btn-add-routine");
  const exercisesList = document.getElementById("manage-exercises-list");
  const addExerciseBtn = document.getElementById("btn-add-exercise");

  if (!state.manageSelectedRoutineId) {
    backBtn.hidden = true;
    title.textContent = "Routines";
    routinesList.hidden = false;
    addRoutineBtn.hidden = false;
    exercisesList.hidden = true;
    addExerciseBtn.hidden = true;

    routinesList.innerHTML = state.routines.map((r, i) => `
      <div class="manage-row" data-id="${r.id}">
        <div class="manage-row-main" data-action="open-routine" data-id="${r.id}">
          <span class="manage-row-title">${escapeHtml(r.name)}</span>
          <span class="manage-row-sub">${getExercisesForRoutine(r.id).length} exercises</span>
        </div>
        <div class="reorder-btns">
          <button data-action="routine-up" data-id="${r.id}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button data-action="routine-down" data-id="${r.id}" ${i === state.routines.length - 1 ? "disabled" : ""}>▼</button>
        </div>
        <button class="manage-row-delete" data-action="delete-routine" data-id="${r.id}">✕</button>
      </div>
    `).join("");

    attachRoutineListListeners();
  } else {
    const routine = getRoutineById(state.manageSelectedRoutineId);
    backBtn.hidden = false;
    title.textContent = routine ? routine.name : "Exercises";
    routinesList.hidden = true;
    addRoutineBtn.hidden = true;
    exercisesList.hidden = false;
    addExerciseBtn.hidden = false;

    const exercises = getExercisesForRoutine(state.manageSelectedRoutineId);
    exercisesList.innerHTML = exercises.map((ex, i) => `
      <div class="manage-row" data-id="${ex.id}">
        <div class="manage-row-main" data-action="open-exercise" data-id="${ex.id}">
          <span class="manage-row-title">${escapeHtml(ex.name)}</span>
          <span class="manage-row-sub">${DIFFICULTY_TYPES.find(d => d.id === ex.difficultyType).label} · ${ex.numberOfSets} sets</span>
        </div>
        <div class="reorder-btns">
          <button data-action="ex-up" data-id="${ex.id}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button data-action="ex-down" data-id="${ex.id}" ${i === exercises.length - 1 ? "disabled" : ""}>▼</button>
        </div>
        <button class="manage-row-delete" data-action="delete-exercise" data-id="${ex.id}">✕</button>
      </div>
    `).join("");
    if (exercises.length === 0) {
      exercisesList.innerHTML = `<p style="color:var(--text-dim);padding:16px 4px;">No exercises yet.</p>`;
    }

    attachExerciseListListeners();
  }
}

document.getElementById("btn-manage-back").addEventListener("click", () => {
  state.manageSelectedRoutineId = null;
  renderManage();
});

function attachRoutineListListeners() {
  document.querySelectorAll('[data-action="open-routine"]').forEach((el) => {
    el.addEventListener("click", () => {
      state.manageSelectedRoutineId = el.dataset.id;
      renderManage();
    });
  });
  document.querySelectorAll('[data-action="routine-up"]').forEach((el) => {
    el.addEventListener("click", () => moveRoutine(el.dataset.id, -1));
  });
  document.querySelectorAll('[data-action="routine-down"]').forEach((el) => {
    el.addEventListener("click", () => moveRoutine(el.dataset.id, 1));
  });
  document.querySelectorAll('[data-action="delete-routine"]').forEach((el) => {
    el.addEventListener("click", () => confirmDeleteRoutine(el.dataset.id));
  });
}

function attachExerciseListListeners() {
  document.querySelectorAll('[data-action="open-exercise"]').forEach((el) => {
    el.addEventListener("click", () => openExerciseEditor(el.dataset.id));
  });
  document.querySelectorAll('[data-action="ex-up"]').forEach((el) => {
    el.addEventListener("click", () => moveExercise(el.dataset.id, -1));
  });
  document.querySelectorAll('[data-action="ex-down"]').forEach((el) => {
    el.addEventListener("click", () => moveExercise(el.dataset.id, 1));
  });
  document.querySelectorAll('[data-action="delete-exercise"]').forEach((el) => {
    el.addEventListener("click", () => confirmDeleteExercise(el.dataset.id));
  });
}

async function moveRoutine(id, direction) {
  const sorted = [...state.routines].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((r) => r.id === id);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  const tmp = a.order; a.order = b.order; b.order = tmp;
  await dbPut("routines", a);
  await dbPut("routines", b);
  state.routines = sorted.sort((x, y) => x.order - y.order);
  renderManage();
}

async function moveExercise(id, direction) {
  const sorted = getExercisesForRoutine(state.manageSelectedRoutineId);
  const idx = sorted.findIndex((e) => e.id === id);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  const tmp = a.order; a.order = b.order; b.order = tmp;
  await dbPut("exercises", a);
  await dbPut("exercises", b);
  renderManage();
}

document.getElementById("btn-add-routine").addEventListener("click", () => {
  openRoutineNameEditor(null);
});

function openRoutineNameEditor(routineId) {
  const routine = routineId ? getRoutineById(routineId) : null;
  openModal(`
    <h2 class="modal-title">${routine ? "Rename routine" : "Add routine"}</h2>
    <div class="field-group">
      <label class="field-label">Name</label>
      <input class="field-input" id="routine-name-input" type="text" value="${routine ? escapeHtml(routine.name) : ""}" placeholder="e.g. Push Day">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="routine-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="routine-save-btn">Save</button>
    </div>
  `, () => {
    const input = document.getElementById("routine-name-input");
    input.focus();
    document.getElementById("routine-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("routine-save-btn").addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) return;
      if (routine) {
        routine.name = name;
        await dbPut("routines", routine);
      } else {
        const maxOrder = state.routines.reduce((m, r) => Math.max(m, r.order), -1);
        const newRoutine = { id: uuid(), name, order: maxOrder + 1 };
        await dbPut("routines", newRoutine);
        state.routines.push(newRoutine);
        if (!state.rotation.currentRoutineId) {
          state.rotation.currentRoutineId = newRoutine.id;
          await dbPut("rotationState", state.rotation);
        }
      }
      closeModal();
      renderManage();
    });
  });
}

function confirmDeleteRoutine(routineId) {
  const routine = getRoutineById(routineId);
  const exercises = getExercisesForRoutine(routineId);

  if (exercises.length === 0) {
    openModal(`
      <h2 class="modal-title">Delete "${escapeHtml(routine.name)}"?</h2>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="del-cancel">Cancel</button>
        <button class="btn btn-danger" id="del-confirm">Delete</button>
      </div>
    `, () => {
      document.getElementById("del-cancel").addEventListener("click", closeModal);
      document.getElementById("del-confirm").addEventListener("click", async () => {
        await performDeleteRoutine(routineId);
        closeModal();
      });
    });
  } else {
    openModal(`
      <h2 class="modal-title">This routine has exercises in it</h2>
      <p style="color:var(--text-dim);">"${escapeHtml(routine.name)}" contains ${exercises.length} exercise(s). You need to remove them before deleting the routine, or delete them together with it.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="del-cancel">Cancel</button>
        <button class="btn btn-danger" id="del-proceed">Delete anyway</button>
      </div>
    `, () => {
      document.getElementById("del-cancel").addEventListener("click", closeModal);
      document.getElementById("del-proceed").addEventListener("click", () => {
        openModal(`
          <h2 class="modal-title">Are you sure?</h2>
          <p style="color:var(--text-dim);">This will permanently delete "${escapeHtml(routine.name)}" and all ${exercises.length} exercise(s) in it. This can't be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="del-final-cancel">Cancel</button>
            <button class="btn btn-danger" id="del-final-confirm">Delete routine and exercises</button>
          </div>
        `, () => {
          document.getElementById("del-final-cancel").addEventListener("click", closeModal);
          document.getElementById("del-final-confirm").addEventListener("click", async () => {
            for (const ex of exercises) {
              await dbDelete("exercises", ex.id);
              state.exercises = state.exercises.filter((e) => e.id !== ex.id);
            }
            await performDeleteRoutine(routineId);
            closeModal();
          });
        });
      });
    });
  }
}

async function performDeleteRoutine(routineId) {
  await dbDelete("routines", routineId);
  state.routines = state.routines.filter((r) => r.id !== routineId);
  if (state.rotation.currentRoutineId === routineId) {
    state.rotation.currentRoutineId = state.routines.length > 0 ? state.routines[0].id : null;
    await dbPut("rotationState", state.rotation);
  }
  renderManage();
}

function confirmDeleteExercise(exId) {
  const ex = state.exercises.find((e) => e.id === exId);
  openModal(`
    <h2 class="modal-title">Delete "${escapeHtml(ex.name)}"?</h2>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="del-ex-cancel">Cancel</button>
      <button class="btn btn-danger" id="del-ex-confirm">Delete</button>
    </div>
  `, () => {
    document.getElementById("del-ex-cancel").addEventListener("click", closeModal);
    document.getElementById("del-ex-confirm").addEventListener("click", async () => {
      await dbDelete("exercises", exId);
      state.exercises = state.exercises.filter((e) => e.id !== exId);
      closeModal();
      renderManage();
    });
  });
}

document.getElementById("btn-add-exercise").addEventListener("click", () => {
  openExerciseEditor(null);
});

function openExerciseEditor(exId) {
  const ex = exId ? state.exercises.find((e) => e.id === exId) : null;
  const routineOptions = state.routines.map((r) =>
    `<option value="${r.id}" ${(ex ? ex.routineId : state.manageSelectedRoutineId) === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`
  ).join("");
  const typeOptions = DIFFICULTY_TYPES.map((t) =>
    `<option value="${t.id}" ${ex && ex.difficultyType === t.id ? "selected" : ""}>${t.label}</option>`
  ).join("");

  openModal(`
    <h2 class="modal-title">${ex ? "Edit exercise" : "Add exercise"}</h2>
    <div class="field-group">
      <label class="field-label">Name</label>
      <input class="field-input" id="ex-name-input" type="text" value="${ex ? escapeHtml(ex.name) : ""}" placeholder="e.g. Push-ups">
    </div>
    <div class="field-group">
      <label class="field-label">Routine</label>
      <select class="field-select" id="ex-routine-select">${routineOptions}</select>
    </div>
    <div class="field-group">
      <label class="field-label">Difficulty type</label>
      <select class="field-select" id="ex-type-select">${typeOptions}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="ex-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="ex-save-btn">Save</button>
    </div>
  `, () => {
    document.getElementById("ex-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("ex-save-btn").addEventListener("click", async () => {
      const name = document.getElementById("ex-name-input").value.trim();
      if (!name) return;
      const routineId = document.getElementById("ex-routine-select").value;
      const difficultyType = document.getElementById("ex-type-select").value;

      if (ex) {
        const typeChanged = ex.difficultyType !== difficultyType;
        ex.name = name;
        ex.routineId = routineId;
        ex.difficultyType = difficultyType;
        if (typeChanged) {
          ex.currentBenchmark = LOW_DEFAULTS[difficultyType];
          ex.aspiration = null;
        }
        await dbPut("exercises", ex);
      } else {
        const siblings = getExercisesForRoutine(routineId);
        const maxOrder = siblings.reduce((m, e) => Math.max(m, e.order), -1);
        const newEx = {
          id: uuid(),
          name,
          routineId,
          difficultyType,
          currentBenchmark: LOW_DEFAULTS[difficultyType],
          aspiration: null,
          numberOfSets: 3,
          order: maxOrder + 1,
        };
        await dbPut("exercises", newEx);
        state.exercises.push(newEx);
      }
      closeModal();
      renderManage();
    });
  });
}

/* ===================== Calendar rendering ===================== */

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function renderCalendar() {
  const cursor = state.calendarCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("calendar-month-label").textContent = monthLabel;

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cellsHtml = DOW_LABELS.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  for (let i = 0; i < startOffset; i++) {
    cellsHtml += `<div class="cal-day empty"></div>`;
  }

  const todayStr = todayKey();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const key = dateToKey(dateObj);
    const routineId = state.logs[key];
    const isToday = key === todayStr;
    const styles = [];
    if (routineId) {
      styles.push(`background:${routineColor(routineId)}`, "color:#14151A", "font-weight:600");
    }
    if (isToday) {
      styles.push("box-shadow:inset 0 0 0 2px var(--accent)");
    }
    const editableClass = state.calendarEditMode ? " editable" : "";
    const action = state.calendarEditMode ? ` data-action="edit-day"` : "";
    cellsHtml += `<div class="cal-day${editableClass}" data-date="${key}" style="${styles.join(";")}"${action}>${day}</div>`;
  }

  document.getElementById("calendar-grid").innerHTML = cellsHtml;

  document.getElementById("calendar-legend").innerHTML = state.routines.map((r) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${routineColor(r.id)}"></span>
      <span>${escapeHtml(r.name)}</span>
    </div>
  `).join("");

  if (state.calendarEditMode) {
    document.querySelectorAll('[data-action="edit-day"]').forEach((el) => {
      el.addEventListener("click", () => openDayEditor(el.dataset.date));
    });
  }

  document.getElementById("btn-cal-edit").hidden = state.calendarEditMode;
  document.getElementById("btn-cal-done").hidden = !state.calendarEditMode;
}

function openDayEditor(dateKey) {
  const routineOptionsHtml = state.routines.map((r) => `
    <div class="routine-picker-option" data-routine="${r.id}">
      <span class="legend-dot" style="background:${routineColor(r.id)}"></span>
      <span>${escapeHtml(r.name)}</span>
    </div>
  `).join("");

  openModal(`
    <h2 class="modal-title">${dateKey}</h2>
    <div class="routine-picker-list">
      ${routineOptionsHtml}
      <div class="routine-picker-option" data-routine="__clear__">
        <span>Clear this date</span>
      </div>
    </div>
  `, () => {
    document.querySelectorAll(".routine-picker-option").forEach((el) => {
      el.addEventListener("click", async () => {
        const val = el.dataset.routine;
        if (val === "__clear__") {
          delete state.logs[dateKey];
          await dbDelete("logs", dateKey);
        } else {
          state.logs[dateKey] = val;
          await dbPut("logs", { date: dateKey, routineId: val });
        }
        closeModal();
        renderCalendar();
      });
    });
  });
}

document.getElementById("btn-cal-prev").addEventListener("click", () => {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("btn-cal-next").addEventListener("click", () => {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});
document.getElementById("btn-cal-edit").addEventListener("click", () => {
  state.calendarEditMode = true;
  renderCalendar();
});
document.getElementById("btn-cal-done").addEventListener("click", () => {
  state.calendarEditMode = false;
  renderCalendar();
});

/* ===================== Settings rendering ===================== */

function renderSettings() {
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unit === state.settings.unit);
  });
}

document.getElementById("unit-toggle").addEventListener("click", async (e) => {
  const btn = e.target.closest(".unit-btn");
  if (!btn) return;
  state.settings.unit = btn.dataset.unit;
  state.settings.key = "app";
  await dbPut("settings", state.settings);
  renderSettings();
  renderHome();
});

/* ===================== Service worker registration ===================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* ignore registration failures; app still works without offline caching */
    });
  });
}

/* ===================== App init ===================== */

async function init() {
  try {
    await seedIfEmpty();
    await loadAllData();
  } catch (err) {
    console.error("Failed to initialize app data", err);
  }
  renderHome();
}

init();
