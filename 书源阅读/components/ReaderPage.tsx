import { AppEvents, Button, Color, HStack, Image, List, ProgressView, Rectangle, ScrollView, Section, Spacer, Text, useColorScheme, useEffect, useRef, useState, VStack } from "scripting"
import { loadChapterContent } from "../services/book_service"
import { alignToSentenceStart, TtsState, ttsController } from "../services/tts_service"
import {
  addReadingDuration,
  getReaderPreferences,
  getTtsPosition,
  makeStoredBookKey,
  pushReadingHistory,
  readChapterCache,
  removeChapterCache,
  saveChapterCache,
  saveLastReading,
  saveReadingProgress,
  touchBookshelfItem,
} from "../storage"
import { BookChapter, SearchBook, StoredBookSource } from "../types"
import { deriveSurfaceColor, resolveThemeColors } from "../utils/theme"
import { ChapterPickerPage } from "./ChapterPickerPage"
import { ReaderSettingsPage } from "./ReaderSettingsPage"

declare function setTimeout(handler: () => void, timeout: number): number
declare function clearTimeout(handle: number): void

export function ReaderPage({
  source,
  book,
  chapters,
  initialIndex,
}: {
  source: StoredBookSource
  book: SearchBook
  chapters: BookChapter[]
  initialIndex: number
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [preferences, setPreferences] = useState(() => getReaderPreferences())
  const [showSettings, setShowSettings] = useState(false)
  const [showChapters, setShowChapters] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [ttsState, setTtsState] = useState<TtsState>(() => ttsController.state)
  /** 章末自动续章或朗读中手动切换相邻章节时，为 true；目标章节加载完后会自动触发 speak */
  const pendingAutoSpeakRef = useRef<boolean>(false)
  const scheme = useColorScheme()
  // 运行时解析生效配色：内置 preset 跟随系统深浅；custom 使用保存的颜色值
  const resolved = resolveThemeColors(preferences.themePreset, scheme) ?? {
    textColor: preferences.textColor,
    backgroundColor: preferences.backgroundColor,
  }
  const effectiveTextColor = resolved.textColor
  const effectiveBackgroundColor = resolved.backgroundColor
  const surfaceColor = deriveSurfaceColor(effectiveBackgroundColor, scheme)
  const chapter = chapters[currentIndex] ?? chapters[0]
  const detailUrl = String(book.raw?.detailUrl ?? "")
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < chapters.length - 1

  useEffect(() => {
    let cancelled = false

    function recordReading() {
      const updatedAt = new Date().toISOString()
      const bookKey = makeStoredBookKey(source.id, book.id, detailUrl)

      saveLastReading({
        sourceId: source.id,
        sourceName: source.bookSourceName,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterContentUrl: chapter.contentUrl,
        chapterContentType: chapter.contentType,
        detailUrl,
        updatedAt,
      })

      saveReadingProgress({
        key: bookKey,
        sourceId: source.id,
        sourceName: source.bookSourceName,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        detailUrl,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterContentUrl: chapter.contentUrl,
        chapterContentType: chapter.contentType,
        chapterIndex: currentIndex,
        totalChapters: chapters.length,
        updatedAt,
      })

      pushReadingHistory({
        key: `${bookKey}:${chapter.id}`,
        sourceId: source.id,
        sourceName: source.bookSourceName,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        detailUrl,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterContentUrl: chapter.contentUrl,
        chapterContentType: chapter.contentType,
        updatedAt,
      })

      touchBookshelfItem(bookKey, updatedAt)
    }

    ;(async () => {
      try {
        setLoading(true)
        setError("")
        const cached = readChapterCache(chapter.contentUrl)
        if (cached) {
          if (!cancelled) {
            setContent(cached)
            recordReading()
            setLoading(false)
          }
          return
        }

        const text = await loadChapterContent(source, chapter)
        if (cancelled) return

        setContent(text)
        saveChapterCache(chapter.contentUrl, text)
        recordReading()
      } catch (err) {
        if (cancelled) return
        setError(String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [book.author, book.id, book.title, chapter.contentType, chapter.contentUrl, chapter.id, chapter.title, chapters.length, currentIndex, detailUrl, reloadToken, source.bookSourceName, source.id])

  // 阅读时长计时器（策略 A）：
  // - 前台且章节已加载完成 → 计时（默读）
  // - 正在朗读 → 计时（即使在后台/锁屏）
  // 两者为并集，只起一个 timer 避免重复计时。
  // 用 ref 收集多维度条件，计时 effect 只挂载一次，避免 ttsState 变化时 effect 重建造成 tick 断点。
  const timingInputsRef = useRef({
    scenePhase: "active" as string,
    ttsState: ttsController.state as TtsState,
    loading,
    error,
    bookTitle: book.title,
  })
  // 同步最新值到 ref（在每次 render 中）
  timingInputsRef.current.ttsState = ttsState
  timingInputsRef.current.loading = loading
  timingInputsRef.current.error = error
  timingInputsRef.current.bookTitle = book.title
  const timingReconcileRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let timer: number | null = null

    function tick() {
      addReadingDuration({
        seconds: 1,
        bookTitle: timingInputsRef.current.bookTitle,
      })
      timer = setTimeout(tick, 1000)
    }

    function startTimer() {
      if (timer) return
      timer = setTimeout(tick, 1000)
    }

    function stopTimer() {
      if (!timer) return
      clearTimeout(timer)
      timer = null
    }

    function reconcile() {
      const { scenePhase, ttsState: curTts, loading: l, error: e } = timingInputsRef.current
      const frontReadable = scenePhase === "active" && !l && !e
      const isSpeaking = curTts === "speaking"
      if (frontReadable || isSpeaking) {
        startTimer()
      } else {
        stopTimer()
      }
    }

    timingReconcileRef.current = reconcile

    const sceneListener = (phase: string) => {
      timingInputsRef.current.scenePhase = phase
      reconcile()
    }

    reconcile()
    AppEvents.scenePhase.addListener(sceneListener)

    return () => {
      stopTimer()
      timingReconcileRef.current = null
      AppEvents.scenePhase.removeListener(sceneListener)
    }
  }, [])

  // loading / error / ttsState 级联：调用计时器的 reconcile 重新评估是否该起停
  useEffect(() => {
    timingReconcileRef.current?.()
  }, [loading, error, ttsState])

  // 订阅 TTS 状态，驱动按钮和浮层 UI
  useEffect(() => {
    const listener = (state: TtsState) => {
      setTtsState(state)
    }
    ttsController.addListener(listener)
    return () => {
      ttsController.removeListener(listener)
    }
  }, [])

  // 离开阅读页时停止朗读（不管当前状态如何，用 forceStop 同步触发，
  // 避免组件 dismiss 后 async stop 被丢弃导致声音残留）
  useEffect(() => {
    return () => {
      pendingAutoSpeakRef.current = false
      ttsController.forceStop()
    }
  }, [])

  async function startSpeaking(
    fullText: string,
    opts?: { fromStart?: boolean; replaceCurrent?: boolean },
  ) {
    console.log("[reader][tts] startSpeaking", {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      currentIndex,
      fromStart: opts?.fromStart === true,
      replaceCurrent: opts?.replaceCurrent === true,
      ttsState: ttsController.state,
    })
    const currentHasPrevious = currentIndex > 0
    const currentHasNext = currentIndex < chapters.length - 1
    const bookKey = makeStoredBookKey(source.id, book.id, detailUrl)

    // 计算起始字符偏移：如果有上次中断位置且是同一章，从那里续读
    let baseOffset = 0
    if (!opts?.fromStart) {
      const saved = getTtsPosition(bookKey, chapter.id)
      if (saved && saved.charOffset > 0 && saved.charOffset < fullText.length) {
        baseOffset = alignToSentenceStart(fullText, saved.charOffset)
      }
    }

    const sliced = baseOffset > 0 ? fullText.slice(baseOffset) : fullText
    const artwork = book.cover ? await UIImage.fromURL(book.cover).catch(() => null) : undefined

    ttsController
      .speak(sliced, preferences.tts, {
        replaceCurrent: opts?.replaceCurrent === true,
        context: {
          bookKey,
          chapterId: chapter.id,
          contentLength: fullText.length,
          baseOffset,
          preloadNowPlaying: opts?.replaceCurrent === true,
          nowPlaying: {
            title: `${book.title}｜${chapter.title || "正文"}`,
            artist: book.author ? `${book.author} 著` : source.bookSourceName,
            albumTitle: book.title,
            artwork: artwork ?? undefined,
          },
          commands: {
            previousTrack: currentHasPrevious
              ? () => {
                  console.log("[reader][tts] remote previousTrack", {
                    chapterId: chapter.id,
                    currentIndex,
                    ttsState: ttsController.state,
                  })
                  if (ttsController.state !== "idle") {
                    pendingAutoSpeakRef.current = true
                  }
                  setCurrentIndex((i) => Math.max(i - 1, 0))
                }
              : undefined,
            nextTrack: currentHasNext
              ? () => {
                  console.log("[reader][tts] remote nextTrack", {
                    chapterId: chapter.id,
                    currentIndex,
                    ttsState: ttsController.state,
                  })
                  if (ttsController.state !== "idle") {
                    pendingAutoSpeakRef.current = true
                  }
                  setCurrentIndex((i) => Math.min(i + 1, chapters.length - 1))
                }
              : undefined,
          },
        },
        onFinish: () => {
          console.log("[reader][tts] onFinish", {
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            currentHasNext,
            autoNext: preferences.tts.autoNextChapter,
          })
          // 本章正常读完所触发
          if (preferences.tts.autoNextChapter && currentHasNext) {
            pendingAutoSpeakRef.current = true
            setCurrentIndex((i) => Math.min(i + 1, chapters.length - 1))
          }
        },
      })
      .catch((err) => {
        console.error("[tts] speak failed", err)
      })
  }

  async function handleToggleSpeak() {
    if (ttsState === "speaking") {
      await ttsController.pause()
      return
    }
    if (ttsState === "paused") {
      await ttsController.resume()
      return
    }
    if (!content) return
    await startSpeaking(content)
  }

  async function handleStopSpeak() {
    pendingAutoSpeakRef.current = false
    await ttsController.stop()
  }

  // 切章时停止旧章朗读（仅在非自动续章跳转时）
  useEffect(() => {
    // 若本次 index 变化是由自动续章触发（pendingAutoSpeakRef=true），则不主动 stop，
    // 等内容加载完后新 speak 来取代。
    console.log("[reader][tts] chapter changed", {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      currentIndex,
      pendingAutoSpeak: pendingAutoSpeakRef.current,
      ttsState: ttsController.state,
    })
    if (pendingAutoSpeakRef.current) return
    ttsController.stop().catch(() => undefined)
    // 仅对 chapter.id 变化生效
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id])

  // 自动续章 / 朗读中切章：新章节加载完成后从头读，并且用 replace 模式保持 Now Playing
  useEffect(() => {
    if (loading || error) return
    if (!pendingAutoSpeakRef.current) return
    console.log("[reader][tts] auto speak after chapter load", {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      currentIndex,
      ttsState: ttsController.state,
    })
    pendingAutoSpeakRef.current = false
    if (!content) return
    startSpeaking(content, { fromStart: true, replaceCurrent: true }).catch((err) => {
      console.error("[tts] auto speak failed", err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, loading, error])

  const previewSample = content.trim().slice(0, 30)
  const speakSystemImage =
    ttsState === "speaking"
      ? "pause.circle.fill"
      : ttsState === "paused"
        ? "play.circle.fill"
        : "speaker.wave.2"

  if (loading) {
    return (
      <VStack
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        navigationTitle={chapter.title}
      >
        <ProgressView />
        <Text font="footnote" foregroundStyle="secondaryLabel">
          正在加载正文...
        </Text>
      </VStack>
    )
  }

  if (error) {
    return (
      <List navigationTitle={chapter.title}>
        <Section header={<Text>加载失败</Text>}>
          <Text>{error}</Text>
          <Button
            title="重新加载"
            action={() => {
              removeChapterCache(chapter.contentUrl)
              setReloadToken((value) => value + 1)
            }}
          />
        </Section>
      </List>
    )
  }

  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: Infinity, maxHeight: Infinity }}
      navigationTitle={chapter.title}
      toolbar={{
        topBarLeading: <Button
          title="目录"
          action={() => {
            setShowChapters(true)
          }}
        />,
        topBarTrailing: [
          <Button
            key="reload"
            title="重载"
            systemImage="arrow.triangle.2.circlepath"
            action={() => {
              removeChapterCache(chapter.contentUrl)
              setReloadToken((value) => value + 1)
            }}
          />,
          <Button
            key="settings"
            title="Aa"
            action={() => {
              setShowSettings(true)
            }}
          />,
        ],
      }}
      navigationContainerBackground={<Rectangle fill={effectiveBackgroundColor as Color} />}
      sheet={[
        {
          isPresented: showSettings,
          onChanged: setShowSettings,
          content: <ReaderSettingsPage
            onSaved={(next) => {
              setPreferences(next)
            }}
            previewText={previewSample}
            presentationDetents={["medium", "large"]}
            presentationDragIndicator="visible"
            presentationCompactAdaptation="sheet"
          />,
        },
        {
          isPresented: showChapters,
          onChanged: setShowChapters,
          content: <ChapterPickerPage
            chapters={chapters}
            currentIndex={currentIndex}
            onSelect={setCurrentIndex}
          />,
        },
      ]}
    >
      <ScrollView
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        background={<Rectangle fill={effectiveBackgroundColor as any} />}
      >
        <VStack
          alignment="leading"
          frame={{ maxWidth: Infinity, minHeight: 1200 }}
          padding={{ top: 24, horizontal: preferences.horizontalPadding, bottom: 28 }}
          spacing={18}
        >
          <Text
            font="footnote"
            foregroundStyle="secondaryLabel"
          >
            {book.title} · {source.bookSourceName}
          </Text>
          <Text
            font="headline"
            fontWeight="semibold"
            fontDesign={preferences.fontDesign}
            foregroundStyle={effectiveTextColor as any}
          >
            {chapter.title}
          </Text>
          <Text
            styledText={{
              content: content || "没有可显示的正文内容。",
              font: preferences.customFontName
                ? { name: preferences.customFontName, size: preferences.fontSize }
                : preferences.fontSize,
              fontDesign: preferences.customFontName ? undefined : preferences.fontDesign,
              foregroundColor: effectiveTextColor as any,
              paragraphStyle: {
                alignment: preferences.textAlignment,
                paragraphSpacing: preferences.paragraphSpacing,
                firstLineHeadIndent: preferences.firstLineHeadIndent,
                lineSpacing: preferences.lineSpacing,
              },
            }}
            textSelection
          />
        </VStack>
      </ScrollView>

      {ttsState !== "idle" ? (
        <HStack
          padding={{ horizontal: 16, vertical: 10 }}
          spacing={10}
          background={<Rectangle fill={surfaceColor as any} />}
        >
          <Image
            systemName={ttsState === "paused" ? "speaker.slash" : "speaker.wave.2.fill"}
            foregroundStyle={effectiveTextColor as any}
          />
          <VStack alignment="leading" spacing={1}>
            <Text font="footnote" fontWeight="semibold" foregroundStyle={effectiveTextColor as any}>
              {ttsState === "paused" ? "朗读已暂停" : "正在朗读"}
            </Text>
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {preferences.tts.autoNextChapter ? "章末自动续章" : "单章朗读"} · 语速 {preferences.tts.rate.toFixed(2)}
            </Text>
          </VStack>
          <Spacer />
          <Button
            title="停止"
            systemImage="stop.circle"
            role="destructive"
            action={() => {
              handleStopSpeak()
            }}
          />
        </HStack>
      ) : undefined}

      <HStack
        padding={{ horizontal: 16, vertical: 12 }}
        spacing={12}
        background={<Rectangle fill={effectiveBackgroundColor as any} />}
        tint="label"
      >
        <Button
          title="上一章"
          disabled={!hasPrevious}
          action={() => {
            if (hasPrevious) {
              if (ttsController.state !== "idle") {
                pendingAutoSpeakRef.current = true
              }
              setCurrentIndex((value) => Math.max(value - 1, 0))
            }
          }}
        />
        <Spacer />
        <Button
          title={ttsState === "speaking" ? "暂停朗读" : ttsState === "paused" ? "继续朗读" : "朗读"}
          systemImage={speakSystemImage}
          action={() => {
            handleToggleSpeak()
          }}
        />
        <Text font="caption" foregroundStyle="secondaryLabel">
          {currentIndex + 1} / {chapters.length}
        </Text>
        <Spacer />
        <Button
          title="下一章"
          disabled={!hasNext}
          action={() => {
            if (hasNext) {
              if (ttsController.state !== "idle") {
                pendingAutoSpeakRef.current = true
              }
              setCurrentIndex((value) => Math.min(value + 1, chapters.length - 1))
            }
          }}
        />
      </HStack>
    </VStack>
  )
}
