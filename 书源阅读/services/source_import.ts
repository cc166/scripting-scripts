import {
  HtmlRuleSet,
  ImportedSourcePayload,
  LegadoLikeBookSource,
  StoredBookSource,
} from "../types"

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function looksLikeLegadoSource(input: Record<string, any>): input is LegadoLikeBookSource {
  return Boolean(
    input.searchUrl
    || input.ruleSearch
    || input.ruleBookInfo
    || input.ruleToc
    || input.ruleContent,
  )
}

function inferRuleValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function buildHtmlRuleSetFromLegado(source: LegadoLikeBookSource): HtmlRuleSet | undefined {
  const ruleSearch = source.ruleSearch ?? {}
  const ruleBookInfo = source.ruleBookInfo ?? {}
  const ruleToc = source.ruleToc ?? {}
  const ruleContent = source.ruleContent ?? {}

  const searchUrl = inferRuleValue(source.searchUrl)
  const searchList = inferRuleValue(ruleSearch.bookList)
  const searchTitle = inferRuleValue(ruleSearch.name)
  const searchBookUrl = inferRuleValue(ruleSearch.bookUrl)
  const contentText = inferRuleValue(ruleContent.content)
  const replaceRegex = Array.isArray(ruleContent.replaceRegex)
    ? ruleContent.replaceRegex.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined
  const nextContentUrl = inferRuleValue(ruleContent.nextContentUrl)

  if (!searchUrl || !searchList || !searchTitle || !searchBookUrl || !contentText) {
    return undefined
  }

  const rules: HtmlRuleSet = {
    search: {
      url: searchUrl.replaceAll("{{searchKey}}", "{{key}}"),
      list: searchList,
      title: searchTitle,
      detailUrl: searchBookUrl,
      author: inferRuleValue(ruleSearch.author),
      summary: inferRuleValue(ruleSearch.intro),
      cover: inferRuleValue(ruleSearch.coverUrl),
      language: inferRuleValue(ruleSearch.kind),
    },
    content: {
      text: contentText,
      replaceRegex,
      nextContentUrl,
    },
  }

  const detailSummary = inferRuleValue(ruleBookInfo.intro)
  const detailCover = inferRuleValue(ruleBookInfo.coverUrl)
  const detailTocUrl = inferRuleValue(ruleBookInfo.tocUrl)

  if (detailSummary || detailCover || detailTocUrl) {
    rules.detail = {
      summary: detailSummary,
      cover: detailCover,
      tocUrl: detailTocUrl,
    }
  }

  const tocList = inferRuleValue(ruleToc.chapterList)
  const tocTitle = inferRuleValue(ruleToc.chapterName)
  const tocUrl = inferRuleValue(ruleToc.chapterUrl)

  if (tocList && tocTitle && tocUrl) {
    rules.toc = {
      list: tocList,
      title: tocTitle,
      contentUrl: tocUrl,
    }
  }

  return rules
}

function normalizeHtmlRuleSource(input: Partial<StoredBookSource>, index: number): StoredBookSource {
  const adapter = input.adapter === "gutendex"
    ? "gutendex"
    : input.adapter === "htmlRule"
      ? "htmlRule"
      : input.bookSourceUrl?.includes("gutendex.com")
        ? "gutendex"
        : "htmlRule"

  const id = input.id?.trim() || `custom-${Date.now()}-${index}`

  return {
    id,
    bookSourceName: input.bookSourceName?.trim() || `自定义书源 ${index + 1}`,
    bookSourceUrl: input.bookSourceUrl?.trim() || "https://gutendex.com",
    bookSourceGroup: input.bookSourceGroup?.trim() || "自定义",
    adapter,
    enabled: input.enabled ?? true,
    builtin: false,
    notes: input.notes?.trim(),
    header: input.header,
    rules: input.rules,
  }
}

function normalizeLegadoSource(input: LegadoLikeBookSource, index: number): StoredBookSource {
  const rules = buildHtmlRuleSetFromLegado(input)
  const id = inferRuleValue(input.id) || `legado-${Date.now()}-${index}`

  const notes = [
    "从 Legado 风格字段自动映射而来。",
    "当前仅兼容 HTML + CSS 选择器子集，不支持 JSONPath / XPath / JS 规则。",
  ].join(" ")

  return {
    id,
    bookSourceName: inferRuleValue(input.bookSourceName) || `Legado 书源 ${index + 1}`,
    bookSourceUrl: inferRuleValue(input.bookSourceUrl) || "https://example.com",
    bookSourceGroup: inferRuleValue(input.bookSourceGroup) || "Legado 导入",
    adapter: "htmlRule",
    enabled: input.enabled ?? true,
    builtin: false,
    header: input.header,
    notes: rules ? notes : `${notes} 当前这条书源缺少可映射的关键字段，导入后仍需手工补 rules。`,
    rules,
  }
}

export function normalizeImportedSources(payload: ImportedSourcePayload): StoredBookSource[] {
  const list = Array.isArray(payload) ? payload : [payload]

  return list.map((item, index) => {
    if (isPlainObject(item) && looksLikeLegadoSource(item)) {
      return normalizeLegadoSource(item, index)
    }

    return normalizeHtmlRuleSource(item as Partial<StoredBookSource>, index)
  })
}
