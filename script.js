const SESSION_KEY = "armarFigurasArgentinaUltimaSesion";
const SVG_NS = "http://www.w3.org/2000/svg";

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
  movements: 0,
  checksBeforeComplete: 0,
  completedAt: null,
  puzzle: null
};

let audioContext = null;
let pointerDrag = null;

function getDifficulty(pieceCount) {
  if (pieceCount <= 4) {
    return {
      name: "Facil",
      hint: "De 1 a 4 piezas para armar."
    };
  }

  if (pieceCount <= 10) {
    return {
      name: "Intermedio",
      hint: "De 5 a 10 piezas para armar."
    };
  }

  return {
    name: "Avanzado",
    hint: "Mas de 10 piezas u objetos para armar."
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
    puzzle: createPuzzle(shapeType, pieceCount)
  };
}

function setSetupHint(message, isError = false) {
  elements.setupHint.textContent = message;
  elements.setupHint.classList.toggle("is-error", isError);
}

function createPuzzle(shapeType, pieceCount) {
  const size = pieceCount > 10 ? 7 : pieceCount > 4 ? 6 : 4;
  const cells = createShapeCells(shapeType, size);
  const pieces = partitionCells(cells, pieceCount, size).map((pieceCells, index) => createPiece(pieceCells, index));

  return {
    shapeType,
    size,
    cells,
    pieces
  };
}

function createShapeCells(shapeType, size) {
  const cells = [];
  const center = (size - 1) / 2;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cellCenterX = col + 0.5;
      const cellCenterY = row + 0.5;

      if (shapeType === "cuadrado") {
        cells.push({ row, col });
        continue;
      }

      if (shapeType === "triangulo") {
        const rowProgress = (row + 0.5) / size;
        const halfWidth = Math.max(0.55, rowProgress * size * 0.52);
        if (Math.abs(cellCenterX - (center + 0.5)) <= halfWidth) {
          cells.push({ row, col });
        }
        continue;
      }

      const diamondRadius = size / 2;
      if (Math.abs(cellCenterX - (center + 0.5)) + Math.abs(cellCenterY - (center + 0.5)) <= diamondRadius) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
}

function partitionCells(cells, pieceCount, size) {
  const safePieceCount = Math.min(pieceCount, cells.length);
  const sortedCells = [...cells].sort((first, second) => first.row - second.row || first.col - second.col);
  const targetSizes = getTargetPieceSizes(sortedCells.length, safePieceCount);
  const pieces = Array.from({ length: safePieceCount }, () => []);
  const assigned = new Set();
  const seeds = chooseSeeds(sortedCells, safePieceCount, size);

  seeds.forEach((seed, index) => {
    pieces[index].push(seed);
    assigned.add(cellKey(seed));
  });

  let changed = true;
  while (assigned.size < sortedCells.length && changed) {
    changed = false;

    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      if (pieces[pieceIndex].length >= targetSizes[pieceIndex]) {
        continue;
      }

      const nextCell = findNeighborCell(pieces[pieceIndex], sortedCells, assigned);
      if (nextCell) {
        pieces[pieceIndex].push(nextCell);
        assigned.add(cellKey(nextCell));
        changed = true;
      }
    }
  }

  sortedCells.forEach((cell) => {
    if (assigned.has(cellKey(cell))) {
      return;
    }

    const nearestIndex = findNearestPieceIndex(cell, pieces);
    pieces[nearestIndex].push(cell);
    assigned.add(cellKey(cell));
  });

  return pieces.map((piece) => piece.sort((first, second) => first.row - second.row || first.col - second.col));
}

function getTargetPieceSizes(cellCount, pieceCount) {
  const baseSize = Math.floor(cellCount / pieceCount);
  let remainder = cellCount % pieceCount;
  return Array.from({ length: pieceCount }, () => {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return size;
  });
}

function chooseSeeds(cells, pieceCount, size) {
  const anchors = [
    { row: 0, col: Math.floor(size / 2) },
    { row: Math.floor(size / 2), col: size - 1 },
    { row: size - 1, col: Math.floor(size / 2) },
    { row: Math.floor(size / 2), col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: size - 2 },
    { row: size - 2, col: 1 },
    { row: size - 2, col: size - 2 },
    { row: Math.floor(size / 2), col: Math.floor(size / 2) },
    { row: 0, col: 0 },
    { row: 0, col: size - 1 },
    { row: size - 1, col: 0 },
    { row: size - 1, col: size - 1 },
    { row: 2, col: Math.floor(size / 2) },
    { row: size - 3, col: Math.floor(size / 2) },
    { row: Math.floor(size / 2), col: 2 }
  ];
  const selected = [];
  const used = new Set();

  anchors.forEach((anchor) => {
    if (selected.length >= pieceCount) {
      return;
    }

    const nearest = findNearestCell(anchor, cells, used);
    if (nearest) {
      selected.push(nearest);
      used.add(cellKey(nearest));
    }
  });

  cells.forEach((cell) => {
    if (selected.length < pieceCount && !used.has(cellKey(cell))) {
      selected.push(cell);
      used.add(cellKey(cell));
    }
  });

  return selected;
}

function findNearestCell(anchor, cells, used) {
  return [...cells]
    .filter((cell) => !used.has(cellKey(cell)))
    .sort((first, second) => {
      const firstDistance = Math.abs(first.row - anchor.row) + Math.abs(first.col - anchor.col);
      const secondDistance = Math.abs(second.row - anchor.row) + Math.abs(second.col - anchor.col);
      return firstDistance - secondDistance || first.row - second.row || first.col - second.col;
    })[0];
}

function findNeighborCell(piece, cells, assigned) {
  const pieceKeys = new Set(piece.map(cellKey));
  return cells.find((cell) => {
    if (assigned.has(cellKey(cell))) {
      return false;
    }

    return getNeighbors(cell).some((neighbor) => pieceKeys.has(cellKey(neighbor)));
  });
}

function getNeighbors(cell) {
  return [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 }
  ];
}

function findNearestPieceIndex(cell, pieces) {
  return pieces
    .map((piece, index) => ({
      index,
      distance: Math.min(...piece.map((pieceCell) => Math.abs(pieceCell.row - cell.row) + Math.abs(pieceCell.col - cell.col)))
    }))
    .sort((first, second) => first.distance - second.distance || first.index - second.index)[0].index;
}

function cellKey(cell) {
  return `${cell.row}-${cell.col}`;
}

function createPiece(cells, index) {
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const maxRow = Math.max(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));
  const maxCol = Math.max(...cells.map((cell) => cell.col));

  return {
    id: `pieza-${index + 1}`,
    label: index + 1,
    cells,
    minRow,
    maxRow,
    minCol,
    maxCol,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1
  };
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
    movements: 0,
    checksBeforeComplete: 0,
    completedAt: null,
    puzzle: settings.puzzle || createPuzzle("rombo", 7)
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
  elements.attemptText.textContent = `${state.movements}`;
  elements.timerText.textContent = formatTime(getRemainingSeconds());
  elements.roundLabel.textContent = `${normalizeShapeName(state.shapeType)} con ${state.pieceCount} piezas`;
  elements.objectiveText.textContent = "Solta cada pieza dentro del lienzo para completar la figura.";
  renderBoard();
}

function renderBoard() {
  elements.tileBank.innerHTML = "";
  elements.shapeBoard.innerHTML = "";
  elements.shapeBoard.dataset.shape = state.shapeType;
  elements.shapeBoard.style.setProperty("--puzzle-size", state.puzzle.size);

  elements.shapeBoard.appendChild(createSilhouetteSvg());

  state.puzzle.pieces.forEach((piece) => {
    const slot = document.createElement("div");
    slot.className = "piece-slot";
    slot.dataset.expectedId = piece.id;
    slot.style.left = `${(piece.minCol / state.puzzle.size) * 100}%`;
    slot.style.top = `${(piece.minRow / state.puzzle.size) * 100}%`;
    slot.style.width = `${(piece.width / state.puzzle.size) * 100}%`;
    slot.style.height = `${(piece.height / state.puzzle.size) * 100}%`;
    elements.shapeBoard.appendChild(slot);
  });

  elements.shapeBoard.addEventListener("dragover", handleDragOver);
  elements.shapeBoard.addEventListener("dragleave", handleDragLeave);
  elements.shapeBoard.addEventListener("drop", handleDrop);
  shuffle(state.puzzle.pieces).forEach((piece) => {
    elements.tileBank.appendChild(createPieceTile(piece));
  });

  elements.tileBank.addEventListener("dragover", handleDragOver);
  elements.tileBank.addEventListener("dragleave", handleDragLeave);
  elements.tileBank.addEventListener("drop", handleDrop);
}

function createSilhouetteSvg() {
  const size = state.puzzle.size;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "silhouette-svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS(SVG_NS, "defs");
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", `gridPattern-${state.shapeType}-${size}`);
  pattern.setAttribute("width", "1");
  pattern.setAttribute("height", "1");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M 1 0 L 0 0 0 1");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#d5dde6");
  path.setAttribute("stroke-width", "0.035");
  pattern.appendChild(path);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute("points", getOutlinePoints(state.shapeType, size));
  polygon.setAttribute("fill", `url(#gridPattern-${state.shapeType}-${size})`);
  polygon.setAttribute("stroke", "#1d1d1f");
  polygon.setAttribute("stroke-width", "0.12");
  polygon.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(polygon);

  return svg;
}

function getOutlinePoints(shapeType, size) {
  if (shapeType === "cuadrado") {
    return `0.08,0.08 ${size - 0.08},0.08 ${size - 0.08},${size - 0.08} 0.08,${size - 0.08}`;
  }

  if (shapeType === "triangulo") {
    return `${size / 2},0.08 ${size - 0.08},${size - 0.08} 0.08,${size - 0.08}`;
  }

  return `${size / 2},0.08 ${size - 0.08},${size / 2} ${size / 2},${size - 0.08} 0.08,${size / 2}`;
}

function createPieceTile(piece) {
  const tile = document.createElement("button");
  tile.className = "puzzle-piece";
  tile.type = "button";
  tile.draggable = false;
  tile.dataset.pieceId = piece.id;
  tile.dataset.homeRow = String(piece.minRow);
  tile.dataset.homeCol = String(piece.minCol);
  tile.id = `${piece.id}-${crypto.randomUUID()}`;
  tile.style.setProperty("--piece-cols", piece.width);
  tile.style.setProperty("--piece-rows", piece.height);
  tile.setAttribute("aria-label", `Pieza ${piece.label}`);
  tile.appendChild(createPieceSvg(piece, "tile"));
  tile.addEventListener("pointerdown", startPointerDrag);
  tile.addEventListener("pointermove", movePointerDrag);
  tile.addEventListener("pointerup", endPointerDrag);
  tile.addEventListener("pointercancel", cancelPointerDrag);
  return tile;
}

function createPieceSvg(piece, mode) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `piece-svg piece-svg-${mode}`);
  svg.setAttribute("viewBox", `0 0 ${piece.width} ${piece.height}`);
  svg.setAttribute("aria-hidden", "true");

  piece.cells.forEach((cell) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(cell.col - piece.minCol));
    rect.setAttribute("y", String(cell.row - piece.minRow));
    rect.setAttribute("width", "1");
    rect.setAttribute("height", "1");
    rect.setAttribute("rx", "0.02");
    rect.setAttribute("class", "piece-cell");
    svg.appendChild(rect);
  });

  const outline = document.createElementNS(SVG_NS, "path");
  outline.setAttribute("d", buildPieceOutline(piece));
  outline.setAttribute("class", "piece-outline");
  svg.appendChild(outline);

  return svg;
}

function buildPieceOutline(piece) {
  const edges = [];
  const cellKeys = new Set(piece.cells.map(cellKey));

  piece.cells.forEach((cell) => {
    const x = cell.col - piece.minCol;
    const y = cell.row - piece.minRow;
    if (!cellKeys.has(`${cell.row - 1}-${cell.col}`)) {
      edges.push(`M ${x} ${y} L ${x + 1} ${y}`);
    }
    if (!cellKeys.has(`${cell.row}-${cell.col + 1}`)) {
      edges.push(`M ${x + 1} ${y} L ${x + 1} ${y + 1}`);
    }
    if (!cellKeys.has(`${cell.row + 1}-${cell.col}`)) {
      edges.push(`M ${x + 1} ${y + 1} L ${x} ${y + 1}`);
    }
    if (!cellKeys.has(`${cell.row}-${cell.col - 1}`)) {
      edges.push(`M ${x} ${y + 1} L ${x} ${y}`);
    }
  });

  return edges.join(" ");
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
    offsetY: event.clientY - rect.top,
    clientX: event.clientX,
    clientY: event.clientY,
    startedOnBoard: tile.classList.contains("is-on-board"),
    startRow: tile.dataset.row || "",
    startCol: tile.dataset.col || ""
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
  pointerDrag.clientX = event.clientX;
  pointerDrag.clientY = event.clientY;
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
  placeTile(drag.tile, target, event.clientX, event.clientY, drag);
  clearHoveredSlots();
  removePointerListeners();
}

function cancelPointerDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
    return;
  }

  resetPointerTile(pointerDrag.tile);
  pointerDrag = null;
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
  return element ? element.closest(".shape-board, .tile-bank") : null;
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
  if (target && target.classList.contains("shape-board")) {
    target.classList.add("is-hovered");
  }
}

function clearHoveredSlots() {
  elements.shapeBoard.classList.remove("is-hovered");
}

function handleDragOver(event) {
  event.preventDefault();
  if (event.currentTarget.classList.contains("shape-board")) {
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
    placeTile(tile, event.currentTarget, event.clientX, event.clientY);
  }
}

function placeTile(tile, target, clientX = null, clientY = null, drag = null) {
  if (!target) {
    return;
  }

  target.classList.remove("is-hovered");

  if (target.classList.contains("shape-board")) {
    const placement = getBoardPlacement(tile, clientX, clientY, drag);
    if (!placement) {
      return;
    }

    moveOverlappingPiecesToBank(tile, placement);
    tile.classList.add("is-placed");
    tile.classList.add("is-on-board");
    tile.dataset.row = String(placement.row);
    tile.dataset.col = String(placement.col);
    tile.style.setProperty("--piece-left", `${(placement.col / state.puzzle.size) * 100}%`);
    tile.style.setProperty("--piece-top", `${(placement.row / state.puzzle.size) * 100}%`);
    elements.shapeBoard.appendChild(tile);
    countMoveIfChanged(tile, drag, "board");
    return;
  }

  tile.classList.remove("is-placed");
  tile.classList.remove("is-on-board");
  tile.style.removeProperty("--piece-left");
  tile.style.removeProperty("--piece-top");
  delete tile.dataset.row;
  delete tile.dataset.col;
  elements.tileBank.appendChild(tile);
  countMoveIfChanged(tile, drag, "bank");
}

function getBoardPlacement(tile, clientX, clientY, drag) {
  const piece = getPieceById(tile.dataset.pieceId);
  if (!piece) {
    return null;
  }

  const boardRect = elements.shapeBoard.getBoundingClientRect();
  const cellSize = boardRect.width / state.puzzle.size;
  const offsetX = drag ? drag.offsetX : tile.getBoundingClientRect().width / 2;
  const offsetY = drag ? drag.offsetY : tile.getBoundingClientRect().height / 2;
  const desiredCol = Math.round((clientX - boardRect.left - offsetX) / cellSize);
  const desiredRow = Math.round((clientY - boardRect.top - offsetY) / cellSize);
  const validOrigins = getValidOrigins(piece);

  return validOrigins
    .map((origin) => ({
      ...origin,
      distance: Math.hypot(origin.col - desiredCol, origin.row - desiredRow)
    }))
    .sort((first, second) => first.distance - second.distance)[0] || null;
}

function getValidOrigins(piece) {
  const shapeCellKeys = new Set(state.puzzle.cells.map(cellKey));
  const origins = [];

  for (let row = 0; row <= state.puzzle.size - piece.height; row += 1) {
    for (let col = 0; col <= state.puzzle.size - piece.width; col += 1) {
      const fits = piece.cells.every((cell) => {
        const relativeRow = cell.row - piece.minRow;
        const relativeCol = cell.col - piece.minCol;
        return shapeCellKeys.has(`${row + relativeRow}-${col + relativeCol}`);
      });

      if (fits) {
        origins.push({ row, col });
      }
    }
  }

  return origins;
}

function moveOverlappingPiecesToBank(activeTile, placement) {
  const activePiece = getPieceById(activeTile.dataset.pieceId);
  const activeCells = getPlacedCellKeys(activePiece, placement.row, placement.col);

  [...elements.shapeBoard.querySelectorAll(".puzzle-piece.is-on-board")].forEach((tile) => {
    if (tile === activeTile) {
      return;
    }

    const piece = getPieceById(tile.dataset.pieceId);
    const occupiedCells = getPlacedCellKeys(piece, Number(tile.dataset.row), Number(tile.dataset.col));
    const hasOverlap = occupiedCells.some((cell) => activeCells.includes(cell));

    if (hasOverlap) {
      tile.classList.remove("is-placed");
      tile.classList.remove("is-on-board");
      tile.style.removeProperty("--piece-left");
      tile.style.removeProperty("--piece-top");
      delete tile.dataset.row;
      delete tile.dataset.col;
      elements.tileBank.appendChild(tile);
    }
  });
}

function getPlacedCellKeys(piece, row, col) {
  return piece.cells.map((cell) => {
    const relativeRow = cell.row - piece.minRow;
    const relativeCol = cell.col - piece.minCol;
    return `${row + relativeRow}-${col + relativeCol}`;
  });
}

function getPieceById(pieceId) {
  return state.puzzle.pieces.find((piece) => piece.id === pieceId);
}

function countMoveIfChanged(tile, drag, destination) {
  const movedToBoard = destination === "board";
  const startWasBoard = drag ? drag.startedOnBoard : tile.classList.contains("is-on-board");
  const rowChanged = !drag || drag.startRow !== (tile.dataset.row || "");
  const colChanged = !drag || drag.startCol !== (tile.dataset.col || "");
  const destinationChanged = startWasBoard !== movedToBoard;

  if (destinationChanged || rowChanged || colChanged) {
    state.movements += 1;
    elements.attemptText.textContent = `${state.movements}`;
  }
}

function clearSlots() {
  [...elements.shapeBoard.querySelectorAll(".puzzle-piece.is-on-board")].forEach((tile) => {
    tile.classList.remove("is-placed");
    tile.classList.remove("is-on-board");
    tile.style.removeProperty("--piece-left");
    tile.style.removeProperty("--piece-top");
    delete tile.dataset.row;
    delete tile.dataset.col;
    elements.tileBank.appendChild(tile);
  });
  showActionFeedback("Figura limpia. Volve a encastrar las piezas.", false, true);
}

function getPlacedPieces() {
  return state.puzzle.pieces.map((piece) => {
    const tile = elements.shapeBoard.querySelector(`.puzzle-piece.is-on-board[data-piece-id="${piece.id}"]`);
    return {
      expectedId: piece.id,
      pieceId: tile ? tile.dataset.pieceId : null,
      row: tile ? Number(tile.dataset.row) : null,
      col: tile ? Number(tile.dataset.col) : null,
      expectedRow: piece.minRow,
      expectedCol: piece.minCol
    };
  });
}

function checkCurrentFigure() {
  if (!state.isRunning) {
    return;
  }

  state.attempts += 1;
  elements.attemptText.textContent = `${state.movements}`;

  const placedPieces = getPlacedPieces();
  const placedCount = placedPieces.filter((piece) => piece.pieceId).length;
  const correctCount = placedPieces.filter((piece) => (
    piece.pieceId === piece.expectedId &&
    piece.row === piece.expectedRow &&
    piece.col === piece.expectedCol
  )).length;

  if (correctCount === state.pieceCount) {
    state.completedAt = performance.now();
    showActionFeedback("Figura completa. Todas las piezas encastran perfecto.", true);
    playSuccessSound();
    window.setTimeout(() => finishActivity("completed"), 650);
    return;
  }

  state.checksBeforeComplete += 1;

  if (placedCount < state.pieceCount) {
    showActionFeedback(`Faltan ${state.pieceCount - placedCount} piezas por encastrar.`, false);
  } else {
    showActionFeedback(`Hay ${correctCount} de ${state.pieceCount} piezas en la posicion correcta.`, false);
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
  const placedPieces = getPlacedPieces();
  const placedCount = placedPieces.filter((piece) => piece.pieceId).length;
  const correctCount = placedPieces.filter((piece) => (
    piece.pieceId === piece.expectedId &&
    piece.row === piece.expectedRow &&
    piece.col === piece.expectedCol
  )).length;
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
    movements: state.movements,
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
    ["Piezas configuradas", `${metrics.pieceCount}`],
    ["Piezas ubicadas", `${metrics.placedCount}`],
    ["Piezas correctas", `${metrics.correctCount}`],
    ["Pendientes", `${metrics.pending}`],
    ["Movimientos", `${metrics.movements}`],
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
  setSetupHint("Cada pieza sera un fragmento real de la figura seleccionada.");
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
