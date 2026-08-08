/* 纪念日时间计算（按 0 点对 0 点的整数天数） */

/** 把 yyyy-MM-dd 解析为本地 0 点 Date */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** 格式化为 yyyy-MM-dd */
export function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** 今天 0 点 */
export function today0(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** 计算两日期相差天数（end - start，单位：天，整数） */
export function diffDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.round(ms / 86400000)
}

/** 已经过去多少天（包含今天则 +1，不包含则使用 diffDays） */
export function daysSince(dateStr: string): number {
  return diffDays(parseDate(dateStr), today0())
}

/**
 * 距离目标日还有多少天
 * - yearly=true 时，找到 >= 今天 的最近一次出现
 */
export function daysUntil(dateStr: string, yearly?: boolean): number {
  const t = today0()
  let target = parseDate(dateStr)
  if (yearly) {
    target = new Date(t.getFullYear(), target.getMonth(), target.getDate())
    if (diffDays(t, target) < 0) {
      target = new Date(t.getFullYear() + 1, target.getMonth(), target.getDate())
    }
  }
  return diffDays(t, target)
}
