import { Button, List, Navigation, NavigationStack, Section, Text, Toggle, VStack, useState } from "scripting"
import { BookChapter } from "../types"

export function ChapterPickerPage({
  chapters,
  currentIndex,
  onSelect,
}: {
  chapters: BookChapter[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  const dismiss = Navigation.useDismiss()
  const [reversed, setReversed] = useState(false)
  const display = reversed
    ? chapters.map((chapter, index) => ({ chapter, index })).reverse()
    : chapters.map((chapter, index) => ({ chapter, index }))

  return (
    <NavigationStack>
      <List
        navigationTitle="目录"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
        }}
      >
        <Section header={<Text>目录选项</Text>}>
          <Toggle title="倒序查看" value={reversed} onChanged={setReversed} />
        </Section>

        <Section header={<Text>章节</Text>}>
          {display.map(({ chapter, index }) => (
            <Button
              key={chapter.id}
              action={() => {
                onSelect(index)
                dismiss()
              }}
            >
              <VStack spacing={4} alignment="leading">
                <Text fontWeight={index === currentIndex ? "semibold" : "regular"}>
                  {chapter.title}
                </Text>
                <Text font="caption" foregroundStyle="secondaryLabel">
                  {index === currentIndex ? "当前章节" : `第 ${index + 1} 章`}
                </Text>
              </VStack>
            </Button>
          ))}
        </Section>
      </List>
    </NavigationStack>
  )
}
