import { List, Section, Text } from "scripting"

export function HelpPage() {
  return (
    <List navigationTitle="兼容说明">
      <Section header={<Text>当前支持</Text>}>
        <Text>gutendex 演示源</Text>
        <Text>htmlRule：HTML + CSS 选择器 / XPath</Text>
        <Text>JSONPath 子集</Text>
        <Text>POST / headers / body 请求配置</Text>
        <Text>请求超时与基础重试</Text>
        <Text>Legado 风格字段兼容导入子集</Text>
        <Text>书架、阅读历史、继续阅读</Text>
        <Text>离线缓存、缓存管理</Text>
        <Text>阅读设置：主题、字体、字号、段间距、页边距、首行缩进</Text>
        <Text>试源调试：验证搜索、目录、正文链路</Text>
      </Section>

      <Section header={<Text>规则语法</Text>}>
        <Text>.selector：取文本</Text>
        <Text>a@href：取属性</Text>
        <Text>.content@html：取 HTML</Text>
        <Text>@XPath://div/text()：XPath 文本</Text>
        <Text>@XPath://a/@href：XPath 属性</Text>
        <Text>$.data.list[*]：JSONPath 列表</Text>
        <Text>$.data.content：JSONPath 字段</Text>
      </Section>

      <Section header={<Text>Legado 映射</Text>}>
        <Text>searchUrl {"->"} rules.search.url</Text>
        <Text>ruleSearch.bookList {"->"} rules.search.list</Text>
        <Text>ruleSearch.name {"->"} rules.search.title</Text>
        <Text>ruleSearch.bookUrl {"->"} rules.search.detailUrl</Text>
        <Text>ruleBookInfo.tocUrl {"->"} rules.detail.tocUrl</Text>
        <Text>ruleToc.chapterList {"->"} rules.toc.list</Text>
        <Text>ruleToc.chapterName {"->"} rules.toc.title</Text>
        <Text>ruleToc.chapterUrl {"->"} rules.toc.contentUrl</Text>
        <Text>ruleContent.content {"->"} rules.content.text</Text>
      </Section>

      <Section header={<Text>暂不支持</Text>}>
        <Text>JS 规则沙箱</Text>
        <Text>复杂分页和强反爬</Text>
        <Text>验证码与登录态站点适配</Text>
      </Section>
    </List>
  )
}
