import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  Image,
  type Color,
} from "scripting"
import { HeatmapGrid } from "./components/heatmap_grid"
import { getLevelColor } from "./utils/colors"
import { getWidgetConfig } from "./utils/widget_config"
import { fetchCommitActivity } from "./services/commit_api"
import { ContributionDay, ContributionLevel, ContributionWeek } from "./types"

type DynamicColor = { light: Color; dark: Color }

const palette = {
  text: { light: "#0f1720", dark: "#f0f6fc" } as DynamicColor,
  textSoft: { light: "#57606a", dark: "#8b949e" } as DynamicColor,
  accent: { light: "#1f883d", dark: "#3fb950" } as DynamicColor,
  error: { light: "#cf222e", dark: "#ff7b72" } as DynamicColor,
  panel: { light: "#ffffff", dark: "#0d1117" } as DynamicColor,
}

// =============== 时段切片 & level 重算 ===============

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function flattenSortedDays(weeks: ContributionWeek[]): ContributionDay[] {
  const all = weeks.flat()
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return all
}

function computeLevel(count: number, max: number): ContributionLevel {
  if (count <= 0 || max <= 0) return 0
  const r = count / max
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

/** 按自然周（周日起）把 [start, end] 区间内的天数重组为 weeks，并根据区间内 max 重算 level */
function buildWeeksInRange(
  allDays: ContributionDay[],
  start: Date,
  end: Date,
): ContributionWeek[] {
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  const inRange = allDays.filter(d => d.date >= startStr && d.date <= endStr)
  const byDate = new Map(inRange.map(d => [d.date, d] as const))

  // 找到 start 所在自然周的周日
  const firstSunday = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay())

  const maxCount = inRange.reduce((m, d) => Math.max(m, d.count), 0)

  const weeks: ContributionWeek[] = []
  const cursor = new Date(firstSunday)
  while (cursor <= end) {
    const week: ContributionDay[] = []
    for (let i = 0; i < 7; i++) {
      const dateStr = cursor.toISOString().slice(0, 10)
      if (dateStr >= startStr && dateStr <= endStr) {
        const found = byDate.get(dateStr)
        week.push({
          date: dateStr,
          count: found?.count ?? 0,
          level: computeLevel(found?.count ?? 0, maxCount),
        })
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    if (week.length > 0) weeks.push(week)
  }
  return weeks
}

function monthRange(now: Date): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return { start, end, label: `${year} 年 ${month + 1} 月` }
}

/** 近半年：今天往前推 26 周 */
function halfYearRange(now: Date): { start: Date; end: Date; label: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 26 * 7 + 1)
  return { start, end, label: "近半年" }
}

function yearRange(now: Date): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  // end 截到今天，避免网格里生成大量未来空格
  const end = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()))
  return { start, end, label: `${year} 年` }
}

// =============== 统计 ===============

function totalCount(weeks: ContributionWeek[]) {
  return weeks.flat().reduce((sum, d) => sum + d.count, 0)
}

function activeDayCount(weeks: ContributionWeek[]) {
  return weeks.flat().filter(d => d.count > 0).length
}

function currentStreak(allSortedDays: ContributionDay[]) {
  let streak = 0
  for (let i = allSortedDays.length - 1; i >= 0; i--) {
    if (allSortedDays[i].count > 0) streak++
    else break
  }
  return streak
}

function lastActiveLabel(allSortedDays: ContributionDay[]) {
  for (let i = allSortedDays.length - 1; i >= 0; i--) {
    if (allSortedDays[i].count > 0) {
      const d = toDate(allSortedDays[i].date)
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (diff <= 0) return "今天"
      if (diff === 1) return "昨天"
      if (diff < 7) return `${diff} 天前`
      if (diff < 30) return `${Math.floor(diff / 7)} 周前`
      return `${Math.floor(diff / 30)} 月前`
    }
  }
  return "无记录"
}

function bestDay(weeks: ContributionWeek[]) {
  const days = weeks.flat()
  let best: ContributionDay | null = null
  for (const d of days) if (!best || d.count > best.count) best = d
  return best && best.count > 0 ? best : null
}

// =============== 通用组件 ===============

function Header({
  repoLabel,
  subtitle,
}: {
  repoLabel: string
  subtitle: string
}) {
  return (
    <HStack spacing={6} frame={{ maxWidth: Infinity }}>
      <Image systemName="chart.bar.doc.horizontal" font="caption" foregroundStyle={palette.accent} />
      <VStack alignment="leading" spacing={1}>
        <Text font="caption" fontWeight="bold" foregroundStyle={palette.text} lineLimit={1}>
          {repoLabel}
        </Text>
        <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
          {subtitle}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  )
}

/** 紧凑指标：左 label 右 value，一行 */
function InlineStat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <HStack spacing={4} frame={{ maxWidth: Infinity }}>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
        {label}
      </Text>
      <Spacer />
      <Text
        font="caption"
        fontWeight="bold"
        foregroundStyle={accent ? palette.accent : palette.text}
        lineLimit={1}
      >
        {value}
      </Text>
    </HStack>
  )
}

/** 卡片式堆叠指标：上 label 下 value，两行 */
function StackStat({
  label,
  value,
  accent = false,
  valueFont = "footnote",
}: {
  label: string
  value: string
  accent?: boolean
  valueFont?: "caption" | "footnote" | "subheadline" | "body"
}) {
  return (
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
        {label}
      </Text>
      <Text
        font={valueFont}
        fontWeight="bold"
        foregroundStyle={accent ? palette.accent : palette.text}
        lineLimit={1}
      >
        {value}
      </Text>
    </VStack>
  )
}

// =============== Small：当月 ===============

/** 截断长字符串，保留头尾，中间省略 */
function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = Math.max(1, Math.floor((max - 1) / 2))
  return `${s.slice(0, keep)}…${s.slice(-keep)}`
}

/** 取路径最后一段，避免显示深路径 */
function basename(p: string): string {
  const segs = p.split("/").filter(Boolean)
  return segs[segs.length - 1] ?? ""
}

function SmallView({
  repoName,
  pathLabel,
  allDays,
}: {
  repoName: string
  pathLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = monthRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)

  // 小号内部高度约 130pt：header(~14) + heatmap(~60) + stats(~42) + spacing = ~120，留安全边
  const repoDisplay = truncateMiddle(repoName, 14)

  return (
    <VStack alignment="leading" spacing={5} padding={10} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack spacing={4} frame={{ maxWidth: Infinity }}>
        <Image
          systemName="chart.bar.doc.horizontal"
          font="caption2"
          foregroundStyle={palette.accent}
        />
        <Text
          font="caption2"
          fontWeight="bold"
          foregroundStyle={palette.text}
          lineLimit={1}
          minScaleFactor={0.6}
        >
          {repoDisplay}
        </Text>
        <Spacer />
        <Text
          font="caption2"
          foregroundStyle={palette.textSoft}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {`${now.getUTCMonth() + 1}月`}
        </Text>
      </HStack>

      <HStack frame={{ maxWidth: Infinity }}>
        <Spacer />
        <HeatmapGrid
          weeks={weeks}
          getLevelColor={getLevelColor}
          cellSize={8}
          spacing={2}
          cornerRadius={1.8}
        />
        <Spacer />
      </HStack>

      <Spacer />

      <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
        <InlineStat label="本月" value={`${total} 次`} accent />
        <InlineStat label="活跃" value={`${active} 天`} />
        <InlineStat label="连续" value={`${streak} 天`} />
      </VStack>
    </VStack>
  )
}

// =============== Medium：近半年 ===============

function MediumView({
  repoLabel,
  allDays,
}: {
  repoLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = halfYearRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)
  const peak = bestDay(weeks)
  const lastActive = lastActiveLabel(allDays)

  // 中号内部宽度 ~305pt；~27 列 × cellSize=8 + spacing=2 = 268pt，铺满一条
  return (
    <VStack alignment="leading" spacing={8} padding={12}>
      <Header repoLabel={repoLabel} subtitle={label} />
      <HeatmapGrid
        weeks={weeks}
        getLevelColor={getLevelColor}
        cellSize={8}
        spacing={2}
        cornerRadius={1.8}
      />
      <Spacer />
      <HStack spacing={12} alignment="top" frame={{ maxWidth: Infinity }}>
        <StackStat label="近半年" value={`${total}`} accent valueFont="subheadline" />
        <StackStat label="活跃" value={`${active} 天`} />
        <StackStat label="连续" value={`${streak} 天`} />
        <StackStat label="单日最高" value={peak ? String(peak.count) : "0"} />
        <StackStat label="最近活跃" value={lastActive} />
      </HStack>
    </VStack>
  )
}

// =============== Large：当年 ===============

function LargeView({
  repoLabel,
  pathLabel,
  allDays,
}: {
  repoLabel: string
  pathLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = yearRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)
  const peak = bestDay(weeks)
  const lastActive = lastActiveLabel(allDays)

  // 大号内部宽度 ~305pt；年初到今天至多 53 列；cellSize=5 + spacing=1.5 → 5*53+1.5*52=343，略超，下调到 cellSize=4.8 → 4.8*53+1.5*52=332，仍超。用 4.5 + 1.2 = 300 安全
  const cellSize = weeks.length > 30 ? 4.5 : 8
  const spacing = weeks.length > 30 ? 1.2 : 2

  return (
    <VStack alignment="leading" spacing={12} padding={14} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <Header repoLabel={repoLabel} subtitle={pathLabel || label} />

      <HStack spacing={16} frame={{ maxWidth: Infinity }}>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            今年提交
          </Text>
          <Text font="title2" fontWeight="bold" foregroundStyle={palette.accent}>
            {total}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            连续
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {streak} 天
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            活跃
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {active}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            单日最高
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {peak ? String(peak.count) : "0"}
          </Text>
        </VStack>
      </HStack>

      <HeatmapGrid weeks={weeks} getLevelColor={getLevelColor} cellSize={cellSize} spacing={spacing} cornerRadius={1} />

      <Spacer />

      <VStack alignment="leading" spacing={6} frame={{ maxWidth: Infinity }}>
        <InlineStat label="最近活跃" value={lastActive} accent />
        <InlineStat
          label="最活跃的一天"
          value={peak ? `${peak.date.slice(5)} · ${peak.count} 次` : "暂无"}
        />
        <InlineStat label="统计范围" value={`${start.toISOString().slice(5, 10)} ~ ${end.toISOString().slice(5, 10)}`} />
      </VStack>
    </VStack>
  )
}

// =============== 错误 ===============

function ErrorView({ message }: { message: string }) {
  return (
    <VStack alignment="leading" spacing={6} padding={14}>
      <HStack spacing={6}>
        <Image systemName="exclamationmark.triangle.fill" font="caption" foregroundStyle={palette.error} />
        <Text font="caption" fontWeight="bold" foregroundStyle={palette.error}>
          加载失败
        </Text>
      </HStack>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={6}>
        {message}
      </Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.textSoft}>
        请打开脚本检查 GitHub 配置
      </Text>
    </VStack>
  )
}

// =============== 入口 ===============

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('GitHub 数据请求超时，请稍后刷新')),
      milliseconds,
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function run() {
  const config = getWidgetConfig()
  const hasRepo = config.owner && config.repo
  const repoLabel = hasRepo ? `${config.owner}/${config.repo}` : "未配置仓库"
  const repoName = hasRepo ? config.repo : "未配置"
  const pathLabel = config.path || ""
  const family = Widget.family

  if (!hasRepo) {
    Widget.present(<ErrorView message="请在 App 中完成 GitHub 配置后再添加小组件" />)
    return
  }

  try {
    const weeks = await withTimeout(fetchCommitActivity(config), 8_000)
    const allDays = flattenSortedDays(weeks)

    if (family === "systemSmall") {
      Widget.present(<SmallView repoName={repoName} pathLabel={pathLabel} allDays={allDays} />)
    } else if (family === "systemLarge") {
      Widget.present(<LargeView repoLabel={repoLabel} pathLabel={pathLabel} allDays={allDays} />)
    } else {
      Widget.present(<MediumView repoLabel={repoLabel} allDays={allDays} />)
    }
  } catch (error: any) {
    Widget.present(<ErrorView message={String(error?.message || error)} />)
  }
}

run()
