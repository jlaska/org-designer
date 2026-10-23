import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios')

const app = express()
app.use(express.json({ limit: '10mb' }))

// Ensure directories exist
for (const dir of [DATA_DIR, SCENARIOS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Baseline ──────────────────────────────────────────────────────────────

app.get('/api/baseline', (_req, res) => {
  const p = path.join(DATA_DIR, 'baseline.json')
  if (!fs.existsSync(p)) {
    res.status(404).json({ error: 'No baseline data. Run: npm run import' })
    return
  }
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')))
})

// ── Scenarios ─────────────────────────────────────────────────────────────

app.get('/api/scenarios', (_req, res) => {
  const files = fs.existsSync(SCENARIOS_DIR)
    ? fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.json'))
    : []
  const scenarios = files.map((f) => {
    const raw = fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf-8')
    const data = JSON.parse(raw)
    return { name: data.name, createdAt: data.createdAt, updatedAt: data.updatedAt }
  })
  res.json(scenarios)
})

app.get('/api/scenarios/:name', (req, res) => {
  const name = sanitizeName(req.params.name)
  const p = path.join(SCENARIOS_DIR, `${name}.json`)
  if (!fs.existsSync(p)) {
    res.status(404).json({ error: `Scenario "${name}" not found` })
    return
  }
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')))
})

app.put('/api/scenarios/:name', (req, res) => {
  const name = sanitizeName(req.params.name)
  const p = path.join(SCENARIOS_DIR, `${name}.json`)
  const existing = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null
  const now = new Date().toISOString()
  const scenario = {
    ...req.body,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  fs.writeFileSync(p, JSON.stringify(scenario, null, 2))
  res.json({ ok: true, name })
})

app.delete('/api/scenarios/:name', (req, res) => {
  const name = sanitizeName(req.params.name)
  const p = path.join(SCENARIOS_DIR, `${name}.json`)
  if (!fs.existsSync(p)) {
    res.status(404).json({ error: `Scenario "${name}" not found` })
    return
  }
  fs.unlinkSync(p)
  res.json({ ok: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  // Allow alphanumeric, hyphens, underscores, spaces — no path traversal
  return name.replace(/[^a-zA-Z0-9_ -]/g, '-').slice(0, 100)
}

const PORT = 3001
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`)
})
