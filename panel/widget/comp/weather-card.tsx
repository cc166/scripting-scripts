import { ZStack, VStack, HStack, Text, Image, Spacer, RoundedRectangle, Link, Color } from "scripting"
import { WeatherCache } from "../../util/weather"

/**
 * 天气卡片
 * - large：占满高度，左温度 + 右图标 + 状况 + 城市
 * - compact：横向小卡，与纪念日齐高
 * - inline：极紧凑，单行（用于 small widget header）
 */
export function WeatherCard({
  data,
  variant = "compact",
  accent = "systemBlue",
}: {
  data: WeatherCache | null
  variant?: "large" | "compact" | "inline"
  accent?: Color
}) {
  // inline 极简
  if (variant === "inline") {
    if (!data) {
      return (
        <HStack spacing={3}>
          <Image systemName="cloud" font={11} foregroundStyle="secondaryLabel" />
          <Text font={11} foregroundStyle="secondaryLabel">--°</Text>
        </HStack>
      )
    }
    return (
      <HStack spacing={3}>
        <Image systemName={data.symbol} font={11} foregroundStyle={accent} />
        <Text font={11} fontWeight="medium" foregroundStyle="label">{data.temp}°</Text>
      </HStack>
    )
  }

  // 无数据态
  if (!data) {
    return (
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <RoundedRectangle
          cornerRadius={variant === "large" ? 20 : 14}
          fill={accent}
          opacity={0.12}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />
        <VStack spacing={4} padding={variant === "large" ? 16 : 10}>
          <Image systemName="location.slash" font={variant === "large" ? 22 : 14} foregroundStyle="secondaryLabel" />
          <Text font={variant === "large" ? 13 : 11} foregroundStyle="secondaryLabel">
            天气未授权
          </Text>
          {variant === "large" && (
            <Text font={10} foregroundStyle="tertiaryLabel">请在 App 中授予定位权限</Text>
          )}
        </VStack>
      </ZStack>
    )
  }

  if (variant === "large") {
    return (
      <Link url={`scripting://run/${encodeURIComponent("panel")}`}>
        <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          <RoundedRectangle
            cornerRadius={20}
            fill={accent}
            opacity={0.14}
            frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          />
          <VStack spacing={4} padding={16} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
            <HStack spacing={4}>
              <Image systemName="location.fill" font={11} foregroundStyle={accent} />
              <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{data.place}</Text>
              <Spacer />
            </HStack>

            <Spacer />

            <HStack alignment="bottom" spacing={6}>
              <Text font={42} fontWeight="heavy" foregroundStyle={accent}>{data.temp}</Text>
              <Text font={18} fontWeight="semibold" foregroundStyle={accent} padding={{ bottom: 6 }}>°</Text>
              <Spacer />
              <Image systemName={data.symbol} font={32} foregroundStyle={accent} />
            </HStack>

            <HStack spacing={6}>
              <Text font={11} foregroundStyle="label">{data.conditionText}</Text>
              <Text font={11} foregroundStyle="tertiaryLabel">·</Text>
              <Text font={11} foregroundStyle="secondaryLabel">体感 {data.feelsLike}°</Text>
              <Spacer />
              <Image systemName="humidity" font={10} foregroundStyle="secondaryLabel" />
              <Text font={11} foregroundStyle="secondaryLabel">{data.humidity}%</Text>
            </HStack>
          </VStack>
        </ZStack>
      </Link>
    )
  }

  // compact：与纪念日同高
  return (
    <ZStack frame={{ maxWidth: "infinity" }}>
      <RoundedRectangle
        cornerRadius={14}
        fill={accent}
        opacity={0.14}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
      <VStack alignment="leading" spacing={2} padding={10} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={4}>
          <Image systemName={data.symbol} foregroundStyle={accent} font={11} />
          <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
            {data.place}
          </Text>
          <Spacer />
        </HStack>
        <HStack alignment="bottom" spacing={3}>
          <Text font={26} fontWeight="heavy" foregroundStyle={accent}>{data.temp}</Text>
          <Text font={11} fontWeight="semibold" foregroundStyle={accent} padding={{ bottom: 4 }}>°</Text>
          <Spacer />
          <Text font={11} foregroundStyle="secondaryLabel" padding={{ bottom: 4 }}>
            {data.conditionText}
          </Text>
        </HStack>
      </VStack>
    </ZStack>
  )
}
