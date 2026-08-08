import { Button, ContentUnavailableView, List, Section, Text } from "scripting"
import { clearAllCaches, clearChapterCaches, clearDownloadRecords, clearTocCaches, listCacheMetadata, listDownloadedBooks } from "../storage"

export function CacheManagerPage({
  onChanged,
}: {
  onChanged?: () => void
}) {
  const cacheMetadata = listCacheMetadata()
  const downloadedBooks = listDownloadedBooks()
  const chapterCount = cacheMetadata.filter((item) => item.kind === "chapter").length
  const tocCount = cacheMetadata.filter((item) => item.kind === "toc").length
  const totalApproxSize = cacheMetadata.reduce((sum, item) => sum + item.size, 0)

  if (cacheMetadata.length === 0 && downloadedBooks.length === 0) {
    return <ContentUnavailableView title="没有缓存" systemImage="internaldrive" description="阅读缓存和离线下载会显示在这里。" />
  }

  return (
    <List navigationTitle="缓存管理">
      <Section header={<Text>缓存概览</Text>}>
        <Text>章节缓存：{chapterCount}</Text>
        <Text>目录缓存：{tocCount}</Text>
        <Text>离线书籍：{downloadedBooks.length}</Text>
        <Text>估算大小：{totalApproxSize} 字符</Text>
      </Section>

      <Section header={<Text>缓存操作</Text>}>
        <Button
          title="清空章节缓存"
          action={() => {
            clearChapterCaches()
            onChanged?.()
          }}
        />
        <Button
          title="清空目录缓存"
          action={() => {
            clearTocCaches()
            onChanged?.()
          }}
        />
        <Button
          title="清空离线记录"
          action={() => {
            clearDownloadRecords()
            onChanged?.()
          }}
        />
        <Button
          title="清空全部缓存"
          role="destructive"
          action={() => {
            clearAllCaches()
            onChanged?.()
          }}
        />
      </Section>

      {downloadedBooks.length > 0 ? (
        <Section header={<Text>离线书籍</Text>}>
          {downloadedBooks.map((item) => (
            <Text key={item.key}>
              {item.bookTitle} · {item.downloadedCount}/{item.chapterCount}
            </Text>
          ))}
        </Section>
      ) : undefined}
    </List>
  )
}
