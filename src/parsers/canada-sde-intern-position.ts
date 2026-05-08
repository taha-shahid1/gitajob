import { CUT_OFF } from '../constants'
import type { RawJob } from '../types'
import { detectCountry } from '../utils/location'
import type { ParseContext } from './index'

function splitRow(raw: string): string[] {
  const ESCAPED_PIPE = '\x00'
  return raw
    .replace(/\\\|/g, ESCAPED_PIPE)
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim().replace(/\x00/g, '|'))
}

function stripTitlePrefixes(title: string): string {
  return title.replace(/^[🔥💤🆕]\s*/u, '').trim()
}

function extractApplyUrl(cell: string): string | null {
  const href = /\]\(<([^>]+)>\)/.exec(cell)?.[1] ?? /\]\((https?:\/\/[^)]+)\)/.exec(cell)?.[1] ?? null
  return href ? href.trim() : null
}

function parsePostedDateFromUrl(url: string | null): Date | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const raw = parsed.searchParams.get('postedDate')
    if (!raw) return null
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function normalizeDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function parseCanadaSdeInternPosition(content: string, context: ParseContext): RawJob[] {
  const jobs: RawJob[] = []
  const fallbackDate = context.fileCommitDate ? normalizeDate(context.fileCommitDate) : normalizeDate(context.asOf)

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || /\|--+/.test(trimmed)) continue

    const cells = splitRow(trimmed)
    if (cells.length < 7) continue
    if (cells[0] === 'Title' || cells[1] === 'Company') continue

    const title = stripTitlePrefixes(cells[0].replace(/<!--[\s\S]*?-->/g, '').trim())
    const company = cells[1].trim()
    const location = cells[5].trim()
    if (!title || !company || !location) continue

    const url = extractApplyUrl(cells[6])
    const isActive = Boolean(url) && !/closed|filled|expired|🔒/i.test(cells[6])
    const country = 'CA'
    const datePosted = parsePostedDateFromUrl(url) ?? fallbackDate
    if (datePosted < CUT_OFF) continue

    jobs.push({
      company,
      role: title,
      location,
      country,
      url,
      isActive,
      datePosted,
    })
  }

  return jobs
}
