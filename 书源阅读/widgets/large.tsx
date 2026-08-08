import { HStack, Spacer, Text, VStack } from "scripting"
import { 
  Hairline,
  HeaderRow, 
  LabeledProgress,
  StatColumn,
  StatusBand, 
  WidgetShell, 
  WIDGET_TEXT_DIM,
  WIDGET_TEXT_SECONDARY,
  widgetData 
} from "./shared"

export function LargeReadingWidget() {
  const { lastReading, progress, goal, today, streak } = widgetData()

  const todayMinutes = Math.floor(today.totalSeconds / 60)
  const goalMinutes = goal.dailyMinutes
  const goalAchieved = todayMinutes >= goalMinutes
  const chapterProgress = progress 
    ? { current: progress.chapterIndex + 1, total: progress.totalChapters }
    : null

  // 空状态
  if (!lastReading) {
    return (
      <WidgetShell spacing={10}>
        <HeaderRow icon="books.vertical" title="书源阅读" />
        <Spacer />
        <VStack spacing={6} alignment="leading">
          <Text font="title2" fontWeight="bold" lineLimit={2}>
            今天还没开始阅读
          </Text>
          <Text font="body" foregroundStyle={WIDGET_TEXT_SECONDARY} lineLimit={2}>
            从书架里挑一本书，开始今天的阅读旅程吧。
          </Text>
        </VStack>
        <Spacer />
        <Hairline />
        <HStack spacing={20}>
          <StatColumn label="今日阅读" value={`${todayMinutes} 分钟`} />
          <StatColumn label="每日目标" value={`${goalMinutes} 分钟`} />
          <StatColumn label="连续天数" value={`${streak} 天`} />
        </HStack>
        <LabeledProgress
          label="今日目标进度"
          current={todayMinutes}
          total={goalMinutes}
          unit="分钟"
        />
        <StatusBand
          eyebrow="💡 阅读提示"
          title="每天阅读10分钟，一年就能读完好几本书。"
        />
      </WidgetShell>
    )
  }

  // 有阅读记录
  return (
    <WidgetShell spacing={12}>
      <HeaderRow 
        icon="book.fill" 
        title="阅读进行中" 
        badgeTitle={streak > 0 ? `🔥连续${streak}天` : undefined} 
      />
      {/* 书籍信息区 */}
      <VStack spacing={4} alignment="leading">
        <Text font="title2" fontWeight="bold" lineLimit={2}>
          {lastReading.bookTitle}
        </Text>
        <Text font="headline" foregroundStyle={WIDGET_TEXT_SECONDARY} lineLimit={1}>
          {lastReading.chapterTitle}
        </Text>
        <Text font="caption" foregroundStyle={WIDGET_TEXT_DIM} lineLimit={1}>
          来源：{lastReading.sourceName}
        </Text>
      </VStack>
      <Hairline />
      {/* 统计数据 */}
      <HStack spacing={20}>
        <StatColumn 
          label="章节进度" 
          value={chapterProgress ? `${chapterProgress.current}/${chapterProgress.total}` : "继续阅读"} 
        />
        <StatColumn label="今日阅读" value={`${todayMinutes} 分钟`} />
        <StatColumn label="每日目标" value={`${goalMinutes} 分钟`} />
      </HStack>
      {/* 进度可视化 - 只保留今日目标进度条 */}
      <LabeledProgress
        label={chapterProgress ? `章节 ${chapterProgress.current}/${chapterProgress.total} · 今日目标` : "今日目标"}
        current={todayMinutes}
        total={goalMinutes}
        unit="分钟"
      />
      {/* 状态卡片 */}
      <StatusBand
        eyebrow={goalAchieved ? "🎉 已达标" : "📖 继续加油"}
        title={goalAchieved 
          ? "今天已完成阅读目标，继续保持！"
          : `距离达标还差 ${Math.max(0, goalMinutes - todayMinutes)} 分钟`
        }
        meta={`上次阅读：${formatTime(lastReading.updatedAt)}`}
      />
    </WidgetShell>
  )
}

function formatTime(timestamp: number | string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  
  if (isToday) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
