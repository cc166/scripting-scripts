import { ZStack, VStack, HStack, Text, Image, Spacer, RoundedRectangle, Link, Color } from "scripting"
import { WeatherCache } from "../../util/weather"

/**
 * 天气详情条（两行 / 仅 Large 使用）
 *
 * 第一行：状况 · 今日 X°~Y° · 体感 · 湿度          [位置]
 * 第二行：日落 · UV X(中) · 降水概率 X%
 *
 * 字段全部来自 Open-Meteo 的 daily / current；缺字段会自动跳过（仍能优雅展示）。
 */
export function WeatherDetailBar({
  data,
  accent = "systemBlue",
}: {
  data: WeatherCache | null
  accent?: Color
}) {
  if (!data) return null

  const hasRange = data.tempMin != null && data.tempMax != null
  const hasSun = !!data.sunset
  const hasUV = data.uvIndex != null
  const hasPrecip = data.precipProb != null
  const hasSecondLine = hasSun || hasUV || hasPrecip

  return (
    <Link url={`scripting://run/${encodeURIComponent("panel")}`}>
      <ZStack frame={{ maxWidth: "infinity" }}>
        <RoundedRectangle
          cornerRadius={12}
          fill={accent}
          opacity={0.10}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />
        <VStack
          alignment="leading"
          spacing={4}
          padding={{ top: 8, bottom: 8, leading: 12, trailing: 12 }}
          frame={{ maxWidth: "infinity" }}
        >
          {/* 第一行：状况 · 温区 · 体感 · 湿度          [位置] */}
          <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
            <Image systemName={data.symbol} font={12} foregroundStyle={accent} />
            <Text font={11} fontWeight="medium" foregroundStyle="label" lineLimit={1}>
              {data.conditionText}
            </Text>
            {hasRange && (
              <>
                <Text font={11} foregroundStyle="tertiaryLabel">·</Text>
                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {data.tempMin}°~{data.tempMax}°
                </Text>
              </>
            )}
            <Text font={11} foregroundStyle="tertiaryLabel">·</Text>
            <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
              体感 {data.feelsLike}°
            </Text>
            <Spacer />
            <Image systemName="location.fill" font={10} foregroundStyle="tertiaryLabel" />
            <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
              {data.place}
            </Text>
          </HStack>

          {/* 第二行：日落 · UV · 降水概率 · 湿度 */}
          {hasSecondLine && (
            <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
              {hasSun && (
                <>
                  <Image systemName="sunset.fill" font={10} foregroundStyle="systemOrange" />
                  <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                    日落 {data.sunset}
                  </Text>
                </>
              )}

              {hasUV && (
                <>
                  {hasSun && <Text font={11} foregroundStyle="tertiaryLabel">·</Text>}
                  <Image systemName="sun.max.fill" font={10} foregroundStyle="systemYellow" />
                  <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                    UV {data.uvIndex}{data.uvLevel ? `(${data.uvLevel})` : ""}
                  </Text>
                </>
              )}

              {hasPrecip && (
                <>
                  {(hasSun || hasUV) && <Text font={11} foregroundStyle="tertiaryLabel">·</Text>}
                  <Image systemName="drop.fill" font={10} foregroundStyle="systemBlue" />
                  <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                    降水 {data.precipProb}%
                  </Text>
                </>
              )}

              <Spacer />
              <Image systemName="humidity" font={10} foregroundStyle="tertiaryLabel" />
              <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                {data.humidity}%
              </Text>
            </HStack>
          )}
        </VStack>
      </ZStack>
    </Link>
  )
}
