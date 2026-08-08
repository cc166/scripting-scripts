import { BookChapter, SearchBook, StoredBookSource } from "../types"
import {
  loadGutendexChapterContent,
  loadGutendexChapters,
  searchGutendexBooks,
} from "./gutendex"
import {
  loadHtmlRuleChapterContent,
  loadHtmlRuleChapters,
  searchHtmlRuleBooks,
} from "./html_rule"

export async function searchBooks(
  source: StoredBookSource,
  keyword: string,
): Promise<SearchBook[]> {
  switch (source.adapter) {
    case "gutendex":
      return searchGutendexBooks(source, keyword)
    case "htmlRule":
      return searchHtmlRuleBooks(source, keyword)
    default:
      throw new Error(`暂不支持的书源适配器：${source.adapter satisfies never}`)
  }
}

export async function loadBookChapters(
  source: StoredBookSource,
  book: SearchBook,
): Promise<BookChapter[]> {
  switch (source.adapter) {
    case "gutendex":
      return loadGutendexChapters(book)
    case "htmlRule":
      return loadHtmlRuleChapters(source, book)
    default:
      throw new Error(`暂不支持的书源适配器：${source.adapter satisfies never}`)
  }
}

export async function loadChapterContent(
  source: StoredBookSource,
  chapter: BookChapter,
): Promise<string> {
  switch (source.adapter) {
    case "gutendex":
      return loadGutendexChapterContent(chapter)
    case "htmlRule":
      return loadHtmlRuleChapterContent(source, chapter)
    default:
      throw new Error(`暂不支持的书源适配器：${source.adapter satisfies never}`)
  }
}
