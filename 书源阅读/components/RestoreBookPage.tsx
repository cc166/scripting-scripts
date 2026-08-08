import { ContentUnavailableView, List, ProgressView, Section, Text, VStack, useEffect, useState } from "scripting"
import { loadBookChapters } from "../services/book_service"
import { getReadingProgress, getSourceById, makeStoredBookKey, readTocCache, saveTocCache } from "../storage"
import { BookChapter, BookReference, SearchBook, StoredBookSource } from "../types"
import { ReaderPage } from "./ReaderPage"

type RestoreTarget = BookReference & {
  chapterId?: string
  chapterTitle?: string
  chapterContentUrl?: string
  chapterContentType?: "text" | "html"
}

export function RestoreBookPage({
  source,
  target,
  title = "继续阅读",
}: {
  source?: StoredBookSource | null
  target: RestoreTarget
  title?: string
}) {
  const resolvedSource = source ?? getSourceById(target.sourceId)
  const [chapters, setChapters] = useState<BookChapter[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!resolvedSource) return
      try {
        const bookKey = makeStoredBookKey(target.sourceId, target.bookId, target.detailUrl)
        const cached = readTocCache(bookKey)
        if (cached && !cancelled) {
          setChapters(cached)
          return
        }

        if (!target.detailUrl) {
          setChapters(target.chapterId && target.chapterContentUrl ? [
            {
              id: target.chapterId,
              title: target.chapterTitle || "继续阅读",
              contentUrl: target.chapterContentUrl,
              contentType: target.chapterContentType || "html",
            },
          ] : [])
          return
        }

        const book: SearchBook = {
          id: target.bookId,
          sourceId: target.sourceId,
          title: target.bookTitle,
          author: target.bookAuthor || "",
          cover: target.cover,
          summary: target.summary,
          raw: {
            detailUrl: target.detailUrl,
          },
        }
        const loaded = await loadBookChapters(resolvedSource, book)
        if (cancelled) return
        saveTocCache(bookKey, loaded)
        setChapters(loaded)
      } catch (err) {
        if (!cancelled) {
          setError(String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    resolvedSource?.id,
    target.bookId,
    target.bookTitle,
    target.bookAuthor,
    target.chapterId,
    target.chapterTitle,
    target.chapterContentUrl,
    target.chapterContentType,
    target.cover,
    target.detailUrl,
    target.sourceId,
    target.summary,
  ])

  if (!resolvedSource) {
    return <ContentUnavailableView title="书源不存在" systemImage="books.vertical" description="对应书源可能已经被删除。" />
  }

  if (error) {
    return (
      <List navigationTitle={title}>
        <Section header={<Text>加载失败</Text>}>
          <Text>{error}</Text>
        </Section>
      </List>
    )
  }

  if (!chapters) {
    return (
      <VStack navigationTitle={title}>
        <ProgressView />
        <Text font="footnote" foregroundStyle="secondaryLabel">正在恢复阅读进度...</Text>
      </VStack>
    )
  }

  const bookKey = makeStoredBookKey(target.sourceId, target.bookId, target.detailUrl)
  const progress = getReadingProgress(bookKey)
  const index = Math.max(
    0,
    chapters.findIndex((item) =>
      item.id === progress?.chapterId
      || item.contentUrl === progress?.chapterContentUrl
      || item.id === target.chapterId
      || item.contentUrl === target.chapterContentUrl,
    ),
  )
  const book: SearchBook = {
    id: target.bookId,
    sourceId: target.sourceId,
    title: target.bookTitle,
    author: target.bookAuthor || "",
    cover: target.cover,
    summary: target.summary,
    raw: {
      detailUrl: target.detailUrl,
    },
  }

  return <ReaderPage source={resolvedSource} book={book} chapters={chapters} initialIndex={index} />
}
