import { HStack, Spacer, Text, VStack } from "scripting"
import { 
  HeaderRow, 
  LabeledProgress, 
  StatColumn,
  WidgetShell, 
  WIDGET_TEXT_DIM,
  WIDGET_TEXT_SECONDARY,
  widgetData 
} from "./shared"

export function MediumReadingWidget() {
  const { lastReading, progress, goal, today, streak } = widgetData()

  const todayMinutes = Math.floor(today.totalSeconds / 60)
  const goalMinutes = goal.dailyMinutes
  const chapterProgress = progress 
    ? { current: progress.chapterIndex + 1, total: progress.totalChapters }
    : null

  // 空状态
  if (!lastReading) {
    return (
      <WidgetShell spacing={8}>
        <HeaderRow icon="books.vertical" title="书源阅读" />
        <Spacer />
        <HStack spacing={16} alignment="center">
          <VStack spacing={4} alignment="leading" frame={{ maxWidth: "infinity" }}>
            <Text font="title3" fontWeight="bold" lineLimit={2}>
              今天还没开始阅读
            </Text>
            <Text font="subheadline" foregroundStyle={WIDGET_TEXT_DIM} lineLimit={2}>
              打开一本书，开始今天的阅读旅程
            </Text>
          </VStack>
          <VStack spacing={6} alignment="trailing">
            <StatColumn label="今日" value={`${todayMinutes}分钟`} compact />
            <StatColumn label="目标" value={`${goalMinutes}分钟`} compact />
          </VStack>
        </HStack>
        <Spacer />
        <LabeledProgress
          label="今日进度"
          current={todayMinutes}
          total={goalMinutes}
          unit="分钟"
        />
      </WidgetShell>
    )
  }

  // 有阅读记录 - 左右分栏布局
  return (
    <WidgetShell spacing={6}>
      <HeaderRow 
        icon="book.fill" 
        title="最近阅读" 
        badgeTitle={streak > 0 ? `🔥连续${streak}天` : undefined} 
      />

      <HStack spacing={12} alignment="top">
        {/* 左侧：书籍信息 */}
        <VStack spacing={3} alignment="leading">
          <Text font="title3" fontWeight="bold" lineLimit={2}>
            {lastReading.bookTitle}
          </Text>
          <Text font="subheadline" foregroundStyle={WIDGET_TEXT_SECONDARY} lineLimit={1}>
            {lastReading.chapterTitle}
          </Text>
          <Text font="caption2" foregroundStyle={WIDGET_TEXT_DIM} lineLimit={1}>
            {lastReading.sourceName}
          </Text>
        </VStack>
        {/* 右侧：统计数据 */}
        <VStack spacing={6} alignment="trailing">
          <StatColumn 
            label="章节" 
            value={chapterProgress ? `${chapterProgress.current}/${chapterProgress.total}` : "-"} 
            compact 
          />
          <StatColumn 
            label="今日" 
            value={`${todayMinutes}分钟`} 
            compact 
          />
        </VStack>
      </HStack>

      <LabeledProgress
        label="今日目标"
        current={todayMinutes}
        total={goalMinutes}
        unit="分钟"
      />
    </WidgetShell>
  )
}
