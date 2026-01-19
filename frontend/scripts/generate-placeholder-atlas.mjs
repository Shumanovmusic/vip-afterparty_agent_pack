/**
 * Generate placeholder atlas PNG
 * Creates a 512x512 grid with colored squares for symbols and UI
 */
import { createCanvas } from 'canvas'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Symbol colors matching ReelsView.vue
const SYMBOL_COLORS = [
  '#666666', // sym_0: empty/low
  '#e74c3c', // sym_1: red (high)
  '#3498db', // sym_2: blue
  '#2ecc71', // sym_3: green
  '#f39c12', // sym_4: orange
  '#9b59b6', // sym_5: purple
  '#1abc9c', // sym_6: teal
  '#e91e63', // sym_7: pink (scatter)
  '#ffd700', // sym_8: gold (wild)
  '#00bcd4', // sym_9: cyan
]

// UI element colors
const UI_COLORS = {
  ui_spin: '#4CAF50',
  ui_spin_pressed: '#388E3C',
  ui_turbo: '#2196F3',
  ui_turbo_active: '#FFC107',
  ui_bet_minus: '#F44336',
  ui_bet_plus: '#4CAF50',
}

const CELL_SIZE = 128
const ATLAS_SIZE = 512

function generateAtlas() {
  const canvas = createCanvas(ATLAS_SIZE, ATLAS_SIZE)
  const ctx = canvas.getContext('2d')

  // Fill background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)

  // Draw symbols (10 symbols in first 2.5 rows)
  for (let i = 0; i < 10; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = col * CELL_SIZE
    const y = row * CELL_SIZE

    drawCell(ctx, x, y, SYMBOL_COLORS[i], `${i}`)
  }

  // Draw UI elements
  const uiElements = Object.entries(UI_COLORS)
  for (let i = 0; i < uiElements.length; i++) {
    const [name, color] = uiElements[i]
    const col = (10 + i) % 4
    const row = Math.floor((10 + i) / 4)
    const x = col * CELL_SIZE
    const y = row * CELL_SIZE

    const label = name.replace('ui_', '').substring(0, 4)
    drawCell(ctx, x, y, color, label)
  }

  // Save to file
  const outputPath = path.join(__dirname, '../src/assets/atlas/game.atlas.png')
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, buffer)
  console.log(`Generated: ${outputPath}`)
}

function drawCell(ctx, x, y, color, label) {
  // Fill cell with color
  ctx.fillStyle = color
  ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8)

  // Add rounded corners effect
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8)

  // Draw label
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 32px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
}

generateAtlas()
