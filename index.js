// ===== 2048 Modern: index.js ===== //

const boardSize = 4;
let board = [];
let score = 0;
let highScore = localStorage.getItem("highScore") || 0;
let undoStack = [];
let gameState = {
  breakingMode: false,
  animations: []
};
let undoUsed = 0;
let breakUsed = 0;

const elements = {
  board: document.getElementById("grid"),
  score: document.getElementById("score"),
  highScore: document.getElementById("high-score"),
  adModal: document.getElementById("ad-modal")
};

// Game Initialization
function initGame() {
  board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
  score = 0;
  undoStack = [];
  gameState.breakingMode = false;
  updateScore();
  spawnTile();
  spawnTile();
  renderBoard();
}

document.addEventListener("DOMContentLoaded", initGame);

// Board Rendering with Animations
function renderBoard() {
  elements.board.innerHTML = '';
  
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      
      if (cell && typeof cell === "object") {
        tile.textContent = cell.value;
        tile.dataset.value = cell.value;
        
        if (cell.isNew) {
          tile.classList.add("new");
          setTimeout(() => tile.classList.remove("new"), 200);
        }
        if (cell.merged) {
          tile.classList.add("merged");
          setTimeout(() => tile.classList.remove("merged"), 300);
        }
      } else if (cell !== 0) {
        tile.textContent = cell;
        tile.dataset.value = cell;
      }

      elements.board.appendChild(tile);
    });
  });

  // Convert object cells to plain values after rendering
  board = board.map(row => row.map(cell => (typeof cell === "object" ? cell.value : cell)));
  addTileClickListeners();
}

// Score Management
function updateScore() {
  elements.score.textContent = score;
  elements.highScore.textContent = highScore;
}

function saveHighScore() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("highScore", highScore);
    elements.highScore.textContent = highScore;
  }
}

// Tile Spawning
function spawnTile() {
  const emptyTiles = [];
  board.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val === 0) emptyTiles.push({ r, c });
    });
  });
  
  if (emptyTiles.length === 0) return;
  
  const { r, c } = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
  board[r][c] = { 
    value: Math.random() < 0.9 ? 2 : 4, 
    isNew: true 
  };
}

// Touch Handling
let touchStartX = 0;
let touchStartY = 0;
const minSwipeDistance = 40;

elements.board.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

elements.board.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  
  // Check if swipe distance meets threshold
  if (Math.abs(dx) > minSwipeDistance || Math.abs(dy) > minSwipeDistance) {
    // Horizontal swipe takes precedence
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) moveRight();
      else moveLeft();
    } else {
      if (dy > 0) moveDown();
      else moveUp();
    }
    
    // Trigger game update if moved
    saveStateForUndo();
    spawnTile();
    renderBoard();
    updateScore();
    saveHighScore();
    checkGameOver();
  }
}, { passive: false });

// Movement Handling
document.addEventListener("keydown", handleKeyPress);

function handleKeyPress(e) {
  if (e.key.startsWith("Arrow")) e.preventDefault();
  
  const key = e.key.toLowerCase();
  let moved = false;

  if (key === "arrowleft" || key === "a") moved = moveLeft();
  else if (key === "arrowright" || key === "d") moved = moveRight();
  else if (key === "arrowup" || key === "w") moved = moveUp();
  else if (key === "arrowdown" || key === "s") moved = moveDown();

  if (moved) {
    saveStateForUndo();
    spawnTile();
    renderBoard();
    updateScore();
    saveHighScore();
    checkGameOver();
  }
}

// Movement Logic with Animation Support
function compressAndMerge(row) {
  const newRow = row.filter(val => val !== 0);
  for (let i = 0; i < newRow.length - 1; i++) {
    if (newRow[i] === newRow[i + 1]) {
      newRow[i] = { value: newRow[i] * 2, merged: true };
      score += newRow[i].value;
      newRow[i + 1] = 0;
    }
  }
  return newRow.filter(val => val !== 0).concat(Array(boardSize).fill(0)).slice(0, boardSize);
}

function moveLeft() {
  let moved = false;
  for (let r = 0; r < boardSize; r++) {
    const newRow = compressAndMerge(board[r]);
    if (!arraysEqual(board[r], newRow)) moved = true;
    board[r] = newRow;
  }
  return moved;
}

function moveRight() {
  let moved = false;
  for (let r = 0; r < boardSize; r++) {
    const reversed = [...board[r]].reverse();
    const newRow = compressAndMerge(reversed).reverse();
    if (!arraysEqual(board[r], newRow)) moved = true;
    board[r] = newRow;
  }
  return moved;
}

function moveUp() {
  let moved = false;
  for (let c = 0; c < boardSize; c++) {
    const col = board.map(row => row[c]);
    const newCol = compressAndMerge(col);
    for (let r = 0; r < boardSize; r++) {
      if (board[r][c] !== newCol[r]) moved = true;
      board[r][c] = newCol[r];
    }
  }
  return moved;
}

function moveDown() {
  let moved = false;
  for (let c = 0; c < boardSize; c++) {
    const col = board.map(row => row[c]).reverse();
    const newCol = compressAndMerge(col).reverse();
    for (let r = 0; r < boardSize; r++) {
      if (board[r][c] !== newCol[r]) moved = true;
      board[r][c] = newCol[r];
    }
  }
  return moved;
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ==== Undo Feature ====

function saveStateForUndo() {
  const boardCopy = board.map(row => [...row]);
  undoStack.push({ board: boardCopy, score: score });
  if (undoStack.length > 10) undoStack.shift();
}

function undoMove() {
  if (undoStack.length === 0) return;
  if (undoUsed === 0) doUndo();
  else showAdModal(() => doUndo());
}

function doUndo() {
  const lastState = undoStack.pop();
  board = lastState.board.map(row => [...row]);
  score = lastState.score;
  undoUsed++;
  renderBoard();
  updateScore();
}

// ==== Break Feature ====

function startBreakMode() {
  if (gameState.breakingMode) return;
  if (breakUsed === 0) enableBreaking();
  else showAdModal(() => enableBreaking());
}

function enableBreaking() {
  gameState.breakingMode = true;
  elements.board.classList.add("breaking");
}

function addTileClickListeners() {
  const tiles = elements.board.querySelectorAll(".tile");
  tiles.forEach((tile, index) => {
    tile.addEventListener("click", () => {
      if (gameState.breakingMode) {
        const row = Math.floor(index / boardSize);
        const col = index % boardSize;
        if (board[row][col] !== 0) {
          board[row][col] = 0;
          breakUsed++;
          gameState.breakingMode = false;
          elements.board.classList.remove("breaking");
          renderBoard();
          updateScore();
        }
      }
    });
  });
}

// ==== Ad Modal Logic ====

function showAdModal(callback) {
  const modal = document.getElementById("ad-modal");
  modal.classList.remove("hidden");
  window.closeAdAndUndo = () => {
    modal.classList.add("hidden");
    setTimeout(callback, 500);
  };
}

document.getElementById("close-ad").addEventListener("click", () => {
  document.getElementById("ad-modal").classList.add("hidden");
});

// ==== Game Over Check ====

function checkGameOver() {
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] === 0) return;
      if (c < boardSize - 1 && board[r][c] === board[r][c + 1]) return;
      if (r < boardSize - 1 && board[r][c] === board[r + 1][c]) return;
    }
  }
  alert("Game Over! Final Score: " + score);
}

// ==== UI Buttons Hookup ====

function startNewGame() {
  initGame();
}


document.getElementById("undo-btn")?.addEventListener("click", undoMove);
document.getElementById("break-btn")?.addEventListener("click", startBreakMode);