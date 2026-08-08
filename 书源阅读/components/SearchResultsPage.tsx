import { ContentUnavailableView, List, NavigationLink, ProgressView, Section, Text, VStack, useEffect, useState } from "scripting"
import { searchBooks } from "../services/book_service"
import { getReadingProgress, isBookOnBookshelf, makeStoredBookKey } from "../storage"
import { SearchBook, StoredBookSource } from "../types"
import { BookDetailPage } from "./BookDetailPage"

export function SearchResultsPage({
  source,
  keyword,
}: {
  source: StoredBookSource
  keyword: string
}) {
  const [results, setResults] = useState<SearchBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError("")
        const nextResults = await searchBooks(source, keyword.trim())
        if (cancelled) return
        setResults(nextResults)
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
  }, [keyword, source.id])

  if (loading) {
    return (
      <VStack
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        navigationTitle={`搜索：${keyword}`}
      >
        <ProgressView />
        <Text font="footnote" foregroundStyle="secondaryLabel">
          正在搜索...
        </Text>
      </VStack>
    )
  }

  if (error) {
    return (
      <List navigationTitle={`搜索：${keyword}`}>
        <Section header={<Text>搜索失败</Text>}>
          <Text>{error}</Text>
        </Section>
      </List>
    )
  }

  if (results.length === 0) {
    return (
      <ContentUnavailableView
        title="没有搜索结果"
        systemImage="books.vertical"
        description="请换一个关键词，或稍后更换书源再试。"
      />
    )
  }

  return (
    <List navigationTitle={`搜索：${keyword}`}>
      <Section header={<Text>{source.bookSourceName}</Text>}>
        {results.map((book) => (
          (() => {
            const bookKey = makeStoredBookKey(source.id, book.id, String(book.raw?.detailUrl ?? ""))
            const progress = getReadingProgress(bookKey)
            const onShelf = isBookOnBookshelf(bookKey)

            return (
              <NavigationLink
                key={book.id}
                destination={<BookDetailPage source={source} book={book} />}
              >
                <Text>{book.title}</Text>
                <Text font="footnote" foregroundStyle="secondaryLabel">
                  {book.author}
                </Text>
                {book.summary ? (
                  <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                    {book.summary}
                  </Text>
                ) : undefined}
                {onShelf || progress ? (
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {[onShelf ? "已在书架" : "", progress ? `进度：${progress.chapterTitle}` : ""].filter(Boolean).join(" · ")}
                  </Text>
                ) : undefined}
              </NavigationLink>
            )
          })()
        ))}
      </Section>
    </List>
  )
}
