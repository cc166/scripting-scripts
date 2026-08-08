import { Button, List, NavigationLink, ProgressView, Section, Text, Toggle, VStack, useEffect, useState } from "scripting"
import { loadBookChapters, loadChapterContent } from "../services/book_service"
import {
  addToBookshelf,
  getDownloadedBook,
  getReadingProgress,
  isBookOnBookshelf,
  makeStoredBookKey,
  readTocCache,
  removeFromBookshelf,
  saveChapterCache,
  saveDownloadedBook,
  saveTocCache,
} from "../storage"
import { BookChapter, SearchBook, StoredBookSource } from "../types"
import { ReaderPage } from "./ReaderPage"

export function BookDetailPage({
  source,
  book,
}: {
  source: StoredBookSource
  book: SearchBook
}) {
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reversed, setReversed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState("")
  const bookKey = makeStoredBookKey(source.id, book.id, String(book.raw?.detailUrl || ""))
  const [onShelf, setOnShelf] = useState(() => isBookOnBookshelf(bookKey))
  const progress = getReadingProgress(bookKey)
  const download = getDownloadedBook(bookKey)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError("")
        const cacheKey = bookKey
        const cached = readTocCache(cacheKey)
        if (cached) {
          setChapters(cached)
          setLoading(false)
          return
        }
        const nextChapters = await loadBookChapters(source, book)
        if (cancelled) return
        saveTocCache(cacheKey, nextChapters)
        setChapters(nextChapters)
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
  }, [book.id, bookKey, source.id])

  async function downloadBook() {
    if (chapters.length === 0) return
    setDownloading(true)
    setDownloadMessage("开始离线缓存...")
    let completed = 0

    for (const chapter of chapters) {
      try {
        const content = await loadChapterContent(source, chapter)
        saveChapterCache(chapter.contentUrl, content)
        completed += 1
        setDownloadMessage(`已缓存 ${completed}/${chapters.length}`)
        saveDownloadedBook({
          key: bookKey,
          sourceId: source.id,
          sourceName: source.bookSourceName,
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author,
          detailUrl: String(book.raw?.detailUrl ?? ""),
          chapterCount: chapters.length,
          downloadedCount: completed,
          updatedAt: new Date().toISOString(),
          status: completed === chapters.length ? "completed" : "downloading",
        })
      } catch {
        setDownloadMessage(`缓存中断，已完成 ${completed}/${chapters.length}`)
        break
      }
    }

    setDownloading(false)
    if (completed === chapters.length) {
      setDownloadMessage(`离线缓存完成，共 ${completed} 章。`)
    }
  }

  const displayedChapters = reversed
    ? chapters.map((chapter, index) => ({ chapter, index })).reverse()
    : chapters.map((chapter, index) => ({ chapter, index }))

  if (loading) {
    return (
      <VStack
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        navigationTitle={book.title}
      >
        <ProgressView />
        <Text font="footnote" foregroundStyle="secondaryLabel">
          正在加载书籍信息...
        </Text>
      </VStack>
    )
  }

  return (
    <List navigationTitle={book.title}>
      <Section header={<Text>书籍信息</Text>}>
        <Text>{book.title}</Text>
        <Text>{book.author}</Text>
        {book.language ? <Text>语言：{book.language}</Text> : undefined}
        {book.summary ? <Text>{book.summary}</Text> : undefined}
      </Section>

      <Section header={<Text>操作</Text>}>
        <Button
          title={onShelf ? "移出书架" : "加入书架"}
          action={() => {
            if (onShelf) {
              removeFromBookshelf(bookKey)
              setOnShelf(false)
            } else {
              addToBookshelf({
                key: bookKey,
                sourceId: source.id,
                sourceName: source.bookSourceName,
                bookId: book.id,
                bookTitle: book.title,
                bookAuthor: book.author,
                detailUrl: String(book.raw?.detailUrl ?? ""),
                cover: book.cover,
                summary: book.summary,
                lastReadAt: progress?.updatedAt,
              })
              setOnShelf(true)
            }
          }}
        />
        {progress ? (
          <NavigationLink
            title={`从 ${progress.chapterTitle} 继续阅读`}
            destination={<ReaderPage source={source} book={book} chapters={chapters} initialIndex={Math.max(0, progress.chapterIndex)} />}
          />
        ) : undefined}
        <Button
          title={downloading ? "正在离线缓存" : "下载整本到缓存"}
          disabled={downloading || chapters.length === 0}
          action={downloadBook}
        />
        {download ? (
          <Text>已缓存：{download.downloadedCount}/{download.chapterCount}</Text>
        ) : undefined}
        {downloadMessage ? <Text>{downloadMessage}</Text> : undefined}
      </Section>

      {error ? (
        <Section header={<Text>目录加载失败</Text>}>
          <Text>{error}</Text>
        </Section>
      ) : chapters.length === 0 ? (
        <Section header={<Text>目录</Text>}>
          <Text>当前书源没有返回章节信息。</Text>
        </Section>
      ) : (
        <>
          <Section header={<Text>目录选项</Text>}>
            <Toggle title="倒序目录" value={reversed} onChanged={setReversed} />
          </Section>
          <Section header={<Text>目录</Text>}>
            {displayedChapters.map(({ chapter, index }) => (
              <NavigationLink
                key={chapter.id}
                destination={<ReaderPage source={source} book={book} chapters={chapters} initialIndex={index} />}
              >
                <VStack spacing={4} alignment="leading">
                  <Text fontWeight={progress?.chapterId === chapter.id ? "semibold" : "regular"}>
                    {chapter.title}
                  </Text>
                  {progress?.chapterId === chapter.id ? (
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      当前阅读到这里
                    </Text>
                  ) : undefined}
                </VStack>
              </NavigationLink>
            ))}
          </Section>
        </>
      )}
    </List>
  )
}
