// File: intent.tsx
import { Intent, Script, Widget } from "scripting"
import { handleAnyData } from "./index"

const SMS_DIVIDER = "---SMS-DIVIDER---"

function collectText(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText)
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of ["body", "text", "content", "message"]) {
      const texts = collectText(record[key])
      if (texts.length > 0) return texts
    }
  }

  return []
}

try {
  const shortcutTexts = collectText(Intent.shortcutParameter?.value)
  const texts = shortcutTexts.length > 0
    ? shortcutTexts
    : collectText(Intent.textsParameter)

  if (texts.length === 0) {
    Script.exit(Intent.text("没有收到短信内容，请检查快捷指令的‘查找信息’结果和脚本输入。"))
  } else {
    const importedCount = handleAnyData(texts.join(`\n\n${SMS_DIVIDER}\n\n`))

    if (importedCount > 0) {
      Widget.reloadAll()
    }

    Script.exit(Intent.text(
      importedCount > 0
        ? `已导入 ${importedCount} 条快递信息`
        : "未发现新的取件码，请检查短信正文或已取件记录。"
    ))
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  Script.exit(Intent.text(`快递信息导入失败：${message}`))
}
