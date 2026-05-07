import type { Country, RawJob } from '../types'
import { detectCountry, isRemoteNoCountry } from '../utils/location'
import { CUT_OFF } from '../constants'
import { hasGraduationCapEmoji, isTechnicalRole } from '../utils/role'

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

function extractHref(html: string): string | null {
  return /href="([^"]+)"/.exec(html)?.[1] ?? null
}

/**
 * Splits a markdown table row on `|`, handling both:
 *   single-pipe rows:  | A | B | C |   → ['A', 'B', 'C']
 *   double-pipe rows: || A | B | C |   → ['', 'A', 'B', 'C']
 *
 * The leading empty string is intentional — it signals the double-pipe README.md format.
 */
function splitRow(raw: string): string[] {
  return raw.slice(1, -1).split('|').map(s => s.trim())
}

interface ColMap {
  company: number
  role: number
  loc: number
  posting: number
  age: number
}

/**
 * Derives column indices from the cell array.
 *
 * README.md formats (cells[0] === ''):
 *   7 cells → FAANG section with Salary: empty|company|role|loc|salary|posting|age
 *   6 cells → Other/Quant sections:      empty|company|role|loc|posting|age
 *
 * INTERN_INTL.md format (cells[0] !== ''):
 *   5 cells → company|role|loc|posting|age
 */
function resolveColMap(cells: string[]): ColMap | null {
  if (cells[0] === '') {
    if (cells.length === 7) return { company: 1, role: 2, loc: 3, posting: 5, age: 6 }
    if (cells.length === 6) return { company: 1, role: 2, loc: 3, posting: 4, age: 5 }
    return null
  }
  if (cells.length >= 5) return { company: 0, role: 1, loc: 2, posting: 3, age: 4 }
  return null
}

export function parseSpeedyApply(content: string, asOf: Date): RawJob[] {
  const jobs: RawJob[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || trimmed.includes('|---|')) continue

    const cells = splitRow(trimmed)
    const map = resolveColMap(cells)
    if (!map) continue

    const companyCell = cells[map.company]
    // All data rows have the company wrapped in <strong>; header/separator rows do not.
    if (!companyCell.includes('<strong>')) continue

    const ageMatch = /^(\d+)d$/.exec(cells[map.age])
    if (!ageMatch) continue

    const datePosted = new Date(asOf.getTime() - parseInt(ageMatch[1]) * 86400000)
    if (datePosted < CUT_OFF) continue

    const role = stripHtml(cells[map.role])
    if (hasGraduationCapEmoji(role)) continue
    if (!isTechnicalRole(role)) continue

    const location = stripHtml(cells[map.loc])
    // Bare "Remote" (no country qualifier) defaults to US for this US-focused source.
    const country: Country | null = detectCountry(location) ?? (isRemoteNoCountry(location) ? 'US' : null)
    if (!country) continue

    jobs.push({
      company: stripHtml(companyCell),
      role,
      location,
      country,
      url: extractHref(cells[map.posting]),
      isActive: true,
      datePosted,
    })
  }

  return jobs
}
