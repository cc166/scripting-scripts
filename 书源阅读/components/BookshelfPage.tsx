import { Button, ContentUnavailableView, HStack, Image, List, NavigationLink, Section, Text, useState, VStack } from "scripting"
import { loadBookChapters, loadChapterContent } from "../services/book_service"
import {
  getDownloadedBook,
  getReadingProgress,
  getSourceById,
  listBookshelf,
  makeStoredBookKey,
  readTocCache,
  saveChapterCache,
  saveDownloadedBook,
  saveTocCache,
} from "../storage"
import { BookshelfItem, SearchBook } from "../types"
import { RestoreBookPage } from "./RestoreBookPage"

function BookshelfRow({
  item,
}: {
  item: BookshelfItem
}) {
  const source = getSourceById(item.sourceId)
  const bookKey = makeStoredBookKey(item.sourceId, item.bookId, item.detailUrl)
  const progress = getReadingProgress(bookKey)
  const initialDownload = getDownloadedBook(bookKey)
  const [downloadMessage, setDownloadMessage] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [downloadedCount, setDownloadedCount] = useState(initialDownload?.downloadedCount ?? 0)
  const [chapterCount, setChapterCount] = useState(initialDownload?.chapterCount ?? 0)

  async function continueDownload() {
    if (!source || !item.detailUrl) {
      setDownloadMessage("当前书籍缺少详情地址，暂时无法继续缓存。")
      return
    }

    setDownloading(true)
    setDownloadMessage("正在继续缓存...")

    try {
      const book: SearchBook = {
        id: item.bookId,
        sourceId: item.sourceId,
        title: item.bookTitle,
        author: item.bookAuthor || "",
        cover: item.cover,
        summary: item.summary,
        raw: {
          detailUrl: item.detailUrl,
        },
      }
      const chapters = readTocCache(bookKey) ?? await loadBookChapters(source, book)
      saveTocCache(bookKey, chapters)

      let completed = 0
      for (const chapter of chapters) {
        try {
          const content = await loadChapterContent(source, chapter)
          saveChapterCache(chapter.contentUrl, content)
          completed += 1
          setDownloadedCount(completed)
          setChapterCount(chapters.length)
          setDownloadMessage(`已缓存 ${completed}/${chapters.length}`)
          saveDownloadedBook({
            key: bookKey,
            sourceId: item.sourceId,
            sourceName: item.sourceName,
            bookId: item.bookId,
            bookTitle: item.bookTitle,
            bookAuthor: item.bookAuthor,
            detailUrl: item.detailUrl,
            chapterCount: chapters.length,
            downloadedCount: completed,
            updatedAt: new Date().toISOString(),
            status: completed === chapters.length ? "completed" : "downloading",
          })
        } catch {
          break
        }
      }

      if (completed === chapters.length) {
        setDownloadMessage(`缓存完成，共 ${completed} 章。`)
      }
    } catch (error) {
      setDownloadMessage(`缓存失败：${String(error)}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Section key={item.key} header={<Text>{item.bookTitle}</Text>}>
      <NavigationLink destination={<RestoreBookPage title="打开书籍" target={item} />}>
        <VStack spacing={6} alignment="leading">
          <HStack spacing={8}>
            <Image systemName="book.fill" foregroundStyle="#E47A44" />
            <Text fontWeight="semibold">
              {progress ? "继续阅读" : "打开书籍"}
            </Text>
          </HStack>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {item.bookAuthor || item.sourceName || "未知作者"}
          </Text>
          {progress ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              当前进度：{progress.chapterTitle} · {progress.chapterIndex + 1}/{progress.totalChapters}
            </Text>
          ) : (
            <Text font="caption" foregroundStyle="secondaryLabel">
              还没有阅读进度，点进后可以从目录开始阅读。
            </Text>
          )}
        </VStack>
      </NavigationLink>

      <Button
        title={downloading ? "正在缓存..." : (downloadedCount > 0 && downloadedCount < chapterCount ? "继续缓存整本" : "缓存整本到本地")}
        disabled={downloading}
        systemImage={downloading ? "arrow.triangle.2.circlepath" : "square.and.arrow.down"}
        action={continueDownload}
      />

      {(chapterCount > 0 || downloadedCount > 0) ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          离线缓存：{downloadedCount}/{chapterCount || "?"}
        </Text>
      ) : undefined}
      {downloadMessage ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          {downloadMessage}
        </Text>
      ) : undefined}
    </Section>
  )
}

export function BookshelfPage() {
  const items = listBookshelf()

  if (items.length === 0) {
    return <ContentUnavailableView title="书架为空" systemImage="books.vertical" description="在书籍详情页加入书架后，会显示在这里。" />
  }

  return (
    <List navigationTitle="书架">
      {items.map((item) => (
        <BookshelfRow key={item.key} item={item} />
      ))}
    </List>
  )
}
