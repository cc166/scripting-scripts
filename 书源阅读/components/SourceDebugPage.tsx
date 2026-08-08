import { Button, List, ProgressView, Section, Text, VStack, useEffect, useState } from "scripting"
import { loadBookChapters, loadChapterContent, searchBooks } from "../services/book_service"
import { saveSourceProbeStatus } from "../storage"
import { BookChapter, SearchBook, StoredBookSource } from "../types"
import { truncate } from "../utils/text"

type DebugState = {
  loading: boolean
  searchCount: number
  selectedBook: SearchBook | null
  chapterCount: number
  selectedChapter: BookChapter | null
  contentPreview: string
  stage: "idle" | "search" | "toc" | "content" | "done" | "failed"
  error: string
}

function initialState(): DebugState {
  return {
    loading: true,
    searchCount: 0,
    selectedBook: null,
    chapterCount: 0,
    selectedChapter: null,
    contentPreview: "",
    stage: "idle",
    error: "",
  }
}

function stageLabel(stage: DebugState["stage"]): string {
  switch (stage) {
    case "search":
      return "搜索中"
    case "toc":
      return "解析目录"
    case "content":
      return "提取正文"
    case "done":
      return "已完成"
    case "failed":
      return "失败"
    default:
      return "等待开始"
  }
}

function stageStatus(currentStage: DebugState["stage"], target: "search" | "toc" | "content"): string {
  if (currentStage === "failed") return "失败"
  if (currentStage === "done") return "通过"

  const order = ["search", "toc", "content"]
  const currentIndex = order.indexOf(currentStage)
  const targetIndex = order.indexOf(target)
  if (currentIndex > targetIndex) return "通过"
  if (currentIndex === targetIndex) return "进行中"
  return "未开始"
}

export function SourceDebugPage({
  source,
  keyword,
}: {
  source: StoredBookSource
  keyword: string
}) {
  const [state, setState] = useState<DebugState>(() => initialState())
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setState({
          ...initialState(),
          loading: true,
          stage: "search",
        })

        const results = await searchBooks(source, keyword.trim())
        if (cancelled) return

        const selectedBook = results[0] ?? null
        setState((prev) => ({
          ...prev,
          searchCount: results.length,
          selectedBook,
          stage: "toc",
        }))

        if (!selectedBook) {
          saveSourceProbeStatus({
            sourceId: source.id,
            keyword,
            success: false,
            stage: "search",
            searchCount: results.length,
            chapterCount: 0,
            updatedAt: new Date().toISOString(),
            error: "没有搜索结果",
          })
          setState((prev) => ({
            ...prev,
            loading: false,
            stage: "done",
          }))
          return
        }

        const chapters = await loadBookChapters(source, selectedBook)
        if (cancelled) return

        const selectedChapter = chapters[0] ?? null
        setState((prev) => ({
          ...prev,
          chapterCount: chapters.length,
          selectedChapter,
          stage: "content",
        }))

        if (!selectedChapter) {
          saveSourceProbeStatus({
            sourceId: source.id,
            keyword,
            success: false,
            stage: "toc",
            searchCount: results.length,
            chapterCount: chapters.length,
            updatedAt: new Date().toISOString(),
            error: "没有章节结果",
          })
          setState((prev) => ({
            ...prev,
            loading: false,
            stage: "done",
          }))
          return
        }

        const content = await loadChapterContent(source, selectedChapter)
        if (cancelled) return

        saveSourceProbeStatus({
          sourceId: source.id,
          keyword,
          success: true,
          stage: "done",
          searchCount: results.length,
          chapterCount: chapters.length,
          updatedAt: new Date().toISOString(),
        })
        setState((prev) => ({
          ...prev,
          loading: false,
          contentPreview: truncate(content, 400),
          stage: "done",
        }))
      } catch (error) {
        if (cancelled) return
        saveSourceProbeStatus({
          sourceId: source.id,
          keyword,
          success: false,
          stage: "failed",
          searchCount: 0,
          chapterCount: 0,
          updatedAt: new Date().toISOString(),
          error: String(error),
        })
        setState((prev) => ({
          ...prev,
          loading: false,
          stage: "failed",
          error: String(error),
        }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [keyword, reloadToken, source.id])

  if (state.loading) {
    return (
      <VStack
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        navigationTitle="试源"
      >
        <ProgressView />
        <Text font="footnote" foregroundStyle="secondaryLabel">
          正在验证 {source.bookSourceName} 的搜索、目录和正文链路...
        </Text>
      </VStack>
    )
  }

  return (
    <List
      navigationTitle="试源"
      toolbar={{
        topBarTrailing: <Button title="重试" action={() => setReloadToken((value) => value + 1)} />,
      }}
    >
      <Section header={<Text>输入</Text>}>
        <Text>书源：{source.bookSourceName}</Text>
        <Text>关键词：{keyword}</Text>
        <Text>当前状态：{stageLabel(state.stage)}</Text>
      </Section>

      <Section
        header={<Text>阶段状态</Text>}
        footer={<Text>如果是 `http` 站点，当前版本已经自动开启明文请求。</Text>}
      >
        <Text>搜索：{stageStatus(state.stage, "search")}</Text>
        <Text>目录：{stageStatus(state.stage, "toc")}</Text>
        <Text>正文：{stageStatus(state.stage, "content")}</Text>
      </Section>

      <Section header={<Text>结果摘要</Text>}>
        <Text>搜索命中：{state.searchCount}</Text>
        {state.selectedBook ? <Text>首本书：{state.selectedBook.title}</Text> : <Text>首本书：未获取到</Text>}
        {state.selectedBook?.author ? <Text>作者：{state.selectedBook.author}</Text> : undefined}
        <Text>章节数量：{state.chapterCount}</Text>
        {state.selectedChapter ? <Text>首章：{state.selectedChapter.title}</Text> : <Text>首章：未获取到</Text>}
      </Section>

      <Section header={<Text>正文预览</Text>}>
        {state.contentPreview ? (
          <Text>{state.contentPreview}</Text>
        ) : (
          <Text>暂未拿到正文预览。</Text>
        )}
      </Section>

      {state.error ? (
        <Section header={<Text>错误详情</Text>}>
          <Text>{state.error}</Text>
        </Section>
      ) : undefined}
    </List>
  )
}
