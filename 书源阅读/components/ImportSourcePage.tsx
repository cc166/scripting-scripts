import { Button, Editor, Navigation, NavigationStack, Text, VStack, useEffect, useMemo, useState } from "scripting"
import { IMPORT_TEMPLATE } from "../constants"
import { normalizeImportedSources } from "../services/source_import"
import { upsertSources } from "../storage"
import { ImportedSourcePayload, StoredBookSource } from "../types"

export function ImportSourcePage({
  onImported,
}: {
  onImported: (sources: StoredBookSource[]) => void
}) {
  const dismiss = Navigation.useDismiss()
  const [message, setMessage] = useState("粘贴一个书源 JSON。当前支持 gutendex、htmlRule，以及 Legado 风格字段的子集导入。")
  const controller = useMemo(() => {
    return new EditorController({
      ext: "json",
      readOnly: false,
      content: IMPORT_TEMPLATE,
    })
  }, [])

  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  async function handleImport() {
    try {
      const parsed = JSON.parse(controller.content) as ImportedSourcePayload
      const normalized = normalizeImportedSources(parsed)
      const sources = upsertSources(normalized)
      onImported(sources)
      setMessage(`导入成功，当前共有 ${sources.length} 个书源。`)
    } catch (error) {
      setMessage(`导入失败：${String(error)}`)
    }
  }

  return (
    <NavigationStack>
      <VStack
        frame={{ maxWidth: Infinity, maxHeight: Infinity }}
        navigationTitle="导入书源"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          confirmationAction: <Button title="导入" action={handleImport} />,
        }}
      >
        <Text
          padding={{ horizontal: 12, vertical: 8 }}
          font="footnote"
          foregroundStyle="secondaryLabel"
        >
          {message}
        </Text>
        <Editor
          controller={controller}
          scriptName="书源阅读"
          showAccessoryView
        />
      </VStack>
    </NavigationStack>
  )
}
