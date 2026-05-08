const GH_API = 'https://api.github.com'
const GH_RAW = 'https://raw.githubusercontent.com'

function apiHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN
  return {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'gitajob',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Returns the latest commit SHA on `branch` for the given `owner/repo`.
 * Used to detect whether a source repo has changed since the last run.
 */
export async function fetchLatestSha(repo: string, branch: string): Promise<string> {
  const res = await fetch(
    `${GH_API}/repos/${repo}/commits?per_page=1&sha=${branch}`,
    { headers: apiHeaders() },
  )
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} fetching commits for ${repo}@${branch}`)
  }
  const commits = (await res.json()) as Array<{ sha: string }>
  if (!commits.length) throw new Error(`No commits found for ${repo}@${branch}`)
  return commits[0].sha
}

export async function fetchLatestCommitDateForPath(
  repo: string,
  branch: string,
  path: string,
): Promise<Date | null> {
  const res = await fetch(
    `${GH_API}/repos/${repo}/commits?per_page=1&sha=${branch}&path=${encodeURIComponent(path)}`,
    { headers: apiHeaders() },
  )
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} fetching commit date for ${repo}@${branch}:${path}`)
  }
  const commits = (await res.json()) as Array<{ commit?: { committer?: { date?: string } } }>
  const iso = commits[0]?.commit?.committer?.date
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Fetches the raw text content of a file from a public GitHub repo.
 *
 * Uses raw.githubusercontent.com instead of the contents API to avoid
 * the 1 MB limit that the contents endpoint imposes.
 */
export async function fetchFileContent(
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  const url = `${GH_RAW}/${repo}/${branch}/${path}`
  const res = await fetch(url, { headers: { 'User-Agent': 'gitajob' } })
  if (!res.ok) {
    throw new Error(`GitHub raw ${res.status} fetching ${repo}@${branch}:${path}`)
  }
  return res.text()
}
