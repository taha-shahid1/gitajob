import { load } from 'cheerio'
import type { Country, RawJob } from '../types'
import type { ParseContext } from './index'
import { detectCountry, isRemoteNoCountry } from '../utils/location'
import { CUT_OFF } from '../constants'
import { hasGraduationCapEmoji, isTechnicalRole } from '../utils/role'

/**
 * Parses location strings from a table cell's inner HTML.
 *
 * Simple cells return a single-element array.
 * `<details>` cells (multi-location) split the body on `<br>` tags, returning
 * one entry per city after stripping the `<summary>` header.
 */
function extractLocations(cellHtml: string): string[] {
  if (!cellHtml.includes('<details>')) {
    const text = cellHtml.replace(/<[^>]+>/g, '').trim()
    return text ? [text] : []
  }

  const bodyMatch = /<\/summary>([\s\S]*?)<\/details>/i.exec(cellHtml)
  if (!bodyMatch) return []

  return bodyMatch[1]
    .split(/<br\s*\/?>/)
    .map(s => s.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
}

export function parseSimplify(content: string, context: ParseContext): RawJob[] {
  const $ = load(content)
  const jobs: RawJob[] = []
  let prevCompany = ''
  const { asOf } = context

  $('table tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 5) return // <thead> rows have <th>, not <td>

    const companyRaw = tds.eq(0).text().trim()
    if (!companyRaw) return

    const isSubRow = companyRaw === '↳'
    const company = isSubRow ? prevCompany : companyRaw
    if (!isSubRow) prevCompany = companyRaw
    if (!company) return

    const role = tds.eq(1).text().trim()
    if (!role) return
    if (hasGraduationCapEmoji(role)) return
    if (!isTechnicalRole(role)) return

    const ageMatch = /^(\d+)d$/.exec(tds.eq(4).text().trim())
    if (!ageMatch) return

    const datePosted = new Date(asOf.getTime() - parseInt(ageMatch[1]) * 86400000)
    if (datePosted < CUT_OFF) return

    const locations = extractLocations(tds.eq(2).html() ?? '')

    let location: string | null = null
    let country: Country | null = null
    for (const loc of locations) {
      const c = detectCountry(loc)
      if (c) {
        location = loc
        country = c
        break
      }
    }

    // If no country-qualified location found, check for bare remote entries.
    // Defaults to US since this is a US-focused source.
    if (!country) {
      const remoteLoc = locations.find(isRemoteNoCountry)
      if (remoteLoc) {
        location = remoteLoc
        country = 'US'
      }
    }

    if (!country || !location) return

    const url = tds.eq(3).find('a').first().attr('href') ?? null

    jobs.push({ company, role, location, country, url, isActive: true, datePosted })
  })

  return jobs
}
