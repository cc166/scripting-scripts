export const STORAGE_KEYS = {
  sources: "book_source_reader.sources",
  activeSourceId: "book_source_reader.active_source_id",
  lastReading: "book_source_reader.last_reading",
  sourceProbeStatuses: "book_source_reader.source_probe_statuses",
  readerPreferences: "book_source_reader.reader_preferences",
  chapterCache: "book_source_reader.chapter_cache",
  tocCache: "book_source_reader.toc_cache",
  bookshelf: "book_source_reader.bookshelf",
  readingHistory: "book_source_reader.reading_history",
  readingProgress: "book_source_reader.reading_progress",
  cacheMetadata: "book_source_reader.cache_metadata",
  downloads: "book_source_reader.downloads",
  readingGoal: "book_source_reader.reading_goal",
  readingStats: "book_source_reader.reading_stats",
  ttsPositions: "book_source_reader.tts_positions",
} as const

export const DEFAULT_READER_TTS_PREFERENCES = {
  voiceIdentifier: "",
  rate: 0.5,
  pitch: 1.0,
  volume: 1.0,
  autoNextChapter: true,
} as const

export const DEFAULT_READER_PREFERENCES = {
  fontSize: 19,
  lineSpacing: 10,
  paragraphSpacing: 14,
  horizontalPadding: 20,
  textAlignment: "natural",
  firstLineHeadIndent: 0,
  fontDesign: "serif",
  customFontName: "",
  textColor: "#1F1A17",
  backgroundColor: "#F6EEDF",
  themePreset: "paper",
  tts: DEFAULT_READER_TTS_PREFERENCES,
} as const

export const DEFAULT_SOURCE_GROUP = "演示源"

export const DEFAULT_READING_GOAL = {
  enabled: true,
  dailyMinutes: 30,
} as const

export const IMPORT_TEMPLATE = JSON.stringify(
  [
    {
      bookSourceName: "Gutendex Demo",
      bookSourceUrl: "https://gutendex.com",
      bookSourceGroup: "演示源",
      adapter: "gutendex",
      enabled: true,
      notes: "示例书源，适合先验证搜索与阅读流程。"
    },
    {
      bookSourceName: "HTML Rule Demo",
      bookSourceUrl: "https://example.com",
      bookSourceGroup: "规则源",
      adapter: "htmlRule",
      enabled: false,
      notes: "HTML + CSS 选择器规则示例，请替换为真实站点。",
      rules: {
        search: {
          url: "https://example.com/search?q={{key}}",
          list: ".book-item",
          title: ".book-title",
          detailUrl: "a@href",
          author: ".book-author",
          summary: ".book-summary",
          cover: "img@src"
        },
        detail: {
          summary: ".book-desc",
          chapterTitle: ".read-button",
          contentUrl: ".read-button@href"
        },
        toc: {
          list: ".chapter-item",
          title: ".chapter-title",
          contentUrl: "a@href"
        },
        content: {
          text: ".article-content"
        }
      }
    },
    {
      bookSourceName: "JSON API Demo",
      bookSourceUrl: "https://example.com",
      bookSourceGroup: "规则源",
      adapter: "htmlRule",
      enabled: false,
      notes: "JSONPath 子集示例，请替换为真实接口。",
      header: {
        "Accept": "application/json"
      },
      rules: {
        search: {
          url: "https://example.com/api/search##{\"method\":\"POST\",\"body\":\"keyword={{key}}\"}",
          list: "$.data.list[*]",
          title: "$.title",
          detailUrl: "$.detail_url",
          author: "$.author",
          summary: "$.intro",
          cover: "$.cover"
        },
        toc: {
          list: "$.data.chapters[*]",
          title: "$.title",
          contentUrl: "$.url"
        },
        content: {
          text: "$.data.content",
          nextContentUrl: "$.data.next_url"
        }
      }
    },
    {
      bookSourceName: "Legado HTML Demo",
      bookSourceUrl: "https://example.com",
      bookSourceGroup: "Legado 导入",
      enabled: false,
      searchUrl: "https://example.com/search?q={{key}}",
      ruleSearch: {
        bookList: ".book-item",
        name: ".book-title",
        author: ".book-author",
        intro: ".book-summary",
        coverUrl: "img@src",
        bookUrl: "a@href"
      },
      ruleBookInfo: {
        intro: ".book-desc"
      },
      ruleToc: {
        chapterList: ".chapter-item",
        chapterName: ".chapter-title",
        chapterUrl: "a@href"
      },
      ruleContent: {
        content: ".article-content"
      }
    },
    {
      bookSourceName: "九桃小说（裁剪版）",
      bookSourceUrl: "http://00txs.com",
      bookSourceGroup: "内置真实样例",
      adapter: "htmlRule",
      enabled: true,
      notes: "基于公开社区书源裁剪，保留 HTML + CSS + replaceRegex 子集。",
      rules: {
        search: {
          url: "http://00txs.com/novel/search?searchkey={{key}}",
          list: ".library li",
          title: "a.bookname",
          detailUrl: "a.bookname@href",
          author: "a.author",
          summary: "p.intro",
          cover: "a.bookimg > img@src",
          language: "p:nth-child(4) > a:nth-child(3)"
        },
        detail: {
          summary: "body > div.main > div > div.left.w_860 > div:nth-child(2) > div.content > p",
          contentUrl: "body > div.main > div > div.left.w_860 > div:nth-child(1) > div.detail > p.action > a@href"
        },
        toc: {
          list: "div.read dl:nth-child(2) dd",
          title: "a@text",
          contentUrl: "a@href"
        },
        content: {
          text: "#content@html",
          replaceRegex: [
            "</p><p>##\n ",
            "<p>## ",
            "</p>",
            "<p style=\"text-align: center;\">",
            "老域名\\(9txs\\)被墙，请您牢记本站最新域名\\(00txs.com\\)",
            "九桃小说"
          ]
        }
      }
    }
  ],
  null,
  2,
)
