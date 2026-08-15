// Intent 入口 —— 让「追加规则」能在后台完成，不必打开 App。
//
// 两种用法：
//   · 分享菜单：在 Safari 等 App 里选中文字 / 分享网页 → Scripting → 本脚本；
//   · 快捷指令：**Run Script** 动作（后台执行、无 UI），可配合个人自动化定时触发。
//     若选用 Run Script in App 则会前台打开，本文件同样能跑，只是多了一次 App 启动。
//
// 该环境（Script.env === "intent"）没有界面，因此这里绝不调用 Dialog.* / Navigation.present ——
// 弹窗在无 UI 环境会永远挂住，自动化就此卡死。结果走两条回报通道：
//   1. Script.exit(Intent.text(...)) 把结果交回快捷指令，便于后续动作串接；
//   2. 本地通知，供分享菜单场景（用户看不到快捷指令的返回值）。

import { Intent, Notification, Script } from "scripting"
import { appendRulesInBackground } from "./services/rule_append"

/** 汇总所有可能的输入通道，拼成待解析文本。 */
function collectInputText(): string {
  const chunks: string[] = []

  const shortcut = Intent.shortcutParameter
  if (shortcut) {
    if (shortcut.type === "text" || shortcut.type === "fileURL") {
      chunks.push(String(shortcut.value))
    } else if (shortcut.type === "json") {
      // 快捷指令传 JSON 时按数组 / 对象值展开，取其中的字符串
      const values = Array.isArray(shortcut.value) ? shortcut.value : Object.values(shortcut.value ?? {})
      for (const value of values) {
        if (typeof value === "string") chunks.push(value)
      }
    }
  }

  if (Intent.textsParameter) chunks.push(...Intent.textsParameter)
  if (Intent.urlsParameter) chunks.push(...Intent.urlsParameter)

  return chunks.join("\n")
}

async function run() {
  const text = collectInputText()

  if (!text.trim()) {
    const message = "没有收到文本或链接"
    await Notification.schedule({ title: "追加规则失败", body: message, threadIdentifier: "github-rule-append" })
      .catch(() => undefined)
    Script.exit(Intent.text(message))
    return
  }

  const result = await appendRulesInBackground(text)

  try {
    await Notification.schedule({
      title: result.ok ? "规则已追加" : "追加规则失败",
      body: result.message,
      // 成功静默：分享 / 定时追加是高频操作，不该每次都响；失败才提醒。
      silent: result.ok,
      interruptionLevel: result.ok ? "passive" : "active",
      threadIdentifier: "github-rule-append",
    })
  } catch (error) {
    // 通知权限未授予不应影响提交本身的成败
    console.warn("追加结果通知发送失败", error)
  }

  Script.exit(Intent.text(result.message))
}

run()
