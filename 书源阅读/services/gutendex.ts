import { fetch } from "scripting"
import { BookChapter, SearchBook, StoredBookSource } from "../types"
import { cleanHtmlToText, normalizeMultilineText, truncate } from "../utils/text"

type GutendexAuthor = {
  name?: string
}

type GutendexBook = {
  id: number
  title?: string
  summaries?: string[]
  authors?: GutendexAuthor[]
  languages?: string[]
  formats?: Record<string, string>
}

type GutendexResponse = {
  results?: GutendexBook[]
}

function mapAuthors(authors?: GutendexAuthor[]): string {
  const names = (authors ?? [])
    .map((item) => item.name?.trim())
    .filter((item): item is string => Boolean(item))

  return names.length > 0 ? names.join(", ") : "Unknown"
}

function firstAvailableFormat(formats: Record<string, string> = {}): {
  url: string
  type: "text" | "html"
} | null {
  const plainTextKeys = [
    "text/plain; charset=utf-8",
    "text/plain; charset=us-ascii",
    "text/plain",
  ]
  const htmlKeys = [
    "text/html; charset=utf-8",
    "text/html",
  ]

  for (const key of plainTextKeys) {
    if (formats[key]) {
      return {
        url: formats[key],
        type: "text",
      }
    }
  }

  for (const key of htmlKeys) {
    if (formats[key]) {
      return {
        url: formats[key],
        type: "html",
      }
    }
  }

  return null
}

function toSearchBook(source: StoredBookSource, item: GutendexBook): SearchBook {
  return {
    id: String(item.id),
    sourceId: source.id,
    title: item.title?.trim() || "Untitled",
    author: mapAuthors(item.authors),
    summary: truncate(item.summaries?.[0], 160),
    cover: item.formats?.["image/jpeg"],
    language: item.languages?.[0],
    raw: item as Record<string, any>,
  }
}

export async function searchGutendexBooks(
  source: StoredBookSource,
  keyword: string,
): Promise<SearchBook[]> {
  const url = `${source.bookSourceUrl.replace(/\/$/, "")}/books?search=${encodeURIComponent(keyword)}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`搜索失败（HTTP ${response.status}）`)
  }

  const payload = await response.json() as GutendexResponse
  return (payload.results ?? []).map((item) => toSearchBook(source, item))
}

export async function loadGutendexChapters(book: SearchBook): Promise<BookChapter[]> {
  const raw = book.raw ?? {}
  const format = firstAvailableFormat((raw.formats ?? {}) as Record<string, string>)

  if (!format) {
    return []
  }

  return [
    {
      id: `${book.id}-full-text`,
      title: "正文",
      contentUrl: format.url,
      contentType: format.type,
    },
  ]
}

export async function loadGutendexChapterContent(chapter: BookChapter): Promise<string> {
  const response = await fetch(chapter.contentUrl)
  if (!response.ok) {
    throw new Error(`正文加载失败（HTTP ${response.status}）`)
  }

  const body = await response.text()
  if (chapter.contentType === "html") {
    return normalizeMultilineText(cleanHtmlToText(body))
  }

  return normalizeMultilineText(body)
}
