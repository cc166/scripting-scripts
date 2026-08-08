import { Button, ContentUnavailableView, HStack, Image, Label, List, Navigation, NavigationLink, NavigationStack, Section, Text, TextField, Widget, useEffect, useState, VStack, Group, Script } from "scripting"
import { CacheManagerPage } from "./CacheManagerPage"
import { HelpPage } from "./HelpPage"
import { ImportSourcePage } from "./ImportSourcePage"
import { BookshelfPage } from "./BookshelfPage"
import { ReadingHistoryPage } from "./ReadingHistoryPage"
import { ReadingStatsPage } from "./ReadingStatsPage"
import { ResumeReadingPage } from "./ResumeReadingPage"
import { SearchResultsPage } from "./SearchResultsPage"
import { SourceDebugPage } from "./SourceDebugPage"
import { SourceManagePage } from "./SourceManagePage"
import {
  getActiveSource,
  getLastReading,
  getReadingGoal,
  getReadingProgress,
  getReadingStreak,
  getSourceProbeStatus,
  getTodayReadingStat,
  listBookshelf,
  listReadingHistory,
  listSources,
  makeStoredBookKey,
  resetBuiltinSources,
} from "../storage"
import { StoredBookSource } from "../types"

function sourceStatusText(sourceId: string): string {
  const status = getSourceProbeStatus(sourceId)
  if (!status) return "未测试"
  if (status.success) return `已通过 · ${new Date(status.updatedAt).toLocaleString()}`
  return `失败(${status.stage}) · ${new Date(status.updatedAt).toLocaleString()}`
}

function sourceSymbol(active: boolean, enabled: boolean): string {
  if (active) return "dot.radiowaves.left.and.right"
  if (enabled) return "books.vertical"
  return "book.closed"
}

function SourceSection({
  sources,
  activeSourceId,
  onReload,
}: {
  sources: StoredBookSource[]
  activeSourceId: string | null
  onReload: () => void
}) {
  return (
    <>
      <Section
        header={<Text>书源</Text>}
        footer={<Text>优先选择已通过试源的书源。</Text>}
      >
        {sources.map((source) => {
          const active = source.id === activeSourceId
          return (
            <NavigationLink
              key={source.id}
              destination={<SourceManagePage source={source} onChanged={onReload} />}
            >
              <HStack spacing={10}>
                <Group frame={{ width: 24, height: 24 }}>
                  <Image systemName={sourceSymbol(active, source.enabled)} foregroundStyle={active ? "#E47A44" : "secondaryLabel"} />
                </Group>
                <VStack spacing={4} alignment="leading">
                  <Text fontWeight={active ? "semibold" : "regular"}>
                    {source.bookSourceName}
                  </Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {(source.bookSourceGroup || "未分组")} · {source.adapter} · {active ? "当前" : (source.enabled ? "可用" : "停用")}
                  </Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {sourceStatusText(source.id)}
                  </Text>
                </VStack>
              </HStack>
            </NavigationLink>
          )
        })}
      </Section>

      <Section header={<Text>书源维护</Text>}>
        <Button
          title="导入书源 JSON"
          systemImage="square.and.arrow.down"
          action={async () => {
            await Navigation.present(
              <ImportSourcePage
                onImported={() => {
                  onReload()
                }}
              />,
            )
            onReload()
          }}
        />
        <Button
          title="重置为内置演示源"
          systemImage="arrow.counterclockwise"
          action={() => {
            resetBuiltinSources()
            onReload()
          }}
        />
      </Section>
    </>
  )
}

function LastReadingSection() {
  const lastReading = getLastReading()

  if (!lastReading) {
    return (
      <Section header={<Text>继续阅读</Text>}>
        <Text>还没有阅读记录。</Text>
      </Section>
    )
  }

  return (
    <Section header={<Text>继续阅读</Text>}>
      <NavigationLink destination={<ResumeReadingPage />}>
        <HStack spacing={10}>
          <Image systemName="book.fill" foregroundStyle="#E47A44" />
          <VStack spacing={4} alignment="leading">
            <Text fontWeight="semibold">{lastReading.bookTitle}</Text>
            <Text>{lastReading.chapterTitle}</Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              {lastReading.sourceName} · {new Date(lastReading.updatedAt).toLocaleString()}
            </Text>
          </VStack>
        </HStack>
      </NavigationLink>
    </Section>
  )
}

function LibrarySection() {
  const bookshelfCount = listBookshelf().length
  const historyCount = listReadingHistory().length
  const lastReading = getLastReading()
  const progress = lastReading
    ? getReadingProgress(makeStoredBookKey(lastReading.sourceId, lastReading.bookId, lastReading.detailUrl))
    : null

  return (
    <Section header={<Text>我的阅读</Text>}>
      <NavigationLink
        destination={<BookshelfPage />}
      >
        <Label title={`书架${bookshelfCount > 0 ? `（${bookshelfCount}）` : ""}`} systemImage="books.vertical" />
      </NavigationLink>
      <NavigationLink
        destination={<ReadingHistoryPage />}
      >
        <Label title={`阅读历史${historyCount > 0 ? `（${historyCount}）` : ""}`} systemImage="clock.arrow.circlepath" />
      </NavigationLink>
      <NavigationLink
        destination={<CacheManagerPage />}
      >
        <Label title="缓存管理" systemImage="internaldrive" />
      </NavigationLink>
      <NavigationLink
        destination={<ReadingStatsPage />}
      >
        <Label title="阅读统计" systemImage="chart.bar" />
      </NavigationLink>
      {progress ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          当前进度：{progress.bookTitle} · {progress.chapterTitle}
        </Text>
      ) : undefined}
    </Section>
  )
}

function ReadingStatsSummary() {
  const today = getTodayReadingStat()
  const goal = getReadingGoal()
  const streak = getReadingStreak()
  const targetSeconds = goal.dailyMinutes * 60
  const percent = goal.enabled && targetSeconds > 0
    ? Math.min(100, Math.round(today.totalSeconds / targetSeconds * 100))
    : 0

  return (
    <Section header={<Text>今日阅读</Text>}>
      <NavigationLink
        destination={<ReadingStatsPage />}
      >
        <Label
          title={goal.enabled
            ? `${Math.floor(today.totalSeconds / 60)} / ${goal.dailyMinutes} 分钟`
            : `${Math.floor(today.totalSeconds / 60)} 分钟`}
          systemImage="flame"
        />
      </NavigationLink>
      <Text font="caption" foregroundStyle="secondaryLabel">
        {goal.enabled
          ? `今日目标完成 ${percent}% · 连续达标 ${streak} 天`
          : `已累计阅读 ${Math.floor(today.totalSeconds / 60)} 分钟`}
      </Text>
    </Section>
  )
}

export function App() {
  // const dismiss = Navigation.useDismiss()
  const [keyword, setKeyword] = useState("凡人修仙传")
  const [sources, setSources] = useState<StoredBookSource[]>(() => listSources())
  const [activeSourceId, setCurrentActiveSourceId] = useState<string | null>(() => getActiveSource()?.id ?? null)
  const [refreshToken, setRefreshToken] = useState(0)

  const activeSource = sources.find((item) => item.id === activeSourceId) ?? sources[0] ?? null

  function reloadState() {
    const nextSources = listSources()
    const nextActiveSource = getActiveSource()
    setSources(nextSources)
    setCurrentActiveSourceId(nextActiveSource?.id ?? null)
    setRefreshToken((value) => value + 1)
  }

  useEffect(() => {
    reloadState()
  }, [])

  if (!activeSource) {
    return (
      <NavigationStack>
        <ContentUnavailableView
          title="没有可用书源"
          systemImage="books.vertical"
          description="请先导入一个书源 JSON。"
        />
      </NavigationStack>
    )
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="书源阅读"
        navigationBarTitleDisplayMode="inline"
        onAppear={reloadState}
        toolbar={{
          cancellationAction: <Button title="关闭" systemImage="xmark" action={() => Script.minimize()} />,
        }}
      >
        <Section
          header={<Text>搜索</Text>}
          footer={<Text>当前书源：{activeSource.bookSourceName}。先输入书名，再进入搜索结果。</Text>}
        >
          <TextField
            title="搜索书名或作者"
            value={keyword}
            onChanged={setKeyword}
            submitLabel="search"
          />
          <NavigationLink
            destination={<SearchResultsPage source={activeSource} keyword={keyword.trim() || "凡人修仙传"} />}
          >
            <Label title="开始搜索" systemImage="magnifyingglass" />
          </NavigationLink>
        </Section>

        <ReadingStatsSummary key={`stats-${refreshToken}`} />
        <LastReadingSection key={`last-reading-${refreshToken}`} />
        <LibrarySection key={`library-${refreshToken}`} />

        <Section
          header={<Text>调试与说明</Text>}
          footer={<Text>搜索不准、目录异常或正文失败时，再使用试源调试。</Text>}
        >
          <NavigationLink
            destination={<SourceDebugPage source={activeSource} keyword={keyword.trim() || "凡人修仙传"} />}
          >
            <Label title="试源调试" systemImage="wrench.and.screwdriver" />
          </NavigationLink>
          <NavigationLink
            destination={<HelpPage />}
          >
            <Label title="兼容说明" systemImage="info.circle" />
          </NavigationLink>
        </Section>

        <SourceSection
          sources={sources}
          activeSourceId={activeSourceId}
          onReload={reloadState}
        />
      </List>
    </NavigationStack>
  )
}
