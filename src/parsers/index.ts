import type { RawJob } from '../types'
import { parseSpeedyApply } from './swe-college-jobs'
import { parseCanadianInternships } from './canadian-internships'
import { parseSimplify } from './simplify'
import { parseCanadaSdeInternPosition } from './canada-sde-intern-position'

export interface ParseContext {
  asOf: Date
  source: string
  filePath: string
  fileCommitDate: Date | null
}

export interface ParserConfig {
  /** GitHub "owner/repo" identifier — used as the `source` field on each job. */
  source: string
  /** Branch to fetch from — not always "main". */
  branch: string
  /** Paths within the repo to fetch and parse (all passed to the same `parse` fn). */
  filePaths: string[]
  parse: (content: string, context: ParseContext) => RawJob[]
}

export const PARSERS: ParserConfig[] = [
  {
    source: 'speedyapply/2027-SWE-College-Jobs',
    branch: 'main',
    // README.md = US internships (double-pipe rows, may have Salary column)
    // INTERN_INTL.md = international internships (single-pipe rows, no Salary column)
    // Both use the same parser; location filtering keeps only CA/US entries.
    filePaths: ['README.md', 'INTERN_INTL.md'],
    parse: parseSpeedyApply,
  },
  {
    source: 'negarprh/Canadian-Tech-Internships-2027',
    branch: 'main',
    filePaths: ['README.md'],
    parse: parseCanadianInternships,
  },
  {
    source: 'SimplifyJobs/Summer2027-Internships',
    branch: 'dev',
    filePaths: ['README.md'],
    parse: parseSimplify,
  },
  {
    source: 'hanzili/canada_sde_intern_position',
    branch: 'main',
    filePaths: ['README.md'],
    parse: parseCanadaSdeInternPosition,
  },
]

export { parseSpeedyApply, parseCanadianInternships, parseSimplify, parseCanadaSdeInternPosition }
