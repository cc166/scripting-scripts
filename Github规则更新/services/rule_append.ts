// 无界面的「追加规则」逻辑层，供 intent.tsx（分享菜单 / 快捷指令后台运行）使用。
//
// 这里不含任何 UI（Dialog / Navigation），因为 intent.tsx 通过快捷指令的
// **Run Script** 动作执行时没有前台界面，弹窗会永远挂住使自动化卡死。
// 结果一律通过返回值传出，由调用方决定是发通知还是 Script.exit(Intent.text(...))。
//
// App 内的交互式编辑（浏览目录、逐条改规则、Diff 确认）仍留在 index.tsx，
// 两边共用同一份 github_config 与同样的 GitHub Contents API 调用方式。

import { fetch } from "scripting"

export type RuleAppendConfig = {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
}

/** 后台追加的目标文件（相对仓库根的完整路径）与默认规则类型，在 App 配置页设置。 */
export type IntentTarget = {
  filePath: string
  ruleType: string
}

const CONFIG_KEY = "github_config"
const INTENT_TARGET_KEY = "github_intent_target"
const DEFAULT_RULE_TYPE = "DOMAIN-SUFFIX"

export function loadConfig(): RuleAppendConfig {
  const stored = Storage.get<Partial<RuleAppendConfig>>(CONFIG_KEY) ?? {}
  return {
    token: stored.token ?? "",
    owner: stored.owner ?? "",
    repo: stored.repo ?? "",
    path: stored.path ?? "",
    // 兼容旧版没有 branch 字段的配置
    branch: stored.branch && stored.branch.trim() ? stored.branch : "main",
  }
}

export function loadIntentTarget(): IntentTarget {
  const stored = Storage.get<Partial<IntentTarget>>(INTENT_TARGET_KEY) ?? {}
  return {
    filePath: (stored.filePath ?? "").trim(),
    ruleType: (stored.ruleType ?? "").trim() || DEFAULT_RULE_TYPE,
  }
}

export function saveIntentTarget(target: IntentTarget): void {
  Storage.set(INTENT_TARGET_KEY, {
    filePath: target.filePath.trim(),
    ruleType: target.ruleType.trim() || DEFAULT_RULE_TYPE,
  })
}

function encodeURIPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/")
}

function friendlyMessage(status: number, fallback?: string): string {
  if (status === 401) return "鉴权失败：token 无效或已过期"
  if (status === 403) return "权限不足：需要 token 对该仓库有写权限"
  if (status === 404) return "找不到文件或仓库（请检查后台目标文件路径）"
  if (status === 409) return "远端已变更，请重试"
  if (status === 422) return "提交参数有误"
  return fallback ?? `请求失败 (${status})`
}

/**
 * 把输入文本转成规则行。
 *
 * 逐行处理，三种形态：
 *   1. 已是完整规则（`DOMAIN-SUFFIX,example.com` 等大写类型开头）→ 原样使用；
 *   2. URL（含 `://` 或以 `www.` 起头）→ 取主机名，套用默认类型；
 *   3. 其它非空、非注释文本 → 视作域名，套用默认类型。
 * 注释行与空行直接丢弃（分享来的文本常带杂物，不该写进规则文件）。
 */
export function textToRuleLines(text: string, ruleType: string): string[] {
  const lines: string[] = []

  for (const raw of text.split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue

    // 形态 1：已带大写规则类型前缀
    const head = line.split(",")[0]?.trim() ?? ""
    if (/^[A-Z][A-Z0-9-]*$/.test(head) && line.includes(",")) {
      lines.push(line)
      continue
    }

    // 形态 2：URL —— 只取主机名，去掉协议 / 路径 / 端口 / 用户信息
    let host = line
    if (host.includes("://")) host = host.slice(host.indexOf("://") + 3)
    host = host.split("/")[0].split("?")[0].split("#")[0]
    if (host.includes("@")) host = host.slice(host.indexOf("@") + 1)
    host = host.split(":")[0]
    host = host.replace(/^www\./, "").trim()

    // 形态 3 收口：留下的必须像个域名，否则宁可跳过也不写脏数据
    if (!host || /\s/.test(host) || !host.includes(".")) continue
    lines.push(`${ruleType},${host}`)
  }

  return lines
}

async function ghGet(url: string, token: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
}

export type AppendResult = {
  ok: boolean
  /** 适合直接放进通知 body / 返回给快捷指令的一句话结果 */
  message: string
  /** 实际写入的规则条数（去重后） */
  added: number
  /** 因已存在而跳过的条数 */
  skipped: number
}

/**
 * 后台追加规则：读取目标文件 → 过滤已存在的行 → 追加到末尾 → 提交。
 *
 * 全程不抛异常，失败信息通过返回值传出。
 * 两处保护：
 *   · 解析后没有可用规则时不发起提交（避免产生空 commit）；
 *   · 逐行与现有内容比对去重，重复分享同一个域名不会写入第二遍。
 */
export async function appendRulesInBackground(text: string): Promise<AppendResult> {
  const empty = { added: 0, skipped: 0 }
  const cfg = loadConfig()
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    return { ok: false, message: "请先在 App 内配置 GitHub Token / 用户名 / 仓库名", ...empty }
  }

  const target = loadIntentTarget()
  if (!target.filePath) {
    return { ok: false, message: "请先在 App 配置页设置「后台追加目标文件」", ...empty }
  }

  const wanted = textToRuleLines(text, target.ruleType)
  if (wanted.length === 0) {
    return { ok: false, message: "没有从输入中解析出可用的规则", ...empty }
  }

  try {
    const fileUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(target.filePath)}?ref=${encodeURIComponent(cfg.branch)}`
    const getRes = await ghGet(fileUrl, cfg.token)
    if (!getRes.ok) {
      return { ok: false, message: friendlyMessage(getRes.status), ...empty }
    }
    const fileData = await getRes.json()
    if (!fileData?.content) {
      return { ok: false, message: fileData?.message || "读取目标文件失败", ...empty }
    }
    const content = Data.fromBase64String(String(fileData.content).replace(/\n/g, ""))?.toRawString() ?? ""

    // 去重：按「类型,值」比对，忽略行尾注释与首尾空白
    const existing = new Set(
      content.split("\n").map(line => {
        const body = line.split("#")[0].trim()
        const parts = body.split(",")
        return parts.length >= 2 ? `${parts[0].trim()},${parts[1].trim()}` : body
      }),
    )
    const fresh = wanted.filter(line => {
      const parts = line.split(",")
      const key = parts.length >= 2 ? `${parts[0].trim()},${parts[1].trim()}` : line
      return !existing.has(key)
    })
    const skipped = wanted.length - fresh.length

    if (fresh.length === 0) {
      return { ok: true, message: `${skipped} 条规则已存在，无需追加`, added: 0, skipped }
    }

    const needsNewline = content.length > 0 && !content.endsWith("\n")
    const newContent = content + (needsNewline ? "\n" : "") + fresh.join("\n") + "\n"

    const putRes = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(target.filePath)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Append ${fresh.length} rule(s) via Scripting`,
          content: Data.fromRawString(newContent, "utf-8")?.toBase64String() ?? "",
          sha: fileData.sha,
          branch: cfg.branch,
        }),
      },
    )

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => null)
      return { ok: false, message: friendlyMessage(putRes.status, err?.message), ...empty }
    }

    const suffix = skipped > 0 ? `，${skipped} 条已存在` : ""
    return { ok: true, message: `已追加 ${fresh.length} 条规则${suffix}`, added: fresh.length, skipped }
  } catch (error) {
    return { ok: false, message: `追加失败：${error}`, ...empty }
  }
}
