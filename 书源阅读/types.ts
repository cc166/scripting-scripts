export type SourceAdapter = "gutendex" | "htmlRule"

export type RuleValue = string

export type HtmlRuleSearchConfig = {
  url: string
  list: RuleValue
  title: RuleValue
  detailUrl: RuleValue
  author?: RuleValue
  summary?: RuleValue
  cover?: RuleValue
  language?: RuleValue
}

export type HtmlRuleDetailConfig = {
  summary?: RuleValue
  cover?: RuleValue
  chapterTitle?: RuleValue
  tocUrl?: RuleValue
  contentUrl?: RuleValue
}

export type HtmlRuleTocConfig = {
  list: RuleValue
  title: RuleValue
  contentUrl: RuleValue
}

export type HtmlRuleContentConfig = {
  text: RuleValue
  replaceRegex?: string[]
  nextContentUrl?: RuleValue
}

export type HtmlRuleSet = {
  search: HtmlRuleSearchConfig
  detail?: HtmlRuleDetailConfig
  toc?: HtmlRuleTocConfig
  content: HtmlRuleContentConfig
}

export type StoredBookSource = {
  id: string
  bookSourceName: string
  bookSourceUrl: string
  bookSourceGroup?: string
  adapter: SourceAdapter
  enabled: boolean
  builtin?: boolean
  notes?: string
  header?: string | Record<string, string>
  rules?: HtmlRuleSet
}

export type SearchBook = {
  id: string
  sourceId: string
  title: string
  author: string
  summary?: string
  cover?: string
  language?: string
  raw?: Record<string, any>
}

export type BookReference = {
  sourceId: string
  sourceName?: string
  bookId: string
  bookTitle: string
  bookAuthor?: string
  detailUrl?: string
  cover?: string
  summary?: string
}

export type BookChapter = {
  id: string
  title: string
  contentUrl: string
  contentType: "text" | "html"
}

export type ReadingSession = {
  sourceId: string
  sourceName: string
  bookId: string
  bookTitle: string
  bookAuthor?: string
  chapterId: string
  chapterTitle: string
  chapterContentUrl: string
  chapterContentType: "text" | "html"
  detailUrl?: string
  updatedAt: string
}

export type ReaderThemePreset = "paper" | "night" | "sepia" | "grass" | "ocean" | "custom"

export type TtsChapterPosition = {
  /** makeStoredBookKey 产生的书键 */
  bookKey: string
  chapterId: string
  /** 下次 speak 时应从正文的第几个字符开始（已对齐到句子开头） */
  charOffset: number
  /** 保存时正文的总长度，用于识别章节内容变化 */
  contentLength: number
  updatedAt: string
}

export type ReaderTtsPreferences = {
  voiceIdentifier: string
  rate: number
  pitch: number
  volume: number
  autoNextChapter: boolean
}

export type ReaderPreferences = {
  fontSize: number
  lineSpacing: number
  paragraphSpacing: number
  horizontalPadding: number
  textAlignment: "left" | "justified" | "natural"
  firstLineHeadIndent: number
  fontDesign: "default" | "rounded" | "serif" | "monospaced"
  customFontName: string
  textColor: string
  backgroundColor: string
  themePreset: ReaderThemePreset
  tts: ReaderTtsPreferences
}

export type BookshelfItem = BookReference & {
  key: string
  addedAt: string
  lastReadAt?: string
  favorite?: boolean
}

export type ReadingHistoryEntry = BookReference & {
  key: string
  chapterId: string
  chapterTitle: string
  chapterContentUrl: string
  chapterContentType: "text" | "html"
  updatedAt: string
}

export type ReadingProgress = BookReference & {
  key: string
  chapterId: string
  chapterTitle: string
  chapterContentUrl: string
  chapterContentType: "text" | "html"
  chapterIndex: number
  totalChapters: number
  updatedAt: string
}

export type DownloadedBook = BookReference & {
  key: string
  chapterCount: number
  downloadedCount: number
  updatedAt: string
  status: "idle" | "downloading" | "completed"
}

export type CacheMetadata = {
  key: string
  kind: "chapter" | "toc" | "download"
  updatedAt: string
  size: number
  title?: string
}

export type ReadingGoal = {
  enabled: boolean
  dailyMinutes: number
}

export type ReadingDayStat = {
  date: string
  totalSeconds: number
  sessions: number
  completedGoal: boolean
  updatedAt: string
  books: string[]
}

export type SourceProbeStatus = {
  sourceId: string
  keyword: string
  success: boolean
  stage: "search" | "toc" | "content" | "done" | "failed"
  searchCount: number
  chapterCount: number
  updatedAt: string
  error?: string
}

export type ImportedSourcePayload =
  | Partial<StoredBookSource>
  | Partial<StoredBookSource>[]

export type LegadoSearchRule = {
  bookList?: string
  name?: string
  author?: string
  intro?: string
  coverUrl?: string
  kind?: string
  bookUrl?: string
}

export type LegadoBookInfoRule = {
  name?: string
  author?: string
  intro?: string
  coverUrl?: string
  tocUrl?: string
}

export type LegadoTocRule = {
  chapterList?: string
  chapterName?: string
  chapterUrl?: string
}

export type LegadoContentRule = {
  content?: string
  title?: string
  nextContentUrl?: string
  replaceRegex?: string[] | string
}

export type LegadoLikeBookSource = {
  id?: string
  bookSourceName?: string
  bookSourceUrl?: string
  bookSourceGroup?: string
  enabled?: boolean
  header?: string | Record<string, string>
  searchUrl?: string
  ruleSearch?: LegadoSearchRule
  ruleBookInfo?: LegadoBookInfoRule
  ruleToc?: LegadoTocRule
  ruleContent?: LegadoContentRule
  [key: string]: any
}
