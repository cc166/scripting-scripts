import {
  BookChapter,
  HtmlRuleDetailConfig,
  HtmlRuleSearchConfig,
  HtmlRuleTocConfig,
  SearchBook,
  StoredBookSource,
} from "../types"
import { fetchDocument, resolveRelativeUrl } from "./request"
import { cleanHtmlToText, normalizeMultilineText, truncate } from "../utils/text"

type SearchResultRow = {
  title: string
  detailUrl: string
  author?: string
  summary?: string
  cover?: string
  language?: string
}

type DetailResult = {
  summary?: string
  cover?: string
  chapterTitle?: string
  tocUrl?: string
  contentUrl?: string
}

type TocResultRow = {
  title: string
  contentUrl: string
}

type ContentResult = {
  text: string
  nextContentUrl?: string
}

function encodeHtml(html: string): string {
  return JSON.stringify(html)
}

function encodeString(value: string): string {
  return JSON.stringify(value)
}

function buildExtractHelpers(): string {
  return `
function splitRuleCleanup(rule) {
  const marker = "##"
  const index = rule.indexOf(marker)
  if (index === -1) {
    return { coreRule: rule, cleanup: "" }
  }
  return {
    coreRule: rule.slice(0, index),
    cleanup: rule.slice(index + marker.length),
  }
}

function applyCleanup(value, cleanup) {
  if (!cleanup) return value
  try {
    return value.replace(new RegExp(cleanup, "g"), "").trim()
  } catch {
    return value.replaceAll(cleanup, "").trim()
  }
}

function isXPathRule(rule) {
  if (!rule) return false
  return rule.startsWith("@XPath:") || rule.startsWith("//") || rule.startsWith(".//")
}

function normalizeXPathRule(rule) {
  if (rule.startsWith("@XPath:")) return rule.slice(7)
  return rule
}

function xpathString(target, rule) {
  const expression = normalizeXPathRule(rule)
  const result = document.evaluate(
    expression,
    target,
    null,
    XPathResult.STRING_TYPE,
    null
  )
  return (result.stringValue || "").trim()
}

function xpathNodes(target, rule) {
  const expression = normalizeXPathRule(rule)
  const snapshot = document.evaluate(
    expression,
    target,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  )
  return Array.from({ length: snapshot.snapshotLength }, (_, index) => snapshot.snapshotItem(index)).filter(Boolean)
}

function readCssRule(target, rule, baseUrl) {
  const { coreRule, cleanup } = splitRuleCleanup(rule)
  const [selector, suffix = "text"] = coreRule.split("@")
  const node = selector ? target.querySelector(selector) : target
  if (!node) return ""
  if (suffix === "html") return applyCleanup((node.innerHTML || "").trim(), cleanup)
  if (suffix === "text") return applyCleanup((node.textContent || "").trim(), cleanup)
  const raw = node.getAttribute(suffix) || ""
  if (!raw) return ""
  try {
    return applyCleanup(new URL(raw, baseUrl).toString(), cleanup)
  } catch {
    return applyCleanup(raw.trim(), cleanup)
  }
}

function readRule(target, rule, baseUrl, asUrl) {
  if (!rule) return ""
  const { coreRule, cleanup } = splitRuleCleanup(rule)

  if (isXPathRule(coreRule)) {
    const xpathValue = xpathString(target, coreRule)
    if (!xpathValue) return ""
    if (asUrl) {
      try {
        return applyCleanup(new URL(xpathValue, baseUrl).toString(), cleanup)
      } catch {
        return applyCleanup(xpathValue, cleanup)
      }
    }
    return applyCleanup(xpathValue, cleanup)
  }

  return readCssRule(target, rule, baseUrl)
}

function listRule(target, rule) {
  if (!rule) return []
  const { coreRule } = splitRuleCleanup(rule)
  if (isXPathRule(coreRule)) {
    return xpathNodes(target, coreRule)
  }
  return Array.from(target.querySelectorAll(coreRule))
}
`
}

async function evaluateHtml<T>(html: string, baseUrl: string, expression: string): Promise<T> {
  const web = new WebViewController()
  try {
    await web.loadHTML(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>${html}</body>
</html>
`)
    return await web.evaluateJavaScript<T>(`
${buildExtractHelpers()}
const BASE_URL = ${encodeString(baseUrl)};
${expression}
`)
  } finally {
    web.dispose()
  }
}

function ensureRules(source: StoredBookSource) {
  if (!source.rules) {
    throw new Error("当前 htmlRule 书源缺少 rules 配置")
  }
  return source.rules
}

function applyReplaceRegex(content: string, replaceRegex: string[] | undefined): string {
  let result = content

  for (const item of replaceRegex ?? []) {
    const [pattern, replacement = ""] = item.includes("##")
      ? item.split("##")
      : [item, ""]

    try {
      result = result.replace(new RegExp(pattern, "g"), replacement)
    } catch {
      result = result.replaceAll(pattern, replacement)
    }
  }

  return result
}

function isJsonRule(rule: string | undefined): boolean {
  if (!rule) return false
  return rule.startsWith("@JSON:") || rule.startsWith("$")
}

function normalizeJsonRule(rule: string): string {
  if (rule.startsWith("@JSON:")) return rule.slice(6)
  return rule
}

function parseJsonPath(rule: string): ("$" | string | number | "*")[] {
  const path = normalizeJsonRule(rule).trim()
  const tokens: ("$" | string | number | "*")[] = ["$"]
  let i = path.startsWith("$") ? 1 : 0

  while (i < path.length) {
    const char = path[i]
    if (char === ".") {
      i += 1
      let value = ""
      while (i < path.length && /[A-Za-z0-9_$]/.test(path[i])) {
        value += path[i]
        i += 1
      }
      if (value) tokens.push(value)
      continue
    }
    if (char === "[") {
      const close = path.indexOf("]", i)
      if (close === -1) break
      const raw = path.slice(i + 1, close).trim()
      if (raw === "*") {
        tokens.push("*")
      } else if (/^\d+$/.test(raw)) {
        tokens.push(Number(raw))
      } else {
        tokens.push(raw.replace(/^['"]|['"]$/g, ""))
      }
      i = close + 1
      continue
    }
    if (/[A-Za-z_$]/.test(char)) {
      let value = ""
      while (i < path.length && /[A-Za-z0-9_$]/.test(path[i])) {
        value += path[i]
        i += 1
      }
      if (value) tokens.push(value)
      continue
    }
    i += 1
  }

  return tokens
}

function getJsonValues(target: any, rule: string): any[] {
  const tokens = parseJsonPath(rule)
  let current: any[] = [target]

  for (const token of tokens) {
    if (token === "$") continue

    if (token === "*") {
      current = current.flatMap((item) => {
        if (Array.isArray(item)) return item
        if (item && typeof item === "object") return Object.values(item)
        return []
      })
      continue
    }

    if (typeof token === "number") {
      current = current
        .map((item) => Array.isArray(item) ? item[token] : undefined)
        .filter((item) => item !== undefined)
      continue
    }

    current = current
      .map((item) => item && typeof item === "object" ? item[token] : undefined)
      .filter((item) => item !== undefined)
  }

  return current
}

function readJsonRule(target: any, rule: string, baseUrl: string, asUrl = false): string {
  const marker = "##"
  const index = rule.indexOf(marker)
  const coreRule = index === -1 ? rule : rule.slice(0, index)
  const cleanup = index === -1 ? "" : rule.slice(index + marker.length)
  const value = getJsonValues(target, coreRule)[0]
  if (value == null) return ""
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (asUrl) {
      const resolved = resolveRelativeUrl(trimmed, baseUrl)
      if (!cleanup) return resolved
      try {
        return resolved.replace(new RegExp(cleanup, "g"), "").trim()
      } catch {
        return resolved.replaceAll(cleanup, "").trim()
      }
    }
    if (!cleanup) return trimmed
    try {
      return trimmed.replace(new RegExp(cleanup, "g"), "").trim()
    } catch {
      return trimmed.replaceAll(cleanup, "").trim()
    }
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return JSON.stringify(value)
}

function listJsonRule(target: any, rule: string): any[] {
  return getJsonValues(target, rule)
}

function buildSearchUrl(config: HtmlRuleSearchConfig, keyword: string): string {
  return config.url.replaceAll("{{key}}", encodeURIComponent(keyword.trim()))
}

async function parseSearchResults(
  document: { text: string; url: string; isJson: boolean; json?: any },
  config: HtmlRuleSearchConfig,
): Promise<SearchResultRow[]> {
  if (document.isJson && isJsonRule(config.list)) {
    return listJsonRule(document.json, config.list).map((item) => ({
      title: readJsonRule(item, config.title, document.url),
      detailUrl: readJsonRule(item, config.detailUrl, document.url, true),
      author: config.author ? readJsonRule(item, config.author, document.url) : "",
      summary: config.summary ? readJsonRule(item, config.summary, document.url) : "",
      cover: config.cover ? readJsonRule(item, config.cover, document.url, true) : "",
      language: config.language ? readJsonRule(item, config.language, document.url) : "",
    })).filter((item) => item.title && item.detailUrl)
  }

  return evaluateHtml<SearchResultRow[]>(document.text, document.url, `
const root = document.createElement("div");
root.innerHTML = ${encodeHtml(document.text)};
return listRule(root, ${encodeString(config.list)}).map((item) => ({
  title: readRule(item, ${encodeString(config.title)}, BASE_URL, false),
  detailUrl: readRule(item, ${encodeString(config.detailUrl)}, BASE_URL, true),
  author: ${config.author ? `readRule(item, ${encodeString(config.author)}, BASE_URL, false)` : '""'},
  summary: ${config.summary ? `readRule(item, ${encodeString(config.summary)}, BASE_URL, false)` : '""'},
  cover: ${config.cover ? `readRule(item, ${encodeString(config.cover)}, BASE_URL, true)` : '""'},
  language: ${config.language ? `readRule(item, ${encodeString(config.language)}, BASE_URL, false)` : '""'},
})).filter((item) => item.title && item.detailUrl);
`)
}

async function parseDetail(
  document: { text: string; url: string; isJson: boolean; json?: any },
  config: HtmlRuleDetailConfig | undefined,
): Promise<DetailResult> {
  if (!config) {
    return {}
  }

  if (document.isJson && (
    isJsonRule(config.summary)
    || isJsonRule(config.cover)
    || isJsonRule(config.chapterTitle)
    || isJsonRule(config.tocUrl)
    || isJsonRule(config.contentUrl)
  )) {
    return {
      summary: config.summary ? readJsonRule(document.json, config.summary, document.url) : "",
      cover: config.cover ? readJsonRule(document.json, config.cover, document.url, true) : "",
      chapterTitle: config.chapterTitle ? readJsonRule(document.json, config.chapterTitle, document.url) : "",
      tocUrl: config.tocUrl ? readJsonRule(document.json, config.tocUrl, document.url, true) : "",
      contentUrl: config.contentUrl ? readJsonRule(document.json, config.contentUrl, document.url, true) : "",
    }
  }

  return evaluateHtml<DetailResult>(document.text, document.url, `
const root = document.createElement("div");
root.innerHTML = ${encodeHtml(document.text)};
return {
  summary: ${config.summary ? `readRule(root, ${encodeString(config.summary)}, BASE_URL, false)` : '""'},
  cover: ${config.cover ? `readRule(root, ${encodeString(config.cover)}, BASE_URL, true)` : '""'},
  chapterTitle: ${config.chapterTitle ? `readRule(root, ${encodeString(config.chapterTitle)}, BASE_URL, false)` : '""'},
  tocUrl: ${config.tocUrl ? `readRule(root, ${encodeString(config.tocUrl)}, BASE_URL, true)` : '""'},
  contentUrl: ${config.contentUrl ? `readRule(root, ${encodeString(config.contentUrl)}, BASE_URL, true)` : '""'},
};
`)
}

async function parseContent(
  document: { text: string; url: string; isJson: boolean; json?: any },
  textRule: string,
  nextContentUrlRule?: string,
): Promise<ContentResult> {
  if (document.isJson && isJsonRule(textRule)) {
    return {
      text: readJsonRule(document.json, textRule, document.url),
      nextContentUrl: nextContentUrlRule ? readJsonRule(document.json, nextContentUrlRule, document.url, true) : "",
    }
  }

  return evaluateHtml<ContentResult>(document.text, document.url, `
const root = document.createElement("div");
root.innerHTML = ${encodeHtml(document.text)};
return {
  text: readRule(root, ${encodeString(textRule)}, BASE_URL, false),
  nextContentUrl: ${nextContentUrlRule ? `readRule(root, ${encodeString(nextContentUrlRule)}, BASE_URL, true)` : '""'},
};
`)
}

async function parseToc(
  document: { text: string; url: string; isJson: boolean; json?: any },
  config: HtmlRuleTocConfig | undefined,
): Promise<TocResultRow[]> {
  if (!config) {
    return []
  }

  if (document.isJson && isJsonRule(config.list)) {
    return listJsonRule(document.json, config.list).map((item) => ({
      title: readJsonRule(item, config.title, document.url),
      contentUrl: readJsonRule(item, config.contentUrl, document.url, true),
    })).filter((item) => item.title && item.contentUrl)
  }

  return evaluateHtml<TocResultRow[]>(document.text, document.url, `
const root = document.createElement("div");
root.innerHTML = ${encodeHtml(document.text)};
return listRule(root, ${encodeString(config.list)}).map((item) => ({
  title: readRule(item, ${encodeString(config.title)}, BASE_URL, false),
  contentUrl: readRule(item, ${encodeString(config.contentUrl)}, BASE_URL, true),
})).filter((item) => item.title && item.contentUrl);
`)
}

function toBook(source: StoredBookSource, row: SearchResultRow): SearchBook {
  return {
    id: row.detailUrl,
    sourceId: source.id,
    title: row.title,
    author: row.author || "Unknown",
    summary: truncate(row.summary, 160),
    cover: row.cover,
    language: row.language,
    raw: {
      detailUrl: row.detailUrl,
      summary: row.summary,
      cover: row.cover,
      language: row.language,
    },
  }
}

export async function searchHtmlRuleBooks(
  source: StoredBookSource,
  keyword: string,
): Promise<SearchBook[]> {
  const rules = ensureRules(source)
  const searchUrl = buildSearchUrl(rules.search, keyword)
  const document = await fetchDocument(source, searchUrl, { key: keyword.trim() })
  const rows = await parseSearchResults(document, rules.search)
  return rows.map((item) => toBook(source, item))
}

export async function loadHtmlRuleChapters(
  source: StoredBookSource,
  book: SearchBook,
): Promise<BookChapter[]> {
  const rules = ensureRules(source)
  const detailUrl = String(book.raw?.detailUrl || book.id)
  const detailDocument = await fetchDocument(source, detailUrl, {}, detailUrl)
  const detail = await parseDetail(detailDocument, rules.detail)
  const tocDocument = detail.tocUrl
    ? await fetchDocument(source, detail.tocUrl, {}, detailUrl)
    : detailDocument
  const tocItems = await parseToc(tocDocument, rules.toc)

  if (tocItems.length > 0) {
    return tocItems.map((item, index) => ({
      id: `${book.id}#chapter-${index}`,
      title: item.title,
      contentUrl: item.contentUrl,
      contentType: "html",
    }))
  }

  const contentUrl = detail.contentUrl || detailUrl
  const chapterTitle = detail.chapterTitle || "正文"

  return [
    {
      id: `${book.id}#content`,
      title: chapterTitle,
      contentUrl,
      contentType: "html",
    },
  ]
}

export async function loadHtmlRuleChapterContent(
  source: StoredBookSource,
  chapter: BookChapter,
): Promise<string> {
  const rules = ensureRules(source)
  const segments: string[] = []
  let currentUrl: string | undefined = chapter.contentUrl
  let pages = 0

  while (currentUrl && pages < 5) {
    const document = await fetchDocument(source, currentUrl, {}, currentUrl)
    const result = await parseContent(document, rules.content.text, rules.content.nextContentUrl)
    const rawText = result.text || document.text
    const text = rules.content.text.includes("@html")
      ? cleanHtmlToText(rawText)
      : rawText
    const replaced = applyReplaceRegex(text, rules.content.replaceRegex)
    if (replaced.trim()) {
      segments.push(replaced)
    }

    const nextUrl = result.nextContentUrl?.trim()
    if (!nextUrl || nextUrl === currentUrl) {
      break
    }

    currentUrl = nextUrl
    pages += 1
  }

  return normalizeMultilineText(segments.join("\n\n"))
}
