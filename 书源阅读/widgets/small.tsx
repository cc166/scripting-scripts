import { Spacer, Text, VStack } from "scripting"
import { 
  HeaderRow, 
  LabeledProgress, 
  WidgetShell, 
  WIDGET_TEXT_DIM,
  WIDGET_TEXT_SECONDARY,
  widgetData 
} from "./shared"

export function SmallReadingWidget() {
  const { lastReading, progress, goal, today, streak } = widgetData()

  const todayMinutes = Math.floor(today.totalSeconds / 60)
  const goalMinutes = goal.dailyMinutes

  // 空状态
  if (!lastReading) {
    return (
      <WidgetShell spacing={6}>
        <HeaderRow icon="book.closed" title="书源阅读" />
        <Spacer />
        <Text font="headline" fontWeight="semibold" lineLimit={2}>
          今天还没开始阅读
        </Text>
        <Text font="caption" foregroundStyle={WIDGET_TEXT_DIM} lineLimit={2}>
          打开一本书开始阅读吧
        </Text>
        <Spacer />
        <LabeledProgress
          label="今日目标"
          current={todayMinutes}
          total={goalMinutes}
          unit="分钟"
        />
      </WidgetShell>
    )
  }

  // 有阅读记录
  return (
    <WidgetShell spacing={6}>
      <HeaderRow 
        icon="book.fill" 
        title="" 
        badgeTitle={streak > 0 ? `🔥${streak}天` : undefined} 
      />
      <Spacer />
      <VStack spacing={3} alignment="leading">
        <Text font="headline" fontWeight="bold" lineLimit={2}>
          {lastReading.bookTitle}
        </Text>
        <Text font="caption" foregroundStyle={WIDGET_TEXT_SECONDARY} lineLimit={1}>
          {lastReading.chapterTitle}
        </Text>
      </VStack>
      <Spacer />
      <LabeledProgress
        label="今日"
        current={todayMinutes}
        total={goalMinutes}
        unit="分钟"
      />
    </WidgetShell>
  )
}
