import { DEFAULT_SOURCE_GROUP } from "../constants"
import { StoredBookSource } from "../types"

export const builtinSources: StoredBookSource[] = [
  {
    id: "builtin-zwduxs",
    bookSourceName: "八一中文网",
    bookSourceUrl: "http://www.zwduxs.com",
    bookSourceGroup: "内置主源",
    adapter: "htmlRule",
    enabled: true,
    builtin: true,
    notes: "当前已通过试源，作为默认中文主源。",
    rules: {
      search: {
        url: "http://www.zwduxs.com/modules/article/search.php##{\"method\":\"POST\",\"body\":\"searchkey={{key}}\"}",
        list: "#content > table > tbody > tr:not(:first-child)",
        detailUrl: "td:nth-child(1) > a@href",
        title: "td:nth-child(1) > a@text",
        author: "td:nth-child(3)",
      },
      toc: {
        list: "#list > dl > dd",
        title: "a@text",
        contentUrl: "a@href",
      },
      content: {
        text: "#content@text",
        replaceRegex: [
          "\\n\\n\\s+##\n ",
          "&bp;",
        ],
      },
    },
  },
  {
    id: "builtin-gutendex",
    bookSourceName: "Gutendex Demo",
    bookSourceUrl: "https://gutendex.com",
    bookSourceGroup: DEFAULT_SOURCE_GROUP,
    adapter: "gutendex",
    enabled: false,
    builtin: true,
    notes: "内置演示书源，用于打通搜索与正文阅读 MVP。",
  },
  {
    id: "builtin-jiutao-cropped",
    bookSourceName: "九桃小说（裁剪版）",
    bookSourceUrl: "http://00txs.com",
    bookSourceGroup: "内置真实样例",
    adapter: "htmlRule",
    enabled: false,
    builtin: true,
    notes: "基于社区九桃小说书源裁剪，来源见 README；当前测试表现为响应超时，保留作不稳定样例。",
    rules: {
      search: {
        url: "http://00txs.com/novel/search?searchkey={{key}}",
        list: ".library li",
        title: "a.bookname",
        detailUrl: "a.bookname@href",
        author: "a.author",
        summary: "p.intro",
        cover: "a.bookimg > img@src",
        language: "p:nth-child(4) > a:nth-child(3)",
      },
      detail: {
        summary: "body > div.main > div > div.left.w_860 > div:nth-child(2) > div.content > p",
        tocUrl: "body > div.main > div > div.left.w_860 > div:nth-child(1) > div.detail > p.action > a@href",
      },
      toc: {
        list: "div.read dl:nth-child(2) dd",
        title: "a@text",
        contentUrl: "a@href",
      },
      content: {
        text: "#content@html",
        replaceRegex: [
          "</p><p>##\n ",
          "<p>## ",
          "</p>",
          "<p style=\"text-align: center;\">",
          "老域名\\(9txs\\)被墙，请您牢记本站最新域名\\(00txs.com\\)",
          "九桃小说",
        ],
      },
    },
  },
  {
    id: "candidate-118book",
    bookSourceName: "顶点小说（118book 候选）",
    bookSourceUrl: "https://www.118book.com",
    bookSourceGroup: "GitHub 候选",
    adapter: "htmlRule",
    enabled: false,
    builtin: true,
    notes: "来自源仓库，最近一个月仍被抓取；按同站型规则收录，待试源验证。",
    rules: {
      search: {
        url: "https://www.118book.com/modules/article/search.php##{\"method\":\"POST\",\"body\":\"searchkey={{key}}\"}",
        list: "#content > table > tbody > tr:not(:first-child)",
        detailUrl: "td:nth-child(1) > a@href",
        title: "td:nth-child(1) > a@text",
        author: "td:nth-child(3)",
      },
      toc: {
        list: "#list > dl > dd",
        title: "a@text",
        contentUrl: "a@href",
      },
      content: {
        text: "#content@text",
        replaceRegex: [
          "\\n\\n\\s+##\n ",
          "&bp;",
        ],
      },
    },
  },
]
