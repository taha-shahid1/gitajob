import { createHash } from 'crypto'
import type { RawJob } from '../types'

export function hashJob(job: Pick<RawJob, 'company' | 'role' | 'url'>): string {
  const key = [
    job.company.toLowerCase().replace(/\s+/g, ' ').trim(),
    job.role.toLowerCase().replace(/\s+/g, ' ').trim(),
    job.url ?? '',
  ].join('|')
  return createHash('sha256').update(key).digest('hex').slice(0, 20)
}
