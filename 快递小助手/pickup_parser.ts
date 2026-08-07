export interface PickupInfo {
  courier: string | null
  code: string
  snippet: string
  date: string | null
  picked?: boolean
}

const BRACKET_RE = /【([^】\d]{2,10})】/
const LOCATION_RE = /(?:到达|至|放|在|取件地[:：]|地址[:：])\s*([^，,。!！\n\r\]】]{2,30}?(?:店|驿站|超市|服务部|前台|门卫|代收点|便利店|服务站|仓|柜|厅|室|中心|报亭|花园|小区|楼|园|广场))/i
const GENERIC_RE = /(菜鸟|蜂巢|丰巢|兔喜|兔喜生活|极兔|顺丰|京东|韵达|中通|圆通|申通|邮政|EMS|妈妈驿站|欢猫驿站|驿站|日日顺|德邦)/i
const CODE_TOKEN = "[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,3}"
const CODE_AFTER_KEYWORD_RE = new RegExp(
  `(?:取件码|取货码|验证码|提货码|取件|取货|请凭|凭)\s*[:：]?\s*(${CODE_TOKEN})`,
  "gi"
)
const CODE_BEFORE_ACTION_RE = new RegExp(
  `(${CODE_TOKEN})\s*(?:取件|取货)`,
  "gi"
)

interface CodeMatch {
  code: string
  index: number
  length: number
}

function normalizeCode(value: string): string | null {
  const code = value.toUpperCase().replace(/^[,，.。:：;；]+|[,，.。:：;；]+$/g, "")
  const compactLength = code.replace(/-/g, "").length
  if (compactLength < 3 || !/\d/.test(code)) return null
  return code
}

function findCodes(text: string): CodeMatch[] {
  const matches: CodeMatch[] = []
  const seen = new Set<string>()

  for (const pattern of [CODE_AFTER_KEYWORD_RE, CODE_BEFORE_ACTION_RE]) {
    const matcher = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null

    while ((match = matcher.exec(text)) !== null) {
      const code = normalizeCode(match[1])
      if (!code || seen.has(code)) continue
      seen.add(code)
      matches.push({ code, index: match.index, length: match[0].length })
    }
  }

  return matches.sort((a, b) => a.index - b.index)
}

function getSnippet(text: string, matchIndex: number): string {
  const bracketStart = text.lastIndexOf("【", matchIndex)
  const lineStart = text.lastIndexOf("\n", matchIndex)
  const start = Math.max(0, bracketStart, lineStart + 1)
  const nextBracket = text.indexOf("【", Math.max(start + 1, matchIndex + 1))
  const nextLine = text.indexOf("\n", matchIndex)
  const candidates = [nextBracket, nextLine].filter(index => index >= 0)
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length
  return text.slice(start, end).trim()
}

export function extractPickupFromText(text: string, date?: Date): PickupInfo[] {
  if (!text) return []

  return findCodes(text).map(match => {
    const contextStart = Math.max(0, match.index - 100)
    const contextEnd = Math.min(text.length, match.index + match.length + 100)
    const context = text.slice(contextStart, contextEnd)
    const bracketName = context.match(BRACKET_RE)?.[1] ?? null
    const locationMatch = context.match(LOCATION_RE)
    const locationName = locationMatch?.[1]?.replace(/^(?:在|位于|地址|:)/, "") ?? null
    const genericName = context.match(GENERIC_RE)?.[0] ?? null

    return {
      courier: locationName || bracketName || genericName,
      code: match.code,
      snippet: getSnippet(text, match.index),
      date: date ? date.toISOString() : null,
    }
  })
}
