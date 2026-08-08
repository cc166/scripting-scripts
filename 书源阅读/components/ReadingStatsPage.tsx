import { Bar1DChart, HStack, Image, ContentUnavailableView, List, Section, Slider, Text, Toggle, VStack, useState } from "scripting"
import { getReadingGoal, getReadingStreak, getRecentReadingStats, getTodayReadingStat, saveReadingGoal } from "../storage"

function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} 分钟`
}

function encouragement(progress: number, streak: number): string {
  if (progress >= 1) return streak >= 3 ? `连续达标 ${streak} 天，状态很稳。` : "今日目标已完成，继续保持。"
  if (progress >= 0.7) return "今天已经很接近目标了，再读一会就能达成。"
  if (progress > 0) return "已经开始阅读了，今天的节奏不错。"
  return "今天还没开始，先读一章，让状态热起来。"
}

function tierLabel(progress: number): { title: string; symbol: string; color: string } {
  if (progress >= 1) {
    return { title: "今日达标", symbol: "checkmark.seal.fill", color: "#E47A44" }
  }
  if (progress >= 0.7) {
    return { title: "即将达标", symbol: "flame.fill", color: "#F29D38" }
  }
  if (progress > 0) {
    return { title: "已进入状态", symbol: "book.fill", color: "#5D8BF4" }
  }
  return { title: "等待开始", symbol: "moon.stars.fill", color: "#9AA0AA" }
}

export function ReadingStatsPage() {
  const initialGoal = getReadingGoal()
  const [goal, setGoal] = useState(initialGoal)
  const [savedMessage, setSavedMessage] = useState("")
  const today = getTodayReadingStat()
  const recent = getRecentReadingStats(7)
  const streak = getReadingStreak()
  const targetSeconds = goal.dailyMinutes * 60
  const progress = goal.enabled && targetSeconds > 0 ? Math.min(1, today.totalSeconds / targetSeconds) : 0
  const tier = tierLabel(progress)

  if (!goal && recent.length === 0) {
    return <ContentUnavailableView title="还没有阅读统计" systemImage="chart.bar" description="打开章节阅读后，这里会开始积累每日数据。" />
  }

  return (
    <List navigationTitle="阅读统计">
      <Section header={<Text>今日状态</Text>} footer={<Text>{encouragement(progress, streak)}</Text>}>
        <HStack spacing={10}>
          <Image systemName={tier.symbol} foregroundStyle={tier.color as any} />
          <VStack spacing={4} alignment="leading">
            <Text fontWeight="semibold">{tier.title}</Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {goal.enabled
                ? `今日目标完成 ${Math.round(progress * 100)}%`
                : `今日已阅读 ${formatMinutes(today.totalSeconds)}`}
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="flame.fill" foregroundStyle="#E47A44" />
          <Text>连续达标 {streak} 天</Text>
        </HStack>
        <HStack spacing={10}>
          <Image systemName={today.completedGoal ? "flag.checkered.circle.fill" : "flag.circle"} foregroundStyle={today.completedGoal ? "#E47A44" : "#9AA0AA"} />
          <Text>{today.completedGoal ? "今天已经达成目标" : "今天还差一点，继续读就能达标"}</Text>
        </HStack>
      </Section>

      <Section header={<Text>今日阅读</Text>} footer={<Text>{encouragement(progress, streak)}</Text>}>
        <Text>今日时长：{formatMinutes(today.totalSeconds)}</Text>
        <Text>今日章节切换：{today.sessions}</Text>
        <Text>今日书籍：{today.books.length > 0 ? today.books.join("、") : "暂无"}</Text>
        <Text>
          今日目标：{goal.enabled ? `${goal.dailyMinutes} 分钟` : "未开启"}
        </Text>
        <Text>
          完成情况：{goal.enabled ? `${Math.round(progress * 100)}%` : "按自然阅读统计"}
        </Text>
        <Text>连续达标：{streak} 天</Text>
      </Section>

      <Section header={<Text>每日目标</Text>} footer={<Text>{savedMessage || "可以在这里调整今天之后的默认阅读目标。"}</Text>}>
        <Toggle
          title="开启每日阅读目标"
          value={goal.enabled}
          onChanged={(value) => {
            const next = { ...goal, enabled: value }
            setGoal(next)
            saveReadingGoal(next)
            setSavedMessage(value ? "已开启每日阅读目标。" : "已关闭每日阅读目标。")
          }}
        />
        <VStack spacing={10}>
          <Text>目标时长：{goal.dailyMinutes} 分钟</Text>
          <Slider
            value={goal.dailyMinutes}
            onChanged={(value) => {
              const next = { ...goal, dailyMinutes: Math.round(value) }
              setGoal(next)
              saveReadingGoal(next)
              setSavedMessage(`已将每日目标调整为 ${Math.round(value)} 分钟。`)
            }}
            min={10}
            max={180}
            step={5}
            label={<Text>每日目标</Text>}
          />
        </VStack>
      </Section>

      <Section header={<Text>近 7 天趋势</Text>} footer={<Text>如果开启了每日目标，柱状图会帮助你看连续达标的节奏。</Text>}>
        <Bar1DChart
          marks={recent.map((item) => ({
            category: item.date.slice(5),
            value: Math.round(item.totalSeconds / 60),
            foregroundStyle: item.completedGoal ? "#E47A44" : "#9AA0AA",
          }))}
        />
      </Section>

      <Section header={<Text>每日明细</Text>}>
        {recent.slice().reverse().map((item) => (
          <VStack key={item.date} spacing={4} alignment="leading">
            <HStack spacing={8}>
              <Image
                systemName={item.completedGoal ? "checkmark.circle.fill" : "circle"}
                foregroundStyle={item.completedGoal ? "#E47A44" : "#C6C7CC"}
              />
              <VStack spacing={2} alignment="leading">
                <Text fontWeight={item.date === today.date ? "semibold" : "regular"}>
                  {item.date}
                </Text>
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  {formatMinutes(item.totalSeconds)} · {item.completedGoal ? "已达标" : "未达标"}
                </Text>
              </VStack>
            </HStack>
          </VStack>
        ))}
      </Section>
    </List>
  )
}
