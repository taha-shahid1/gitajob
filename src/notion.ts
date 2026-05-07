import { Client, isFullPage } from '@notionhq/client'
import type { RawJob } from './types'
import { hashJob } from './utils/hash'

export interface NotionPage {
  pageId: string
  jobId: string
  source: string
  status: string
}

const RETRYABLE_NOTION_CODES = new Set([
  'notionhq_client_request_timeout',
  'rate_limited',
  'internal_server_error',
  'service_unavailable',
  'conflict_error',
])

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function jitteredBackoffMs(attempt: number): number {
  const base = 400 * 2 ** (attempt - 1)
  const jitter = Math.floor(Math.random() * 200)
  return Math.min(base + jitter, 8_000)
}

function isRetryableNotionError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  return RETRYABLE_NOTION_CODES.has(code)
}

async function withNotionRetry<T>(fn: () => Promise<T>, opName: string): Promise<T> {
  const maxAttempts = 5
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryableNotionError(error) || attempt === maxAttempts) throw error
      const delayMs = jitteredBackoffMs(attempt)
      console.warn(`[notion] ${opName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

export function createNotionClient(): Client {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('NOTION_TOKEN is not set')
  return new Client({ auth: token, timeoutMs: 60_000 })
}

/**
 * Fetches all non-Removed pages from the database in one paginated sweep.
 *
 * Called once at startup so every subsequent dedup check is a Set lookup
 * rather than an API call. Skips pages missing the ID or Source properties
 * (e.g. manually created rows).
 */
export async function loadAllPages(client: Client, dbId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined

  do {
    const res = await withNotionRetry(
      () =>
        client.databases.query({
          database_id: dbId,
          filter: { property: 'Status', select: { does_not_equal: 'Removed' } },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      `databases.query(${dbId})`,
    )

    for (const page of res.results) {
      if (!isFullPage(page)) continue
      const props = page.properties

      const jobId =
        props['ID']?.type === 'rich_text'
          ? (props['ID'].rich_text[0]?.plain_text ?? '')
          : ''
      const source =
        props['Source']?.type === 'rich_text'
          ? (props['Source'].rich_text[0]?.plain_text ?? '')
          : ''
      const status =
        props['Status']?.type === 'select'
          ? (props['Status'].select?.name ?? 'Active')
          : 'Active'

      if (jobId && source) pages.push({ pageId: page.id, jobId, source, status })
    }

    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined
  } while (cursor)

  return pages
}

export async function createJob(
  client: Client,
  dbId: string,
  job: RawJob,
  source: string,
): Promise<void> {
  await withNotionRetry(
    () =>
      client.pages.create({
        parent: { database_id: dbId },
        properties: {
          Company: { title: [{ text: { content: job.company } }] },
          Role: { rich_text: [{ text: { content: job.role } }] },
          Location: { rich_text: [{ text: { content: job.location } }] },
          Country: { select: { name: job.country } },
          URL: { url: job.url ?? null },
          Source: { rich_text: [{ text: { content: source } }] },
          ID: { rich_text: [{ text: { content: hashJob(job) } }] },
          Status: { select: { name: 'Active' } },
          DatePosted: job.datePosted
            ? { date: { start: job.datePosted.toISOString().split('T')[0] } }
            : { date: null },
        },
      }),
    `pages.create(${dbId})`,
  )
}

/**
 * Marks a job as Removed when it disappears from the source listing.
 * Only called for pages whose current Status is 'Active' — jobs the user
 * has already moved to Applied / Interviewing / etc. are left untouched.
 */
export async function markRemoved(client: Client, pageId: string): Promise<void> {
  await withNotionRetry(
    () =>
      client.pages.update({
        page_id: pageId,
        properties: { Status: { select: { name: 'Removed' } } },
      }),
    `pages.update(${pageId})`,
  )
}
