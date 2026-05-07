import type { Country } from '../types'

// Canadian province/territory 2-letter codes. No overlap with US state codes.
const CA_PROVINCE_CODES = new Set([
  'ON', 'BC', 'QC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU',
])

// Checked after state codes to handle "New Brunswick, NJ" (city in New Jersey) correctly.
const CA_PROVINCE_NAMES = [
  'ontario', 'british columbia', 'alberta', 'manitoba', 'saskatchewan',
  'nova scotia', 'new brunswick', 'newfoundland', 'labrador', 'prince edward island',
  'northwest territories', 'yukon', 'nunavut',
  // Quebec has common anglicized and accented spellings
  'québec', 'quebec',
]

// Well-known Canadian cities that appear without province context in job listings.
// Ordered roughly by population so early-exit hits the most common cases first.
const CA_CITIES = [
  'toronto', 'vancouver', 'montréal', 'montreal', 'ottawa', 'calgary', 'edmonton',
  'winnipeg', 'mississauga', 'brampton', 'hamilton', 'burnaby', 'surrey', 'richmond',
  'richmond hill', 'markham', 'oakville', 'waterloo', 'kitchener', 'guelph',
  'longueuil', 'laval', 'gatineau', 'sherbrooke', 'saskatoon', 'regina', 'victoria',
  'kelowna', 'barrie', 'kingston', 'whitby', 'oshawa', 'newmarket', 'boisbriand',
  'dorval', 'iberville', 'midland',
]

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
  'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
  'district of columbia',
]

const US_CITIES = [
  'san francisco', 'new york', 'seattle', 'los angeles', 'chicago', 'boston', 'austin',
  'denver', 'atlanta', 'miami', 'houston', 'dallas', 'philadelphia', 'phoenix',
  'san diego', 'san jose', 'mountain view', 'palo alto', 'menlo park', 'cupertino',
  'sunnyvale', 'santa clara', 'redwood city', 'redwood shores', 'bellevue', 'kirkland',
  'pittsburgh', 'minneapolis', 'portland', 'las vegas', 'raleigh', 'charlotte',
  'nashville', 'indianapolis', 'columbus', 'san antonio', 'salt lake city', 'orlando',
  'baltimore', 'washington', 'arlington', 'mclean', 'bethesda', 'herndon', 'reston',
  'tysons', 'jersey city', 'irvine', 'sacramento', 'scottsdale', 'tempe', 'chandler',
  'fort worth', 'el paso', 'detroit', 'memphis', 'louisville', 'milwaukee',
  'albuquerque', 'omaha', 'colorado springs', 'virginia beach', 'san mateo',
  // Common short forms in internship tables
  'nyc', 'sf', 'sfo', 'bay area', 'silicon valley',
]

/**
 * Matches a 2-letter code (province or state) appearing as a standalone token.
 * Case-sensitive — protects against lowercase ISO country codes like "in" (India).
 *
 * Matches: "Toronto, ON" / "San Francisco, CA" / "US CA San Mateo"
 * Does not match: "TORONTO" (ON is a substring without a delimiter), "Bengaluru, in"
 */
function matchesCode(raw: string, code: string): boolean {
  return new RegExp(`(?:^|[,\\s])${code}(?:[,\\s]|$)`).test(raw)
}

/**
 * Handles title-case abbreviations like "Ca", "Il", "On".
 * Intentionally excludes all-lowercase tokens to avoid false positives such as
 * "in" (preposition) being interpreted as Indiana.
 */
function matchesTitleCaseCode(raw: string, code: string): boolean {
  const title = `${code[0]}${code.slice(1).toLowerCase()}`
  return new RegExp(`(?:^|[,\\s])${title}(?:[,\\s]|$)`).test(raw)
}

/**
 * Returns true for location strings that indicate remote work without specifying
 * a country (e.g. "Remote", "Fully Remote", "Remote (North America)").
 *
 * Only called when detectCountry already returned null, so any country-qualified
 * variant ("Remote, Canada", "Remote, US") is already handled upstream.
 */
export function isRemoteNoCountry(location: string): boolean {
  return /\bremote\b/i.test(location)
}

export function detectCountry(location: string): Country | null {
  const raw = location.trim()
  const lower = raw.toLowerCase()

  // --- Explicit Canadian signals ---
  if (/\bcanada\b/i.test(raw)) return 'CA'
  // "CAN" as a country-code token (e.g. "Vancouver, British Columbia, CAN")
  if (/(?:,\s*|\s+)CAN(?:\s*,|\s*$)/.test(raw)) return 'CA'

  // --- Explicit US signals ---
  if (/\busa\b/i.test(raw) || /\bunited states?\b/i.test(raw)) return 'US'
  // Standalone "US" after a delimiter (e.g. "Remote, US") — case-sensitive
  if (/(?:,\s*|\s+)US(?:\s*,|\s*$)/.test(raw)) return 'US'

  // --- CA province codes (checked before US states — no code overlap) ---
  for (const code of CA_PROVINCE_CODES) {
    if (matchesCode(raw, code) || matchesTitleCaseCode(raw, code)) return 'CA'
  }

  // --- US state codes (checked before province names to handle "New Brunswick, NJ") ---
  for (const code of US_STATE_CODES) {
    if (matchesCode(raw, code) || matchesTitleCaseCode(raw, code)) return 'US'
  }

  // --- CA province full names ---
  for (const name of CA_PROVINCE_NAMES) {
    if (lower.includes(name)) return 'CA'
  }

  // --- US state full names ---
  for (const name of US_STATE_NAMES) {
    if (lower.includes(name)) return 'US'
  }

  // --- Known Canadian cities ---
  for (const city of CA_CITIES) {
    if (lower.includes(city)) return 'CA'
  }

  // --- Known US cities ---
  for (const city of US_CITIES) {
    if (lower.includes(city)) return 'US'
  }

  return null
}
