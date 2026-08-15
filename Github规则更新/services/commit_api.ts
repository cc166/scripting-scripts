import { fetch, Headers } from "scripting"
import { ContributionDay, ContributionLevel, ContributionWeek } from "../types"

type CommitQuery = {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
}

const MAX_PAGES = 10
const PER_PAGE = 100
const DAYS_IN_YEAR = 371

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function encodeURIPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/")
}

function startOfWeekSunday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - weekday)
  return d
}

function computeLevel(count: number, max: number): ContributionLevel {
  if (count <= 0) return 0
  if (max <= 0) return 0
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

async function fetchCommitsPage(query: CommitQuery, since: string, page: number): Promise<any[]> {
  const headers = new Headers()
  headers.set("Accept", "application/vnd.github+json")
  headers.set("X-GitHub-Api-Version", "2022-11-28")
  if (query.token) headers.set("Authorization", `Bearer ${query.token}`)

  const params: string[] = [
    `since=${encodeURIComponent(since)}`,
    `per_page=${PER_PAGE}`,
    `page=${page}`,
  ]
  if (query.branch) params.push(`sha=${encodeURIComponent(query.branch)}`)
  if (query.path) params.push(`path=${encodeURIPath(query.path)}`)

  const url = `https://api.github.com/repos/${encodeURIComponent(query.owner)}/${encodeURIComponent(query.repo)}/commits?${params.join("&")}`

  const res = await fetch(url, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    if (res.status === 401) throw new Error("鉴权失败：token 无效或已过期")
    if (res.status === 403) throw new Error("权限不足或触发速率限制")
    if (res.status === 404) throw new Error("找不到仓库或路径")
    throw new Error(data?.message || `HTTP ${res.status}`)
  }
  return await res.json()
}

export async function fetchCommitActivity(query: CommitQuery): Promise<ContributionWeek[]> {
  if (!query.owner || !query.repo) {
    throw new Error("请在脚本中配置 owner/repo")
  }

  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const sinceDate = new Date(todayUTC)
  sinceDate.setUTCDate(sinceDate.getUTCDate() - DAYS_IN_YEAR)
  const sinceISO = sinceDate.toISOString()

  const counts = new Map<string, number>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const commits = await fetchCommitsPage(query, sinceISO, page)
    if (!Array.isArray(commits) || commits.length === 0) break

    for (const commit of commits) {
      const iso = commit?.commit?.author?.date || commit?.commit?.committer?.date
      if (!iso) continue
      const dateStr = iso.slice(0, 10)
      counts.set(dateStr, (counts.get(dateStr) ?? 0) + 1)
    }

    if (commits.length < PER_PAGE) break
  }

  const maxCount = Math.max(0, ...counts.values())

  const weeks: ContributionWeek[] = []
  const firstSunday = startOfWeekSunday(sinceDate)
  const cursor = new Date(firstSunday)

  while (cursor <= todayUTC) {
    const week: ContributionDay[] = []
    for (let i = 0; i < 7; i++) {
      if (cursor > todayUTC) break
      const dateStr = toISODate(cursor)
      const count = counts.get(dateStr) ?? 0
      week.push({
        date: dateStr,
        count,
        level: computeLevel(count, maxCount),
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}
