import 'dotenv/config'
import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { fetchFileContent, fetchLatestSha } from './github'
import { createJob, createNotionClient, loadAllPages, markRemoved } from './notion'
import { PARSERS } from './parsers'
import type { RawJob } from './types'
import { hashJob } from './utils/hash'

type LastRunState = Record<string, string>

const LAST_RUN_PATH = resolve(process.cwd(), 'last_run.json')

interface SourceStats {
  source: string
  changed: boolean
  parsedActiveJobs: number
  created: number
  removed: number
}

interface DbSyncState {
  dbId: string
  existingById: Map<string, { pageId: string; source: string; status: string }>
  existingBySource: Map<string, Array<{ pageId: string; jobId: string; status: string }>>
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function getTargetDbIds(): string[] {
  const primary = requireEnv('NOTION_DB_ID')
  const secondary = process.env.NOTION_PUBLIC_DB_ID?.trim()
  return secondary ? [primary, secondary] : [primary]
}

function getWriteDelayMs(): number {
  const raw = process.env.NOTION_WRITE_DELAY_MS
  if (!raw) return 120
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return 120
  return parsed
}

async function readLastRunState(): Promise<LastRunState> {
  try {
    const raw = await readFile(LAST_RUN_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('last_run.json must contain a JSON object')
    }
    return parsed as LastRunState
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return {}
    throw error
  }
}

async function writeLastRunState(state: LastRunState): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(LAST_RUN_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
}

function buildActiveJobMap(jobs: RawJob[]): Map<string, RawJob> {
  const byId = new Map<string, RawJob>()
  for (const job of jobs) {
    if (!job.isActive) continue
    const id = hashJob(job)
    if (!byId.has(id)) byId.set(id, job)
  }
  return byId
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const targetDbIds = getTargetDbIds()
  const writeDelayMs = getWriteDelayMs()
  const dryRun = process.env.DRY_RUN === '1'
  const asOf = new Date()

  const notion = createNotionClient()
  const dbStates: DbSyncState[] = []
  for (const dbId of targetDbIds) {
    const existingPages = await loadAllPages(notion, dbId)
    const existingById = new Map(
      existingPages.map(page => [
        page.jobId,
        { pageId: page.pageId, source: page.source, status: page.status },
      ]),
    )
    const existingBySource = new Map<string, Array<{ pageId: string; jobId: string; status: string }>>()
    for (const page of existingPages) {
      const pages = existingBySource.get(page.source) ?? []
      pages.push({ pageId: page.pageId, jobId: page.jobId, status: page.status })
      existingBySource.set(page.source, pages)
    }
    dbStates.push({ dbId, existingById, existingBySource })
  }

  const state = await readLastRunState()
  const stats: SourceStats[] = []

  for (const config of PARSERS) {
    const latestSha = await fetchLatestSha(config.source, config.branch)
    const lastSha = state[config.source]

    if (lastSha === latestSha) {
      stats.push({
        source: config.source,
        changed: false,
        parsedActiveJobs: 0,
        created: 0,
        removed: 0,
      })
      continue
    }

    const parsedJobs: RawJob[] = []
    for (const path of config.filePaths) {
      const content = await fetchFileContent(config.source, config.branch, path)
      parsedJobs.push(...config.parse(content, asOf))
    }

    const activeJobsById = buildActiveJobMap(parsedJobs)
    const activeIds = new Set(activeJobsById.keys())

    let created = 0
    let removed = 0

    for (const db of dbStates) {
      for (const [jobId, job] of activeJobsById.entries()) {
        if (db.existingById.has(jobId)) continue
        created += 1
        if (!dryRun) {
          await createJob(notion, db.dbId, job, config.source)
          await sleep(writeDelayMs)
        }
        db.existingById.set(jobId, {
          pageId: `pending:${jobId}`,
          source: config.source,
          status: 'Active',
        })
      }

      const sourcePages = db.existingBySource.get(config.source) ?? []
      for (const page of sourcePages) {
        if (page.status !== 'Active') continue
        if (activeIds.has(page.jobId)) continue
        removed += 1
        if (!dryRun) {
          await markRemoved(notion, page.pageId)
          await sleep(writeDelayMs)
        }
      }
    }

    state[config.source] = latestSha
    stats.push({
      source: config.source,
      changed: true,
      parsedActiveJobs: activeJobsById.size,
      created,
      removed,
    })
  }

  if (!dryRun) {
    await writeLastRunState(state)
  }

  for (const row of stats) {
    if (!row.changed) {
      console.log(`[skip] ${row.source} (no SHA change)`)
      continue
    }
    console.log(
      `[sync] ${row.source} parsed=${row.parsedActiveJobs} created=${row.created} removed=${row.removed} dbs=${targetDbIds.length}${dryRun ? ' (dry-run)' : ''}`,
    )
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
