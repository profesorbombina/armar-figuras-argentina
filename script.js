const SESSION_KEY = "armarFigurasArgentinaUltimaSesion";

const elements = {
  setupPanel: document.querySelector("#setupPanel"),
  activityPanel: document.querySelector("#activityPanel"),
  resultsPanel: document.querySelector("#resultsPanel"),
  activityForm: document.querySelector("#activityForm"),
  participantName: document.querySelector("#participantName"),
  shapeType: document.querySelector("#shapeType"),
  pieceCount: document.querySelector("#pieceCount"),
  minutes: document.querySelector("#minutes"),
  seconds: document.querySelector("#seconds"),
  difficultyPreview: document.querySelector("#difficultyPreview"),
  difficultyHint: document.querySelector("#difficultyHint"),
  setupHint: document.querySelector("#setupHint"),
  recordText: document.querySelector("#recordText"),
  nameText: document.querySelector("#nameText"),
  timerText: document.querySelector("#timerText"),
  levelText: document.querySelector("#levelText"),
  shapeText: document.querySelector("#shapeText"),
  attemptText: document.querySelector("#attemptText"),
  roundLabel: document.querySelector("#roundLabel"),
  objectiveText: document.querySelector("#objectiveText"),
  tileBank: document.querySelector("#tileBank"),
  shapeBoard: document.querySelector("#shapeBoard"),
  actionFeedback: document.querySelector("#actionFeedback"),
  clearButton: document.querySelector("#clearButton"),
  finishButton: document.querySelector("#finishButton"),
  checkButton: document.querySelector("#checkButton"),
  summaryText: document.querySelector("#summaryText"),
  metricsGrid: document.querySelector("#metricsGrid"),
  playAgainButton: document.querySelector("#playAgainButton")
};

const state = {
  participantName: "Participante",
  shapeType: "rombo",
  pieceCount: 7,
  level: "Intermedio",
  durationSeconds: 120,
  startedAt: 0,
  timerId: null,
  isRunning: false,
  attempts: 0,
  checksBeforeComplete: 0,
  completedAt: null,
  layout: null
};

let audioContext = null;
let pointerDrag = null;

function getDifficulty(pieceCount) {
  if (pieceCount <= 4) {
    return {
      name: "Facil",
      hint: "De 1 a 4 fichas para armar."
    };
  }

  if (pieceCount <= 10) {
    return {
      name: "Intermedio",
      hint: "De 5 a 10 fichas para armar."
    };
  }

  return {
    name: "Avanzado",
    hint: "Mas de 10 fichas u objetos para armar."
  };
}

function normalizeShapeName(shapeType) {
  const names = {
    rombo: "Rombo",
    cuadrado: "Cuadrado",
    triangulo: "Triangulo"
  };
  return names[shapeType] || "Figura";
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function readSettings(form) {
  const formData = new FormData(form);
  const participantName = String(formData.get("participantName") || "").trim() || "Participante";
  const shapeType = String(formData.get("shapeType") || "rombo");
  const pieceCount = clampInteger(formData.get("pieceCount"), 1, 16);
  const minutes = Number(formData.get("minutes"));
  const seconds = Number(formData.get("seconds"));
  const durationSeconds = minutes * 60 + seconds;

  elements.pieceCount.value = String(pieceCount);

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 30) {
    setSetupHint("Los minutos deben estar entre 0 y 30.", true);
    elements.minutes.focus();
    return null;
  }

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
    setSetupHint("Los segundos deben estar entre 0 y 59.", true);
    elements.seconds.focus();
    return null;
  }

  if (durationSeconds < 1) {
    setSetupHint("Configura un tiempo mayor a 0 segundos.", true);
    elements.seconds.focus();
    return null;
  }

  return {
    participantName,
    shapeType,
    pieceCount,
    durationSeconds,
    level: getDifficulty(pieceCount).name,
    layout: createLayout(shapeType, pieceCount)
  };
}

function setSetupHint(message, isError = false) {
  elements.setupHint.textContent = message;
  elements.setupHint.classList.toggle("is-error", isError);
}

function createLayout(shapeType, pieceCount) {
  const size = pieceCount > 10 ? 5 : pieceCount > 4 ? 4 : 3;
  const allCells = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isCellInsideShape(shapeType, row, col, size)) {
        allCells.push({ row, col });
      }
    }
  }

  const center = (size - 1) / 2;
  const selectedCells = allCells
    .sort((first, second) => {
      const firstDistance = Math.abs(first.row - center) + Math.abs(first.col - center);
      const secondDistance = Math.abs(second.row - center) + Math.abs(second.col - center);
      return firstDistance - secondDistance || first.row - second.row || first.col - second.col;
    })
    .slice(0, pieceCount)
    .sort((first, second) => first.row - second.row || first.col - second.col);

  return {
    cols: size,
    rows: size,
    cells: selectedCells.map((cell, index) => ({
      ...cell,
      id: `pieza-${index + 1}`,
      label: index + 1
    }))
  };
}

function isCellInsideShape(shapeType, row, col, size) {
  if (shapeType === "cuadrado") {
    return true;
  }

  if (shapeType === "triangulo") {
    const center = (size - 1) / 2;
    const widthAtRow = row + 1;
    return Math.abs(col - center) <= widthAtRow / 2;
  }

  const center = (size - 1) / 2;
  const radius = size <= 3 ? 1.5 : size <= 4 ? 2 : 2.45;
  return Math.abs(row - center) + Math.abs(col - center) <= radius;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function showPanel(panelName) {
  elements.setupPanel.classList.toggle("hidden", panelName !== "setup");
  elements.activityPanel.classList.toggle("hidden", panelName !== "activity");
  elements.resultsPanel.classList.toggle("hidden", panelName !== "results");
}

function resetActivity(settings = {}) {
  clearTimer();
  Object.assign(state, {
    participantName: settings.participantName || "Participante",
    shapeType: settings.shapeType || "rombo",
    pieceCount: settings.pieceCount || 7,
    level: settings.level || "Intermedio",
    durationSeconds: settings.durationSeconds || 120,
    startedAt: 0,
    timerId: null,
    isRunning: false,
    attempts: 0,
    checksBeforeComplete: 0,
    completedAt: null,
    layout: settings.layout || createLayout("rombo", 7)
  });
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRemainingSeconds() {
  if (!state.isRunning) {
    return state.durationSeconds;
  }

  return state.durationSeconds - (performance.now() - state.startedAt) / 1000;
}

function renderActivity() {
  elements.nameText.textContent = state.participantName;
  elements.levelText.textContent = state.level;
  elements.shapeText.textContent = normalizeShapeName(state.shapeType);
  elements.attemptText.textContent = `${state.attempts}`;
  elements.timerText.textContent = formatTime(getRemainingSeconds());
  elements.roundLabel.textContent = `${normalizeShapeName(state.shapeType)} con ${state.pieceCount} fichas`;
  elements.objectiveText.textContent = "Ubica cada ficha en el numero correspondiente.";
  renderBoard();
}

function renderBoard() {
  elements.tileBank.innerHTML = "";
  elements.shapeBoard.innerHTML = "";
  elements.shapeBoard.style.setProperty("--board-cols", state.layout.cols);
  elements.shapeBoard.style.setProperty("--board-rows", state.layout.rows);
  elements.shapeBoard.dataset.shape = state.shapeType;

  const activeCellMap = new Map(state.layout.cells.map((cell) => [`${cell.row}-${cell.col}`, cell]));

  for (let row = 0; row < state.layout.rows; row += 1) {
    for (let col = 0; col < state.layout.cols; col += 1) {
      const cell = activeCellMap.get(`${row}-${col}`);
      const slot = document.createElement("div");
      slot.className = cell ? "slot" : "slot is-empty-space";
      slot.style.gridColumn = `${col + 1}`;
      slot.style.gridRow = `${row + 1}`;

      if (cell) {
        slot.dataset.expectedId = cell.id;
        slot.textContent = cell.label;
        slot.addEventListener("dragover", handleDragOver);
        slot.addEventListener("dragleave", handleDragLeave);
        slot.addEventListener("drop", handleDrop);
      }

      elements.shapeBoard.appendChild(slot);
    }
  }

  shuffle(state.layout.cells).forEach((cell) => {
    elements.tileBank.appendChild(createTile(cell));
  });

  elements.tileBank.addEventListener("dragover", handleDragOver);
  elements.tileBank.addEventListener("dragleave", handleDragLeave);
  elements.tileBank.addEventListener("drop", handleDrop);
}

function createTile(cell) {
  const tile = document.createElement("button");
  tile.className = "tile";
  tile.type = "button";
  tile.draggable = false;
  tile.textContent = cell.label;
  tile.id = `${cell.id}-${crypto.randomUUID()}`;
  tile.dataset.pieceId = cell.id;
  tile.setAttribute("aria-label", `Ficha ${cell.label}`);
  tile.addEventListener("pointerdown", startPointerDrag);
  tile.addEventListener("pointermove", movePointerDrag);
  tile.addEventListener("pointerup", endPointerDrag);
  tile.addEventListener("pointercancel", cancelPointerDrag);
  return tile;
}

function startPointerDrag(event) {
  if (!state.isRunning || (event.pointerType === "mouse" && event.button !== 0)) {
    return;
  }

  unlockAudio();
  event.preventDefault();

  if (pointerDrag) {
    resetPointerTile(pointerDrag.tile);
  }

  const tile = event.currentTarget;
  const rect = tile.getBoundingClientRect();
  pointerDrag = {
    tile,
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  tile.setPointerCapture(event.pointerId);
  tile.classList.add("is-pointer-dragging");
  tile.style.width = `${rect.width}px`;
  tile.style.height = `${rect.height}px`;
  moveTileToPointer(event.clientX, event.clientY);
  document.addEventListener("pointermove", movePointerDrag);
  document.addEventListener("pointerup", endPointerDrag);
  document.addEventListener("pointercancel", cancelPointerDrag);
}

function movePointerDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  moveTileToPointer(event.clientX, event.clientY);
  updateHoveredSlot(event.clientX, event.clientY);
}

function endPointerDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const drag = pointerDrag;
  const target = getDropTarget(event.clientX, event.clientY);
  resetPointerTile(drag.tile);
  pointerDrag = null;
  placeTile(drag.tile, target);
  clearHoveredSlots();
  removePointerListeners();
}

function cancelPointerDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
    return;
  }

  resetPointerTile(pointerDrag.tile);
  pointerDrag = null;
  refreshSlotLabels();
  clearHoveredSlots();
  removePointerListeners();
}

function removePointerListeners() {
  document.removeEventListener("pointermove", movePointerDrag);
  document.removeEventListener("pointerup", endPointerDrag);
  document.removeEventListener("pointercancel", cancelPointerDrag);
}

function moveTileToPointer(clientX, clientY) {
  if (!pointerDrag) {
    return;
  }

  pointerDrag.tile.style.left = `${clientX - pointerDrag.offsetX}px`;
  pointerDrag.tile.style.top = `${clientY - pointerDrag.offsetY}px`;
}

function getDropTarget(clientX, clientY) {
  if (!pointerDrag) {
    return null;
  }

  pointerDrag.tile.style.visibility = "hidden";
  const element = document.elementFromPoint(clientX, clientY);
  pointerDrag.tile.style.visibility = "";
  return element ? element.closest(".slot:not(.is-empty-space), .tile-bank") : null;
}

function resetPointerTile(tile) {
  tile.classList.remove("is-pointer-dragging");
  tile.style.removeProperty("width");
  tile.style.removeProperty("height");
  tile.style.removeProperty("left");
  tile.style.removeProperty("top");
}

function updateHoveredSlot(clientX, clientY) {
  clearHoveredSlots();
  const target = getDropTarget(clientX, clientY);
  if (target && target.classList.contains("slot")) {
    target.classList.add("is-hovered");
  }
}

function clearHoveredSlots() {
  document.querySelectorAll(".slot.is-hovered").forEach((slot) => slot.classList.remove("is-hovered"));
}

function handleDragOver(event) {
  event.preventDefault();
  if (event.currentTarget.classList.contains("slot")) {
    event.currentTarget.classList.add("is-hovered");
  }
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("is-hovered");
}

function handleDrop(event) {
  event.preventDefault();
  const tileId = event.dataTransfer.getData("text/plain");
  const tile = document.getElementById(tileId);

  if (tile) {
    placeTile(tile, event.currentTarget);
  }
}

function placeTile(tile, target) {
  if (!target) {
    refreshSlotLabels();
    return;
  }

  target.classList.remove("is-hovered");

  if (target.classList.contains("slot")) {
    const oldTile = target.querySelector(".tile");
    if (oldTile) {
      elements.tileBank.appendChild(oldTile);
    }
    target.textContent = "";
    target.appendChild(tile);
    return;
  }

  elements.tileBank.appendChild(tile);
  refreshSlotLabels();
}

function clearSlots() {
  [...elements.shapeBoard.querySelectorAll(".slot .tile")].forEach((tile) => {
    elements.tileBank.appendChild(tile);
  });
  refreshSlotLabels();
  showActionFeedback("Figura limpia. Volve a ubicar las fichas.", false, true);
}

function refreshSlotLabels() {
  [...elements.shapeBoard.querySelectorAll(".slot:not(.is-empty-space)")].forEach((slot) => {
    if (!slot.querySelector(".tile")) {
      const expectedCell = state.layout.cells.find((cell) => cell.id === slot.dataset.expectedId);
      slot.textContent = expectedCell ? expectedCell.label : "";
    }
  });
}

function getPlacedTiles() {
  return [...elements.shapeBoard.querySelectorAll(".slot:not(.is-empty-space)")].map((slot) => {
    const tile = slot.querySelector(".tile");
    return {
      expectedId: slot.dataset.expectedId,
      pieceId: tile ? tile.dataset.pieceId : null
    };
  });
}

function checkCurrentFigure() {
  if (!state.isRunning) {
    return;
  }

  state.attempts += 1;
  elements.attemptText.textContent = `${state.attempts}`;

  const placedTiles = getPlacedTiles();
  const placedCount = placedTiles.filter((tile) => tile.pieceId).length;
  const correctCount = placedTiles.filter((tile) => tile.pieceId && tile.pieceId === tile.expectedId).length;

  if (correctCount === state.pieceCount) {
    state.completedAt = performance.now();
    showActionFeedback("Figura completa. Muy bien.", true);
    playSuccessSound();
    window.setTimeout(() => finishActivity("completed"), 650);
    return;
  }

  state.checksBeforeComplete += 1;

  if (placedCount < state.pieceCount) {
    showActionFeedback(`Faltan ${state.pieceCount - placedCount} fichas por ubicar.`, false);
  } else {
    showActionFeedback(`Hay ${correctCount} de ${state.pieceCount} fichas en su lugar.`, false);
  }

  playErrorSound();
}

function finishActivity(reason) {
  if (!state.isRunning && reason !== "manual") {
    return;
  }

  state.isRunning = false;
  clearTimer();
  const metrics = calculateMetrics(reason);
  saveSession(metrics);
  renderResults(metrics);
  showPanel("results");
}

function calculateMetrics(reason) {
  const placedTiles = getPlacedTiles();
  const placedCount = placedTiles.filter((tile) => tile.pieceId).length;
  const correctCount = placedTiles.filter((tile) => tile.pieceId && tile.pieceId === tile.expectedId).length;
  const elapsedSeconds = Math.min(
    state.durationSeconds,
    Math.max(0, ((state.completedAt || performance.now()) - state.startedAt) / 1000)
  );

  return {
    participantName: state.participantName,
    shapeName: normalizeShapeName(state.shapeType),
    level: state.level,
    pieceCount: state.pieceCount,
    placedCount,
    correctCount,
    pending: Math.max(0, state.pieceCount - placedCount),
    attempts: state.attempts,
    checksBeforeComplete: state.checksBeforeComplete,
    accuracy: state.pieceCount === 0 ? 0 : (correctCount / state.pieceCount) * 100,
    durationSeconds: state.durationSeconds,
    elapsedSeconds,
    reason
  };
}

function renderResults(metrics) {
  const messages = {
    completed: `Figura completada por ${metrics.participantName}`,
    time: `Tiempo cumplido para ${metrics.participantName}`,
    manual: `Actividad finalizada para ${metrics.participantName}`
  };

  elements.summaryText.textContent = messages[metrics.reason] || messages.manual;

  elements.metricsGrid.innerHTML = [
    ["Participante", metrics.participantName],
    ["Figura", metrics.shapeName],
    ["Nivel", metrics.level],
    ["Fichas configuradas", `${metrics.pieceCount}`],
    ["Fichas ubicadas", `${metrics.placedCount}`],
    ["Fichas correctas", `${metrics.correctCount}`],
    ["Pendientes", `${metrics.pending}`],
    ["Intentos de revision", `${metrics.attempts}`],
    ["Revisiones antes de completar", `${metrics.checksBeforeComplete}`],
    ["Precision final", `${metrics.accuracy.toFixed(1)}%`],
    ["Tiempo configurado", formatTime(metrics.durationSeconds)],
    ["Tiempo usado", formatTime(metrics.elapsedSeconds)]
  ]
    .map(([label, value]) => `
      <div class="metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startActivity(event) {
  event.preventDefault();
  const settings = readSettings(event.currentTarget);

  if (!settings) {
    return;
  }

  unlockAudio();
  resetActivity(settings);
  showPanel("activity");
  state.isRunning = true;
  state.startedAt = performance.now();
  renderActivity();
  showActionFeedback("Arrastra con el dedo o clic izquierdo del mouse.", false, true);
  state.timerId = window.setInterval(updateTimer, 150);
}

function updateTimer() {
  elements.timerText.textContent = formatTime(getRemainingSeconds());

  if (getRemainingSeconds() <= 0) {
    finishActivity("time");
  }
}

function clearTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
  }
  state.timerId = null;
}

function showActionFeedback(message, isCorrect, neutral = false) {
  elements.actionFeedback.textContent = message;
  elements.actionFeedback.className = neutral
    ? "action-feedback"
    : `action-feedback ${isCorrect ? "is-correct" : "is-incorrect"}`;
}

function updateDifficultyPreview() {
  const pieceCount = clampInteger(elements.pieceCount.value, 1, 16);
  const difficulty = getDifficulty(pieceCount);
  elements.difficultyPreview.textContent = difficulty.name;
  elements.difficultyHint.textContent = difficulty.hint;
  setSetupHint("Configura el tiempo, la figura y la cantidad de fichas.");
}

function saveSession(metrics) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    participantName: metrics.participantName,
    shapeName: metrics.shapeName,
    level: metrics.level,
    correctCount: metrics.correctCount,
    pieceCount: metrics.pieceCount,
    date: new Date().toISOString()
  }));
}

function loadSession() {
  try {
    const rawSession = localStorage.getItem(SESSION_KEY);
    return rawSession ? JSON.parse(rawSession) : null;
  } catch {
    return null;
  }
}

function renderRecord() {
  const session = loadSession();
  elements.recordText.textContent = session
    ? `Ultima sesion: ${session.participantName} - ${session.shapeName} - ${session.correctCount}/${session.pieceCount} correctas`
    : "Sin sesiones registradas en este navegador";
}

function returnToSetup() {
  resetActivity();
  renderRecord();
  showPanel("setup");
  elements.participantName.focus();
}

function unlockAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(frequency, startTime, duration, type = "sine", gainValue = 0.08) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playSuccessSound() {
  unlockAudio();
  const now = audioContext.currentTime;
  [520, 660, 820, 1040].forEach((frequency, index) => {
    playTone(frequency, now + index * 0.08, 0.16, "triangle", 0.09);
  });
}

function playErrorSound() {
  unlockAudio();
  const now = audioContext.currentTime;
  playTone(210, now, 0.18, "sawtooth", 0.08);
  playTone(145, now + 0.15, 0.22, "sawtooth", 0.07);
}

function init() {
  renderRecord();
  resetActivity();
  updateDifficultyPreview();
  elements.activityForm.addEventListener("submit", startActivity);
  elements.shapeType.addEventListener("change", updateDifficultyPreview);
  elements.pieceCount.addEventListener("input", updateDifficultyPreview);
  elements.clearButton.addEventListener("click", clearSlots);
  elements.finishButton.addEventListener("click", () => finishActivity("manual"));
  elements.checkButton.addEventListener("click", checkCurrentFigure);
  elements.playAgainButton.addEventListener("click", returnToSetup);
  document.addEventListener("pointerdown", unlockAudio, { once: true });
}

init();
