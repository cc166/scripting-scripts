import { ZStack, VStack, HStack, Text, Image, Spacer, RoundedRectangle, Link } from "scripting"
import { Anniversary } from "../../util/const"
import { daysSince, daysUntil } from "../../util/time"

interface Props {
  item: Anniversary
  /** "compact" 紧凑（用于 medium/large 顶部）；"large" 单卡（用于 small） */
  variant?: "compact" | "large"
}

/**
 * 计算展示用的天数 + 标签
 */
function describe(a: Anniversary): { days: number; tag: string; suffix: string } {
  if (a.mode === "past") {
    const d = daysSince(a.date)
    return { days: d, tag: "已经", suffix: "天" }
  }
  const d = daysUntil(a.date, a.yearly)
  return { days: d, tag: "距离", suffix: "天" }
}

export function AnnivCard({ item, variant = "compact" }: Props) {
  const { days, tag, suffix } = describe(item)
  const dayText = days < 0 ? `逾期 ${Math.abs(days)}` : String(days)

  if (variant === "large") {
    return (
      <Link url={`scripting://run/${encodeURIComponent("panel")}`}>
        <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          {/* 背景 */}
          <RoundedRectangle
            cornerRadius={20}
            fill={item.color}
            opacity={0.15}
            frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          />
          <VStack spacing={6} padding={16} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
            <HStack spacing={6}>
              <Image systemName={item.icon} foregroundStyle={item.color} font={14} />
              <Text font={13} foregroundStyle="secondaryLabel">{item.title}</Text>
              <Spacer />
            </HStack>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">
              {tag}{item.mode === "future" ? ` ${item.title}` : ""}
            </Text>
            <HStack alignment="bottom" spacing={4}>
              <Text font={42} fontWeight="heavy" foregroundStyle={item.color}>{dayText}</Text>
              <Text font={16} fontWeight="semibold" foregroundStyle={item.color} padding={{ bottom: 6 }}>
                {suffix}
              </Text>
              <Spacer />
            </HStack>
            <Text font={10} foregroundStyle="tertiaryLabel">{item.date}</Text>
          </VStack>
        </ZStack>
      </Link>
    )
  }

  // compact 紧凑卡片：横向，1/2 宽
  return (
    <ZStack frame={{ maxWidth: "infinity" }}>
      <RoundedRectangle
        cornerRadius={14}
        fill={item.color}
        opacity={0.14}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
      <VStack alignment="leading" spacing={2} padding={10} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={4}>
          <Image systemName={item.icon} foregroundStyle={item.color} font={11} />
          <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
            {item.title}
          </Text>
          <Spacer />
        </HStack>
        <HStack alignment="bottom" spacing={3}>
          <Text font={26} fontWeight="heavy" foregroundStyle={item.color}>
            {dayText}
          </Text>
          <Text font={11} fontWeight="semibold" foregroundStyle={item.color} padding={{ bottom: 4 }}>
            {suffix}
          </Text>
          <Spacer />
        </HStack>
      </VStack>
    </ZStack>
  )
}
