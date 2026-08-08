import { ContentUnavailableView } from "scripting"
import { getLastReading, getSourceById } from "../storage"
import { StoredBookSource } from "../types"
import { RestoreBookPage } from "./RestoreBookPage"

export function ResumeReadingPage({
  source,
}: {
  source?: StoredBookSource | null
}) {
  const lastReading = getLastReading()

  if (!lastReading) {
    return <ContentUnavailableView title="没有最近阅读记录" systemImage="book.closed" description="请先打开一本书。" />
  }

  return (
    <RestoreBookPage
      source={source ?? getSourceById(lastReading.sourceId)}
      title="继续阅读"
      target={{
        sourceId: lastReading.sourceId,
        sourceName: lastReading.sourceName,
        bookId: lastReading.bookId,
        bookTitle: lastReading.bookTitle,
        bookAuthor: lastReading.bookAuthor,
        detailUrl: lastReading.detailUrl,
        chapterId: lastReading.chapterId,
        chapterTitle: lastReading.chapterTitle,
        chapterContentUrl: lastReading.chapterContentUrl,
        chapterContentType: lastReading.chapterContentType,
      }}
    />
  )
}
