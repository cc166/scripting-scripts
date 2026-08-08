import {
  HStack, ZStack, Text, Image, Link, RoundedRectangle, Color,
} from "scripting"
import { StatusKey, StatusItem, STATUS_META } from "../../util/const"
import { getNetwork } from "../../util/status"

type Variant = "card" | "compact"

/**
 * 一组系统状态指示。点击格子调用对应系统设置 URL。
 *
 * 仅展示 iOS 允许第三方 widget 推断的项：Wi-Fi / 蜂窝。
 * 电量已由系统右上角呈现，不再重复展示。
 *
 * - variant="card"（默认）：高度 44，带圆角色块背景，适合独占一行
 * - variant="compact"：图标 + 短标签，无背景，可嵌入顶部 header
 */
export function StatusRow({
  items,
  variant = "card",
}: {
  items: StatusItem[]
  variant?: Variant
}) {
  const enabled = items.filter(i => i.enabled)
  if (enabled.length === 0) return null
  const net = getNetwork()

  return (
    <HStack
      spacing={variant === "compact" ? 8 : 6}
      frame={variant === "compact" ? undefined : { maxWidth: "infinity" }}
    >
      {enabled.map((it) => {
        const on = resolveRealState(it.key, net)
        return (
          <StatusCell
            key={it.key}
            itemKey={it.key}
            customUrl={it.customUrl}
            on={on}
            variant={variant}
          />
        )
      })}
    </HStack>
  )
}

function resolveRealState(
  key: StatusKey,
  net: { online: boolean; wifi: boolean; cellular: boolean },
): boolean {
  switch (key) {
    case "wifi":
      return net.wifi
    case "cellular":
      return net.cellular
  }
}

function StatusCell({
  itemKey, on, customUrl, variant,
}: {
  itemKey: StatusKey
  on: boolean
  customUrl?: string
  variant: Variant
}) {
  const meta = STATUS_META[itemKey]
  const icon = on ? meta.iconOn : meta.iconOff
  const label = meta.label
  const url = customUrl && customUrl.trim() ? customUrl.trim() : meta.url

  // 颜色：on 用主题色；off 用灰
  const tint: Color = on ? meta.color : "systemGray"

  if (variant === "compact") {
    // 顶部嵌入：仅彩色图标 + 极简文字，无背景色块
    return (
      <Link url={url}>
        <HStack spacing={3}>
          <Image
            systemName={icon}
            foregroundStyle={on ? meta.color : "secondaryLabel"}
            font={11}
            fontWeight="semibold"
          />
          <Text
            font={11}
            fontWeight="medium"
            foregroundStyle={on ? "label" : "secondaryLabel"}
            lineLimit={1}
          >
            {label}
          </Text>
        </HStack>
      </Link>
    )
  }

  // card：原占行的色块样式
  const fillOpacity = on ? 0.18 : 0.22
  return (
    <Link url={url}>
      <ZStack frame={{ maxWidth: "infinity", height: 44 }}>
        <RoundedRectangle
          cornerRadius={12}
          fill={tint}
          opacity={fillOpacity}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />
        <HStack spacing={5} padding={{ leading: 8, trailing: 8 }}>
          <Image
            systemName={icon}
            foregroundStyle={on ? meta.color : "secondaryLabel"}
            font={14}
            fontWeight="semibold"
          />
          <Text
            font={11}
            fontWeight="medium"
            foregroundStyle={on ? "label" : "secondaryLabel"}
            lineLimit={1}
          >
            {label}
          </Text>
        </HStack>
      </ZStack>
    </Link>
  )
}
