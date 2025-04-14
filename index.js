// ===== 2048 Modern: index.js ===== //

// Game colors
const tileColors = {
  2: '#A259FF',
  4: '#F72585',
  8: '#FFC300',
  16: '#B9FBC0',
  32: '#00B4D8',
  64: '#D833A6',
  128: '#FF6F00',
  256: '#2ECCB8',
  512: '#00FFF7',
  1024: '#FF1744',
  2048: '#6A0DAD',
  'default': '#FFFFFF' // for >2048
};

// Sound effects system
let audioContext;
let audioInitialized = false;
let audioEnabled = false;

function initAudio() {
  if (!audioInitialized) {
    try {
      // Check for browser support
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn("Web Audio API not supported in this browser");
        return;
      }
      
      audioContext = new AudioContext();
      audioInitialized = true;
      
      // Enable audio after first user interaction
      const enableOnce = () => {
        enableAudio();
        document.removeEventListener('click', enableOnce);
        document.removeEventListener('keydown', enableOnce);
      };
      
      document.addEventListener('click', enableOnce);
      document.addEventListener('keydown', enableOnce);
    } catch (e) {
      console.error("Audio initialization failed:", e);
    }
  }
}

function enableAudio() {
  audioEnabled = true;
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playSound(frequency, duration, type = 'sine') {
  if (!audioEnabled) return;
  
  if (!audioContext) initAudio();
  
  try {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (e) {
    console.error("Error playing sound:", e);
  }
}

const soundEffects = {
  move: () => playSound(220, 0.1),
  merge: () => playSound(440, 0.2),
  gameOver: () => playSound(110, 0.5, 'square'),
  newTile: () => playSound(880, 0.1, 'triangle'),
  breakTile: () => playSound(55, 0.3, 'sawtooth')
};

const boardSize = 4;
let board = [];
let score = 0;
let highScore;
try {
  highScore = parseInt(localStorage.getItem("highScore")) || 0;
} catch (e) {
  console.error("Error accessing localStorage:", e);
  highScore = 0;
}
let undoStack = [];
let gameState = {
  breakingMode: false,
  animations: [],
  movements: [],    // Stores tile movement paths
  isAnimating: false // Prevents moves during animation
};
let undoUsed = 0;
let breakUsed = 0;

// Get DOM elements with null checks
const elements = {
  board: document.getElementById("grid"),
  score: document.getElementById("score"),
  highScore: document.getElementById("high-score"),
  adModal: document.getElementById("ad-modal"),
  closeAd: document.getElementById("close-ad"),
  undoBtn: document.getElementById("undo-btn"),
  breakBtn: document.getElementById("break-btn")
};

// Game State Persistence
function saveGameState() {
  try {
    const state = {
      board: board,
      score: score,
      highScore: highScore,
      undoStack: undoStack,
      undoUsed: undoUsed,
      breakUsed: breakUsed
    };
    localStorage.setItem('2048_gameState', JSON.stringify(state));
  } catch (e) {
    console.error("Error saving game state:", e);
  }
}

function loadGameState() {
  try {
    const saved = localStorage.getItem('2048_gameState');
    if (saved) {
      const state = JSON.parse(saved);
      board = state.board;
      score = state.score;
      highScore = state.highScore;
      undoStack = state.undoStack;
      undoUsed = state.undoUsed;
      breakUsed = state.breakUsed;
      return true;
    }
  } catch (e) {
    console.error("Error loading game state:", e);
  }
  return false;
}

// Game Initialization
function initGame() {
  if (!elements.board) {
    console.error("Game board element not found");
    return;
  }
  
  // Initialize default values
  board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
  score = 0;
  undoStack = [];
  gameState.breakingMode = false;
  undoUsed = 0;
  breakUsed = 0;

  // Try to load saved game - will overwrite defaults if successful
  if (loadGameState()) {
    console.log("Loaded existing game state with:", {
      undoUsed: undoUsed,
      breakUsed: breakUsed
    });
  } else {
    // Start fresh game
    spawnTile();
    spawnTile();
  }
  
  updateScore();
  updateUndoCounter();
  updateBreakCounter();
  renderBoard();
}

document.addEventListener("DOMContentLoaded", initGame);

// Board Rendering with Animations
function renderBoard() {
  if (!elements.board) return;

  // Add board shake animation when game is over
  if (!hasValidMoves()) {
    elements.board.classList.add('shake');
    setTimeout(() => {
      elements.board.classList.remove('shake');
    }, 500);
  }
  
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

      tile.style.setProperty('--row', r);
      tile.style.setProperty('--col', c);
      elements.board.appendChild(tile);
    });
  });

  // Convert object cells to plain values after rendering
  board = board.map(row => row.map(cell => (typeof cell === "object" ? cell.value : cell)));
  addTileClickListeners();
}

// Score Management
function updateScore() {
  if (elements.score) {
    elements.score.textContent = score;
    
    // Add score animation when points are gained
    if (elements.score.dataset.prevScore) {
      const pointsGained = score - parseInt(elements.score.dataset.prevScore);
      if (pointsGained > 0) {
        const pointsElement = document.createElement('div');
        pointsElement.className = 'points-gained';
        pointsElement.textContent = `+${pointsGained}`;
        elements.score.appendChild(pointsElement);
        
        setTimeout(() => {
          pointsElement.remove();
        }, 1000);
      }
    }
    elements.score.dataset.prevScore = score;
  }
  
  if (elements.highScore) {
    elements.highScore.textContent = highScore;
    
    // Flash high score when new record is set
    if (score > highScore) {
      elements.highScore.classList.add('new-highscore');
      setTimeout(() => {
        elements.highScore.classList.remove('new-highscore');
      }, 1000);
    }
  }
}

function updateUndoCounter() {
  const counter = document.getElementById('undo-counter');
  if (counter) {
    counter.textContent = 3 - undoUsed;
  }
}

function updateBreakCounter() {
  const counter = document.getElementById('break-counter');
  if (counter) {
    counter.textContent = 3 - breakUsed;
  }
}

function saveHighScore() {
  if (score > highScore) {
    highScore = score;
    try {
      localStorage.setItem("highScore", highScore);
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
    if (elements.highScore) elements.highScore.textContent = highScore;
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
  soundEffects.newTile();
}

// Movement Path Calculation
function getMovementPaths(row, direction) {
  const paths = [];
  const newRow = [];
  let i = 0;
  
  while (i < row.length) {
    if (row[i] === 0) {
      i++;
      continue;
    }
    
    let j = i + 1;
    while (j < row.length && row[j] === 0) j++;
    
      if (j < row.length && row[i] === row[j]) {
        // Merge - track all intermediate positions
        const steps = [];
        for (let pos = i; pos < j; pos++) {
          steps.push(pos);
        }
        paths.push({
          from: i,
          to: newRow.length,
          steps: steps,
          value: row[i] * 2,
          merge: true
        });
        newRow.push(row[i] * 2);
        soundEffects.merge();
        i = j + 1;
    } else {
      // Move - track all intermediate positions
      const steps = [];
      for (let pos = i; pos < newRow.length; pos++) {
        steps.push(pos);
      }
      if (i !== newRow.length) {
        paths.push({
          from: i,
          to: newRow.length,
          steps: steps,
          value: row[i],
          merge: false
        });
      }
      newRow.push(row[i]);
      i++;
    }
  }
  
  // Fill remaining spaces with 0
  while (newRow.length < row.length) {
    newRow.push(0);
  }
  
  return { newRow, paths };
}

// Animation Handling
function animateMovements(callback) {
  if (!elements.board) {
    callback();
    return;
  }

  const tiles = elements.board.querySelectorAll('.tile');
  const tileSize = 106.25; // Width/height of each tile in pixels
  const gapSize = 12; // Gap between tiles in pixels
  const baseDuration = 100; // Base animation duration in ms
  const perCellDuration = 50; // Additional duration per cell moved

  // Mark all moving tiles first
  gameState.movements.forEach(move => {
    const index = move.fromRow * boardSize + move.fromCol;
    if (tiles[index]) {
      tiles[index].classList.add('moving');
    }
  });

  // Process each movement
  gameState.movements.forEach(move => {
    const fromIndex = move.fromRow * boardSize + move.fromCol;
    const toIndex = move.toRow * boardSize + move.toCol;
    const tile = tiles[fromIndex];
    
    if (tile) {
      // Calculate movement distance
      const cellsMoved = move.isVertical
        ? Math.abs(move.toRow - move.fromRow)
        : Math.abs(move.toCol - move.fromCol);
      
      const distance = cellsMoved * (tileSize + gapSize);
      const duration = baseDuration + (cellsMoved * perCellDuration);

      // Apply movement animation
      tile.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
      setTimeout(() => {
        tile.style.transform = move.isVertical
          ? `translateY(${move.toRow > move.fromRow ? distance : -distance}px)`
          : `translateX(${move.toCol > move.fromCol ? distance : -distance}px)`;
      }, 10); // Small delay to allow CSS to register the transition

      // Handle merge animation
      if (move.merge) {
        setTimeout(() => {
          if (tiles[toIndex]) {
            tiles[toIndex].classList.add('merged');
          }
        }, duration);
      }
    }
  });

  // Reset after animations complete
  const maxDuration = baseDuration + (3 * perCellDuration) + 100; // Extra buffer
  setTimeout(() => {
    tiles.forEach(tile => {
      tile.style.transition = '';
      tile.style.transform = '';
      tile.classList.remove('moving');
    });
    callback();
  }, maxDuration);
}

// Movement Functions
function moveLeft() {
  let moved = false;
  for (let r = 0; r < boardSize; r++) {
    const { newRow, paths } = getMovementPaths(board[r], 'left');
    if (JSON.stringify(board[r]) !== JSON.stringify(newRow)) {
      board[r] = newRow;
      moved = true;
    }
  }
  return moved;
}

function moveRight() {
  let moved = false;
  for (let r = 0; r < boardSize; r++) {
    const reversedRow = [...board[r]].reverse();
    const { newRow, paths } = getMovementPaths(reversedRow, 'right');
    if (JSON.stringify(reversedRow) !== JSON.stringify(newRow)) {
      board[r] = newRow.reverse();
      moved = true;
    }
  }
  return moved;
}

function moveUp() {
  let moved = false;
  for (let c = 0; c < boardSize; c++) {
    const column = board.map(row => row[c]);
    const { newRow, paths } = getMovementPaths(column, 'up');
    if (JSON.stringify(column) !== JSON.stringify(newRow)) {
      newRow.forEach((val, r) => board[r][c] = val);
      moved = true;
    }
  }
  return moved;
}

function moveDown() {
  let moved = false;
  for (let c = 0; c < boardSize; c++) {
    const column = board.map(row => row[c]).reverse();
    const { newRow, paths } = getMovementPaths(column, 'down');
    if (JSON.stringify(column) !== JSON.stringify(newRow)) {
      newRow.reverse().forEach((val, r) => board[r][c] = val);
      moved = true;
    }
  }
  return moved;
}

// Undo Functionality
function undoMove() {
  if (undoStack.length === 0 || gameState.isAnimating) return;
  
  const lastState = undoStack.pop();
  board = lastState.board;
  score = lastState.score;
  undoUsed++;
  updateUndoCounter(); // Update the undo counter display
  
  updateScore();
  renderBoard();
}

// Make functions globally accessible
window.startBreakMode = function() {
  if (breakUsed >= 3 || gameState.isAnimating) return;
  
  gameState.breakingMode = true;
  breakUsed++;
  updateBreakCounter();
  soundEffects.breakTile();
  
  // Visual feedback instead of alert
  const breakIndicator = document.createElement('div');
  breakIndicator.className = 'break-indicator';
  breakIndicator.textContent = 'BREAK MODE: Click a tile to break it';
  document.body.appendChild(breakIndicator);
  setTimeout(() => breakIndicator.remove(), 2000);
}

// Keyboard Controls
document.addEventListener('keydown', (e) => {
  if (gameState.isAnimating) return;
  
  let moved = false;
  switch(e.key) {
    case 'ArrowLeft': moved = moveLeft(); break;
    case 'ArrowRight': moved = moveRight(); break;
    case 'ArrowUp': moved = moveUp(); break;
    case 'ArrowDown': moved = moveDown(); break;
  }
  
    if (moved) {
      soundEffects.move();
      undoStack.push({
        board: JSON.parse(JSON.stringify(board)),
        score: score
      });
      spawnTile();
      renderBoard();
      checkGameOver();
      saveGameState();
    }
});

// Tile Click Handler for Break Mode
function addTileClickListeners() {
  const tiles = document.querySelectorAll('.tile');
  if (!tiles) return;

  // Check if touch events are supported
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  tiles.forEach(tile => {
    // Handle both click and touch events
    const handleBreak = () => {
      if (!gameState.breakingMode) return;
      
      try {
        const index = Array.from(tiles).indexOf(tile);
        const r = Math.floor(index / boardSize);
        const c = index % boardSize;
        
        if (board[r][c] === 0) return; // Don't break empty tiles
        
        console.log(`Breaking tile at (${r}, ${c}) with value: ${tile.dataset.value}`);
        
        // Enhanced break animation
        tile.classList.add('breaking');
        try {
          soundEffects.breakTile();
        } catch (e) {
          console.warn("Couldn't play break sound:", e);
        }
        
        // Create particle effects
        const particles = document.createElement('div');
        particles.className = 'particles';
        tile.appendChild(particles);
        
        // Break the tile immediately but keep break mode active
        board[r][c] = 0;
        renderBoard();
        
        // Visual feedback
        const breakFeedback = document.createElement('div');
        breakFeedback.className = 'break-feedback';
        breakFeedback.textContent = `-${tile.dataset.value}`;
        document.body.appendChild(breakFeedback);
        setTimeout(() => breakFeedback.remove(), 1000);
        
        // Save game state after breaking a tile
        try {
          saveGameState();
        } catch (e) {
          console.warn("Couldn't save game state:", e);
        }
        
        // Only exit break mode if we've used all breaks
        if (breakUsed >= 3) {
          gameState.breakingMode = false;
        }
      } catch (e) {
        console.error("Error breaking tile:", e);
      }
    };

    // Standard click handler
    tile.addEventListener('click', handleBreak);

    // Enhanced touch handler for mobile
    if (isTouchDevice) {
      tile.addEventListener('touchstart', (e) => {
        if (!gameState.breakingMode) return;
        e.preventDefault();
        const index = Array.from(tiles).indexOf(tile);
        const r = Math.floor(index / boardSize);
        const c = index % boardSize;
        console.log(`Touching tile at (${r}, ${c})`);
        handleBreak();
      }, { passive: false });
    }
  });
}

// Game Over Check
function checkGameOver() {
  if (!hasValidMoves()) {
    soundEffects.gameOver();
    alert("Game Over! Final Score: " + score);
    saveHighScore();
    try {
      localStorage.removeItem('2048_gameState');
    } catch (e) {
      console.error("Error clearing game state:", e);
    }
    initGame();
  }
}

function hasValidMoves() {
  // Check for empty spaces
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] === 0) return true;
    }
  }
  
  // Check for possible merges
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (c < boardSize-1 && board[r][c] === board[r][c+1]) return true;
      if (r < boardSize-1 && board[r][c] === board[r+1][c]) return true;
    }
  }
  
  return false;
}

// New Game Function
function startNewGame() {
  if (confirm("Start a new game? This will erase your current progress.")) {
    try {
      localStorage.removeItem('2048_gameState');
    } catch (e) {
      console.error("Error clearing game state:", e);
    }
    initGame();
  }
}

// Ad System Integration
function closeAdAndUndo() {
  document.getElementById('ad-modal').classList.add('hidden');
  undoMove();
}

// Swipe gesture detection
if (elements.board) {
  let touchStartX = 0;
  let touchStartY = 0;
  const minSwipeDistance = 50; // Minimum swipe distance in pixels

  elements.board.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    // Prevent default to avoid pull-to-refresh
    if (e.touches.length === 1) {
      e.preventDefault();
    }
  }, { passive: false });

  elements.board.addEventListener('touchend', (e) => {
    if (gameState.isAnimating) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    let moved = false;

    // Check if swipe distance meets minimum threshold
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipeDistance) {
        e.preventDefault();
        moved = dx > 0 ? moveRight() : moveLeft();
      }
    } else {
      if (Math.abs(dy) > minSwipeDistance) {
        e.preventDefault();
        moved = dy > 0 ? moveDown() : moveUp();
      }
    }

    if (moved) {
      soundEffects.move();
      undoStack.push({
        board: JSON.parse(JSON.stringify(board)),
        score: score
      });
      spawnTile();
      renderBoard();
      checkGameOver();
      saveGameState();
    }
  }, { passive: false });
}

if (elements.closeAd) {
  elements.closeAd.addEventListener("click", () => {
    if (elements.adModal) elements.adModal.classList.add("hidden");
  });
}

if (elements.undoBtn) {
  elements.undoBtn.addEventListener("click", undoMove);
}

if (elements.breakBtn) {
  elements.breakBtn.addEventListener("click", startBreakMode);
}