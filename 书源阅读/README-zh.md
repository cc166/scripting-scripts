# 书源阅读

这是一个面向 Scripting 的书源阅读脚本 MVP，目前目标不是完整复刻 Legado 规则引擎，而是先做一个可扩展、可测试、可逐步兼容社区书源的基础版本。

## 当前支持

- `gutendex` 适配器
  - 适合验证搜索、详情、正文阅读的完整流程
- `htmlRule` 适配器
  - 适合 HTML 页面 + CSS 选择器 / XPath / JSONPath 提取的书源
- Legado 风格字段兼容导入
  - 当前仅兼容可映射到 `htmlRule` 的 HTML + CSS 子集

## 当前不支持

- JS 脚本规则
- 复杂分页
- 验证码 / 强反爬
- 多步跳转和动态签名

## htmlRule 字段

### 搜索

```json
{
  "search": {
    "url": "https://example.com/search?q={{key}}",
    "list": ".book-item",
    "title": ".book-title",
    "detailUrl": "a@href",
    "author": ".book-author",
    "summary": ".book-summary",
    "cover": "img@src"
  }
}
```

### 详情

```json
{
  "detail": {
    "summary": ".book-desc",
    "chapterTitle": ".read-button",
    "contentUrl": ".read-button@href"
  }
}
```

### 目录

```json
{
  "toc": {
    "list": ".chapter-item",
    "title": ".chapter-title",
    "contentUrl": "a@href"
  }
}
```

### 正文

```json
{
  "content": {
    "text": ".article-content"
  }
}
```

## 规则取值说明

- `.selector`
  - 取匹配节点文本
- `a@href`
  - 取属性值
- `.content@html`
  - 取 HTML
- `@XPath://div[@class='title']/text()`
  - 用 XPath 取文本
- `@XPath://a/@href`
  - 用 XPath 取属性
- `//dd`
  - 也支持直接用 XPath 作为列表规则
- `$.data.list[*]`
  - 用 JSONPath 取列表
- `$.data.content`
  - 用 JSONPath 取字段

未显式指定 `@...` 时，默认取文本。

## XPath 支持范围

当前 XPath 作为 `htmlRule` 子集支持这些场景：

- 搜索列表 `list`
- 搜索项字段 `title / detailUrl / author / summary / cover`
- 目录列表 `toc.list`
- 目录项字段 `toc.title / toc.contentUrl`
- 正文内容 `content.text`

当前仍未支持：

- XPath + Legado 扩展语法混写
- XPath 后处理管道
- JSON/XPath 混合解析

## JSONPath 支持范围

当前 JSONPath 子集支持：

- `$.data.list[*]`
- `$.data.content`
- `$.data.next_url`
- `$.items[0]`
- `@JSON:$.data.list[*]`

可用于：

- 搜索结果列表
- 目录列表
- 正文字段
- 下一页正文地址 `nextContentUrl`

## 请求配置支持

当前支持 Legado 常见的 URL 配置子集：

```text
https://example.com/api/search##{"method":"POST","body":"keyword={{key}}"}
```

也支持在书源上附带基础请求头：

```json
{
  "header": {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0"
  }
}
```

## 目录页跳转支持

很多真实书源的目录页不在详情页本身，而是要先从详情页取一个 `tocUrl` 再跳转。

当前已经支持：

```json
{
  "detail": {
    "tocUrl": ".dir-link@href"
  },
  "toc": {
    "list": "#list dd",
    "title": "a@text",
    "contentUrl": "a@href"
  }
}
```

## Legado 字段映射

当前会尝试把这些字段映射到 `htmlRule`：

- `searchUrl` -> `rules.search.url`
- `ruleSearch.bookList` -> `rules.search.list`
- `ruleSearch.name` -> `rules.search.title`
- `ruleSearch.bookUrl` -> `rules.search.detailUrl`
- `ruleSearch.author` -> `rules.search.author`
- `ruleSearch.intro` -> `rules.search.summary`
- `ruleSearch.coverUrl` -> `rules.search.cover`
- `ruleBookInfo.intro` -> `rules.detail.summary`
- `ruleBookInfo.tocUrl` -> `rules.detail.tocUrl`
- `ruleToc.chapterList` -> `rules.toc.list`
- `ruleToc.chapterName` -> `rules.toc.title`
- `ruleToc.chapterUrl` -> `rules.toc.contentUrl`
- `ruleContent.content` -> `rules.content.text`

## 内置真实样例

当前脚本内置了一条真实社区样例：`九桃小说（裁剪版）`。

这条样例来自公开社区书源整理，参考来源：

- [蓝鲸阅读书源-备份 Gist](https://gist.github.com/northwind0111/66a705dfef99ff90d1ac260976413b9f)
- [源仓库中的九桃小说页面](https://www.yckceo.com/yuedu/shuyuan/content/id/1346.html)

我在 2026-04-03 调研时看到：

- Gist 页面显示创建于 2023-02-24
- 源仓库页面抓取记录显示 2023-04-06

裁剪时保留了这些当前脚本已经支持的部分：

- 搜索 URL
- 搜索列表 CSS 选择器
- 目录规则
- 正文规则
- `replaceRegex` 的基础净化

没有保留或未完全兼容的能力包括：

- 更复杂的 Legado 扩展语法
- XPath / JSONPath / JS
- 反爬 header / cookie / 登录

## 推荐接入顺序

1. 先用浏览器确认站点搜索页、详情页、目录页、正文页是否都是静态 HTML
2. 再写 `htmlRule`
3. 先只接搜索和正文
4. 跑通后再补目录
5. 最后再考虑兼容社区 Legado 书源字段
