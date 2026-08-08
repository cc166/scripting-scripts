import { HStack, Image, RoundedRectangle, Spacer, Text, VStack, ZStack, Widget } from "scripting"
import { getLastReading, getReadingGoal, getReadingProgress, getReadingStreak, getTodayReadingStat, makeStoredBookKey } from "../storage"

// 主题色
export const WIDGET_ORANGE = "#E47A44"
export const WIDGET_ORANGE_DARK = "#C85A2A"
export const WIDGET_ACCENT = "#FFD9C7"

// 文字颜色
export const WIDGET_TEXT_PRIMARY = "#FFFFFF"
export const WIDGET_TEXT_SECONDARY = "rgba(255,255,255,0.85)"
export const WIDGET_TEXT_DIM = "rgba(255,255,255,0.72)"
export const WIDGET_TEXT_FAINT = "rgba(255,255,255,0.6)"

// 装饰元素
export const WIDGET_LINE = "rgba(255,255,255,0.18)"
export const WIDGET_BADGE = "rgba(255,255,255,0.2)"
export const WIDGET_STATUS = "rgba(255,255,255,0.15)"
export const WIDGET_PROGRESS_BG = "rgba(255,255,255,0.25)"
export const WIDGET_PROGRESS_FILL = "#FFFFFF"

export function widgetData() {
  const lastReading = getLastReading()
  const progress = lastReading
    ? getReadingProgress(makeStoredBookKey(lastReading.sourceId, lastReading.bookId, lastReading.detailUrl))
    : null
  const goal = getReadingGoal()
  const today = getTodayReadingStat()
  const streak = getReadingStreak()

  return {
    lastReading,
    progress,
    goal,
    today,
    streak,
  }
}

export function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} 分钟`
}

export function WidgetShell({
  children,
  spacing = 8,
}: {
  children: any
  spacing?: number
}) {
  return (
    <VStack
      alignment="leading"
      padding={{ horizontal: 16, vertical: 14 }}
      spacing={spacing}
      frame={Widget.displaySize}
      widgetBackground={{
        color: WIDGET_ORANGE,
        gradient: true,
      }}
      foregroundStyle="white"
    >
      {children}
    </VStack>
  )
}

export function HeaderRow({
  icon,
  title,
  badgeTitle,
}: {
  icon: string
  title: string
  badgeTitle?: string
}) {
  return (
    <HStack spacing={6}>
      <Image systemName={icon} font="caption" foregroundStyle={WIDGET_TEXT_SECONDARY} />
      <Text font="caption" fontWeight="medium" foregroundStyle={WIDGET_TEXT_SECONDARY}>
        {title}
      </Text>
      {badgeTitle ? (
        <Text
          font="caption2"
          fontWeight="semibold"
          padding={{ horizontal: 8, vertical: 3 }}
          background={<RoundedRectangle fill={WIDGET_BADGE} cornerRadius={10} />}
        >
          {badgeTitle}
        </Text>
      ) : undefined}
    </HStack>
  )
}

export function Hairline() {
  return (
    <RoundedRectangle
      fill={WIDGET_LINE}
      cornerRadius={999}
      frame={{ maxWidth: "infinity", height: 1 }}
    />
  )
}

export function StatColumn({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <VStack spacing={2} alignment="leading">
      <Text font="caption2" foregroundStyle={WIDGET_TEXT_FAINT}>
        {label}
      </Text>
      <Text font={compact ? "subheadline" : "headline"} fontWeight="semibold" lineLimit={1}>
        {value}
      </Text>
    </VStack>
  )
}

// 进度条组件
export function ProgressBar({
  progress,
  height = 4,
}: {
  progress: number  // 0-1
  height?: number
}) {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const widthPercent = Math.round(clampedProgress * 100)
  return (
    <ZStack alignment="leading" frame={{ maxWidth: "infinity", height }}>
      <RoundedRectangle fill={WIDGET_PROGRESS_BG} cornerRadius={height / 2} />
      {widthPercent > 0 && (
        <RoundedRectangle 
          fill={WIDGET_PROGRESS_FILL} 
          cornerRadius={height / 2}
          frame={{ maxWidth: `${widthPercent}%` as any, height }}
        />
      )}
    </ZStack>
  )
}

// 带标签的进度条
export function LabeledProgress({
  label,
  current,
  total,
  unit = "",
}: {
  label: string
  current: number
  total: number
  unit?: string
}) {
  const progress = total > 0 ? current / total : 0
  return (
    <VStack spacing={4} alignment="leading" frame={{ maxWidth: "infinity" }}>
      <HStack>
        <Text font="caption2" foregroundStyle={WIDGET_TEXT_FAINT}>{label}</Text>
        <Spacer />
        <Text font="caption2" fontWeight="medium" foregroundStyle={WIDGET_TEXT_DIM}>
          {current}{unit} / {total}{unit}
        </Text>
      </HStack>
      <ProgressBar progress={progress} />
    </VStack>
  )
}

export function StatusBand({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string
  title: string
  meta?: string
}) {
  return (
    <VStack
      spacing={4}
      alignment="leading"
      padding={{ horizontal: 12, vertical: 10 }}
      background={<RoundedRectangle fill={WIDGET_STATUS} cornerRadius={18} />}
    >
      <Text font="caption2" foregroundStyle={WIDGET_TEXT_FAINT}>
        {eyebrow}
      </Text>
      <Text font="headline" fontWeight="semibold" lineLimit={2}>
        {title}
      </Text>
      {meta ? (
        <Text font="caption" foregroundStyle={WIDGET_TEXT_DIM} lineLimit={1}>
          {meta}
        </Text>
      ) : undefined}
    </VStack>
  )
}
