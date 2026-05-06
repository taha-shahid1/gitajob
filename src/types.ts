export type Country = 'US' | 'CA'

export interface RawJob {
  company: string
  role: string
  location: string
  country: Country
  url: string | null
  isActive: boolean
  datePosted: Date | null
}
