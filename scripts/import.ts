#!/usr/bin/env tsx
/**
 * Import script: reads data/all_users.json + org YAML → data/baseline.json
 *
 * Run with:  npm run import   (or: make import)
 * Requires:  data/all_users.json  (generate with: make fetch-users, or bring your own)
 *
 * Override source paths via env vars:
 *   ALL_USERS_PATH=/path/to/all_users.json npm run import
 *   ORG_FLEET_PATH=/path/to/org/yaml/fleet npm run import
 *
 * See docs/import-schema.md for the all_users.json schema.
 * No PII is committed — data/ is gitignored.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { glob } from 'glob'
import type { PersonRecord, TeamRecord, BaselineData } from '../src/types/person.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(PROJECT_ROOT, 'data')

// Config — paths to source data
const ALL_USERS_PATH = process.env.ALL_USERS_PATH ?? path.join(DATA_DIR, 'all_users.json')
const ORG_FLEET_PATH = process.env.ORG_FLEET_PATH ?? null

// ── Types for raw source user data ────────────────────────────────────────────
// See docs/import-schema.md for the full schema.

interface SourceUser {
  uid: string
  cn: string
  displayName?: string
  preferredLastName?: string
  jobTitle?: string
  jobRole?: string
  geo?: string
  co?: string
  l?: string
  location?: string
  hireDate?: string
  workerId?: string
  costCenter?: string
  costCenterDesc?: string
  manager?: string
  directReports?: number
  totalReports?: number
}

// ── Types for YAML structures ─────────────────────────────────────────────

interface YamlRoleDef {
  people?: { ids?: string[] }
  types?: string[]
}

interface YamlGroup {
  parent?: string
  type?: { name?: string }
  roles?: YamlRoleDef[]
  people?: {
    select?: Array<{ include?: Array<{ args?: { group?: string }; func?: string }> }>
    ids?: string[]
  }
}

interface YamlFile {
  name?: string
  tab_name?: string
  description?: string
  group?: YamlGroup
}

// ── Step 1: Load user data ────────────────────────────────────────────────────

if (!fs.existsSync(ALL_USERS_PATH)) {
  console.error(`ERROR: all_users.json not found at ${ALL_USERS_PATH}`)
  console.error('Run "make fetch-users" to generate it, or set ALL_USERS_PATH to your data file.')
  console.error('See docs/import-schema.md for the expected format.')
  process.exit(1)
}

console.log(`Loading user data from ${ALL_USERS_PATH}...`)
const allUsers: SourceUser[] = JSON.parse(fs.readFileSync(ALL_USERS_PATH, 'utf-8'))
console.log(`  Loaded ${allUsers.length} users`)

const byUid = new Map(allUsers.map((u) => [u.uid, u]))

// ── Step 2: BFS to collect the full org ───────────────────────────────────

// Build parent → children map
const childrenMap = new Map<string, string[]>()
for (const u of allUsers) {
  if (u.manager && u.manager !== u.uid) {
    if (!childrenMap.has(u.manager)) childrenMap.set(u.manager, [])
    childrenMap.get(u.manager)!.push(u.uid)
  }
}

// Auto-detect org root: the person with no manager or a self-referencing one
const rootUser = allUsers.find((u) => !u.manager || u.manager === u.uid)
if (!rootUser)
  throw new Error('Could not detect org root — no user with missing or self-referencing manager')
const rootUid = rootUser.uid
console.log(`Building org from detected root: ${rootUser.cn} (${rootUid})`)

const orgUids = new Set<string>()
const queue = [rootUid]
while (queue.length > 0) {
  const uid = queue.shift()!
  if (orgUids.has(uid)) continue
  orgUids.add(uid)
  for (const child of childrenMap.get(uid) ?? []) queue.push(child)
}

console.log(`  Org size: ${orgUids.size} people`)

// ── Step 3: Parse org YAML hierarchy ──────────────────────────────────────

const teams: Record<string, TeamRecord> = {}

if (ORG_FLEET_PATH) {
  console.log(`Parsing org YAML from ${ORG_FLEET_PATH}...`)

  function yamlIdFromPath(filePath: string): string {
    return path.basename(filePath, '.yaml')
  }

  function resolveParentId(parentRef: string | undefined): string | null {
    if (!parentRef) return null
    const base = path.basename(parentRef, '.yaml')
    return base === 'org' ? yamlIdFromPath(ORG_FLEET_PATH!) : base
  }

  function parseYamlFile(filePath: string, type: 'org' | 'team_group' | 'team'): TeamRecord | null {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const doc = yaml.load(raw) as YamlFile
    if (!doc) return null

    const id = type === 'org' ? yamlIdFromPath(ORG_FLEET_PATH!) : yamlIdFromPath(filePath)
    const parentId = resolveParentId(doc.group?.parent)

    let managerUid: string | null = null
    for (const roleDef of doc.group?.roles ?? []) {
      if (roleDef.types?.includes('manager') && roleDef.people?.ids?.length) {
        managerUid = roleDef.people.ids[0]
        break
      }
    }

    return {
      id,
      name: doc.name ?? id,
      tabName: doc.tab_name ?? '',
      type,
      parentTeamId: parentId,
      managerUid,
      description: doc.description ?? '',
    }
  }

  // Parse org.yaml (root)
  const orgYamlPath = path.join(ORG_FLEET_PATH, 'org.yaml')
  const rootOrg = parseYamlFile(orgYamlPath, 'org')
  if (rootOrg) teams[rootOrg.id] = rootOrg

  // Parse team_groups
  const teamGroupFiles = await glob(path.join(ORG_FLEET_PATH, 'team_groups/*.yaml'))
  for (const f of teamGroupFiles) {
    const record = parseYamlFile(f, 'team_group')
    if (record) teams[record.id] = record
  }

  // Parse teams
  const teamFiles = await glob(path.join(ORG_FLEET_PATH, 'teams/*.yaml'))
  for (const f of teamFiles) {
    const record = parseYamlFile(f, 'team')
    if (record) teams[record.id] = record
  }

  // Also parse yaml role assignments per uid for yamlRoles
  const allYamls = [
    orgYamlPath,
    ...(await glob(path.join(ORG_FLEET_PATH, 'team_groups/*.yaml'))),
    ...(await glob(path.join(ORG_FLEET_PATH, 'teams/*.yaml'))),
  ]
  const uidToYamlRoles = new Map<string, string[]>()
  for (const f of allYamls) {
    const raw = fs.readFileSync(f, 'utf-8')
    const doc = yaml.load(raw) as YamlFile
    if (!doc?.group?.roles) continue
    for (const roleDef of doc.group.roles) {
      const types = roleDef.types ?? []
      for (const uid of roleDef.people?.ids ?? []) {
        if (!uidToYamlRoles.has(uid)) uidToYamlRoles.set(uid, [])
        uidToYamlRoles.get(uid)!.push(...types)
      }
    }
  }

  console.log(`  Parsed ${Object.keys(teams).length} team/group/org entries`)

  // ── Step 4: Build uid → team assignment ──────────────────────────────────

  const managerToTeam = new Map<string, string>()
  for (const team of Object.values(teams)) {
    if (team.managerUid) {
      managerToTeam.set(team.managerUid, team.id)
    }
  }

  // ── Step 5: Build PersonRecord map ────────────────────────────────────────

  const people: Record<string, PersonRecord> = {}

  for (const uid of orgUids) {
    const u = byUid.get(uid)
    if (!u) continue

    let teamId: string | null = managerToTeam.get(uid) ?? null
    if (!teamId && u.manager) {
      let cur: string | undefined = u.manager
      const seen = new Set<string>()
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        if (managerToTeam.has(cur)) {
          teamId = managerToTeam.get(cur)!
          break
        }
        cur = byUid.get(cur)?.manager
      }
    }

    people[uid] = {
      uid,
      cn: u.cn,
      displayName: u.displayName ?? u.cn,
      preferredLastName: u.preferredLastName ?? '',
      jobTitle: u.jobTitle ?? '',
      jobRole: u.jobRole ?? '',
      geo: u.geo ?? '',
      co: u.co ?? '',
      l: u.l ?? '',
      location: u.location ?? '',
      hireDate: u.hireDate ?? '',
      workerId: u.workerId ?? '',
      costCenter: u.costCenter ?? '',
      costCenterDesc: u.costCenterDesc ?? '',
      managerUid: u.manager && u.manager !== u.uid && orgUids.has(u.manager) ? u.manager : null,
      directReports: u.directReports ?? 0,
      totalReports: u.totalReports ?? 0,
      teamId,
      yamlRoles: uidToYamlRoles.get(uid) ?? [],
      tags: [],
    }
  }

  console.log(`  Built ${Object.keys(people).length} PersonRecord entries`)

  writeBaseline(people)
} else {
  console.log('No ORG_FLEET_PATH set — skipping YAML team parsing')

  // ── Step 5 (no YAML): Build PersonRecord map ──────────────────────────────

  const people: Record<string, PersonRecord> = {}

  for (const uid of orgUids) {
    const u = byUid.get(uid)
    if (!u) continue

    people[uid] = {
      uid,
      cn: u.cn,
      displayName: u.displayName ?? u.cn,
      preferredLastName: u.preferredLastName ?? '',
      jobTitle: u.jobTitle ?? '',
      jobRole: u.jobRole ?? '',
      geo: u.geo ?? '',
      co: u.co ?? '',
      l: u.l ?? '',
      location: u.location ?? '',
      hireDate: u.hireDate ?? '',
      workerId: u.workerId ?? '',
      costCenter: u.costCenter ?? '',
      costCenterDesc: u.costCenterDesc ?? '',
      managerUid: u.manager && u.manager !== u.uid && orgUids.has(u.manager) ? u.manager : null,
      directReports: u.directReports ?? 0,
      totalReports: u.totalReports ?? 0,
      teamId: null,
      yamlRoles: [],
      tags: [],
    }
  }

  console.log(`  Built ${Object.keys(people).length} PersonRecord entries`)

  writeBaseline(people)
}

// ── Step 6: Write baseline.json ────────────────────────────────────────────

function writeBaseline(people: Record<string, PersonRecord>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  const baseline: BaselineData = {
    importedAt: new Date().toISOString(),
    rootUid: rootUid,
    people,
    teams,
  }

  const outputPath = path.join(DATA_DIR, 'baseline.json')
  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2))
  console.log(`\nWrote ${outputPath}`)
  console.log(`  People: ${Object.keys(people).length}`)
  console.log(`  Teams:  ${Object.keys(teams).length}`)
  console.log(
    `  Managers in org: ${Object.values(people).filter((p) => p.directReports > 0).length}`,
  )
  console.log(`  Done.`)
}
