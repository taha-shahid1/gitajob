import type { RawJob } from '../types'
import type { ParseContext } from './index'
import { detectCountry } from '../utils/location'
import { CUT_OFF } from '../constants'
import { hasGraduationCapEmoji, isTechnicalRole } from '../utils/role'

/**
 * Splits a markdown table row while handling `\|` escaped pipes in cell content
 * (e.g. "Intelcom \| Dragonfly" should remain a single cell).
 */
function splitRow(raw: string): string[] {
  const ESCAPED_PIPE = '\x00'
  return raw
    .replace(/\\\|/g, ESCAPED_PIPE)
    .slice(1, -1)
    .split('|')
    .map(s => s.trim().replace(/\x00/g, '|'))
}

/**
 * Extracts the apply URL from a markdown badge-link cell:
 *   [![Apply](IMAGE_URL)](APPLY_URL)
 *
 * The outer `(URL)` is always the last parenthesised group in the string.
 */
function extractApplyUrl(cell: string): string | null {
  return /\]\(([^)]+)\)\s*$/.exec(cell)?.[1] ?? null
}

function parseDate(raw: string): Date | null {
  const s = raw.trim()
  // Require a 4-digit year — entries without one are from prior cycles.
  if (!/\d{4}/.test(s)) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function parseCanadianInternships(content: string, _context: ParseContext): RawJob[] {
  const jobs: RawJob[] = []
  let prevCompany = ''

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || /\|--+/.test(trimmed)) continue

    const cells = splitRow(trimmed)
    if (cells.length < 5) continue

    const [companyRaw, role, location, applyCell, dateStr] = cells

    if (companyRaw === 'Company') continue // header row

    const isSubRow = companyRaw === '↳' || companyRaw.startsWith('↳')
    const company = isSubRow ? prevCompany : companyRaw
    if (!isSubRow && companyRaw) prevCompany = companyRaw

    if (!company || !role) continue
    if (hasGraduationCapEmoji(role)) continue
    if (!isTechnicalRole(role)) continue

    const datePosted = parseDate(dateStr)
    if (!datePosted || datePosted < CUT_OFF) continue

    const isActive = !applyCell.includes('Closed') && !applyCell.includes('🔒')
    const url = isActive ? extractApplyUrl(applyCell) : null

    // This repo is Canada-only; fall back to CA if detectCountry can't infer it
    // (e.g. a bare city name not in our lookup table).
    const country = detectCountry(location) ?? 'CA'

    jobs.push({ company, role, location, country, url, isActive, datePosted })
  }

  return jobs
}
