import { ContentUnavailableView, List, NavigationLink, Section, Text, VStack } from "scripting"
import { listReadingHistory } from "../storage"
import { RestoreBookPage } from "./RestoreBookPage"

export function ReadingHistoryPage() {
  const history = listReadingHistory()

  if (history.length === 0) {
    return <ContentUnavailableView title="还没有阅读历史" systemImage="clock.arrow.circlepath" description="打开章节后，阅读记录会显示在这里。" />
  }

  return (
    <List navigationTitle="阅读历史">
      <Section header={<Text>最近打开</Text>}>
        {history.map((entry) => (
          <NavigationLink
            key={entry.key}
            destination={<RestoreBookPage title="恢复阅读" target={entry} />}
          >
            <VStack spacing={4} alignment="leading">
              <Text fontWeight="semibold">{entry.bookTitle}</Text>
              <Text>{entry.chapterTitle}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">
                {entry.sourceName || "未知来源"} · {new Date(entry.updatedAt).toLocaleString()}
              </Text>
            </VStack>
          </NavigationLink>
        ))}
      </Section>
    </List>
  )
}
