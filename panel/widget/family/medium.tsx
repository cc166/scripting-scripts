import { ZStack, VStack, HStack, Spacer, Text, Image, Button } from "scripting"
import { Anniversary, PanelSettings, Shortcut } from "../../util/const"
import { AnnivCard } from "../comp/anniv-card"
import { StatusRow } from "../comp/status-row"
import { ShortcutRow } from "../comp/shortcut-circle"
import { PanelBackground } from "../comp/bg"
import { WeatherCard } from "../comp/weather-card"
import { WeatherCache } from "../../util/weather"
import { RefreshIntent } from "../../app_intents"

interface Props {
  anniversaries: Anniversary[]
  shortcuts: Shortcut[]
  settings: PanelSettings
  weather: WeatherCache | null
}

/**
 * 中尺寸：
 *   顶 header：日期 + Wi-Fi/蜂窝（紧凑） + 刷新
 *     —— 不再单独占一行展示状态行，节省垂直空间
 *   中行（compact 横向）：天气 + 纪念日（1 张）
 *   底行：快捷入口（×5）
 */
export function View({ anniversaries, shortcuts, settings, weather }: Props) {
  const today = new Date()
  const dateText = `${today.getMonth() + 1}/${today.getDate()} ${weekday(today)}`

  const showWeather = settings.showWeather && settings.weather.enabled
  const annivs = settings.showAnniversary ? anniversaries.slice(0, 2) : []

  // 中间最多两块：天气 + 1 张纪念日；若无天气则两张纪念日
  const topCells: Array<{ kind: "weather" } | { kind: "anniv"; data: Anniversary }> = []
  if (showWeather) topCells.push({ kind: "weather" })
  for (const a of annivs) {
    if (topCells.length >= 2) break
    topCells.push({ kind: "anniv", data: a })
  }

  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <PanelBackground colors={settings.bgGradient} transparent={settings.transparentBackground} />
      <VStack spacing={8} padding={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        {/* 顶 header：日期 + Wi-Fi/蜂窝 + 刷新 */}
        <HStack spacing={8}>
          <Text font={12} fontWeight="semibold" foregroundStyle="label">{dateText}</Text>
          <Spacer />
          {settings.showStatus && (
            <StatusRow items={settings.statusItems} variant="compact" />
          )}
          <Button intent={RefreshIntent({})} buttonStyle="plain">
            <Image
              systemName="arrow.clockwise"
              font={11}
              fontWeight="semibold"
              foregroundStyle={settings.accent}
              padding={{ leading: 4 }}
            />
          </Button>
        </HStack>

        {topCells.length > 0 && (
          <HStack spacing={8}>
            {topCells.map((c, i) => (
              <HStack key={`t-${i}`} frame={{ maxWidth: "infinity" }}>
                {c.kind === "weather"
                  ? <WeatherCard data={weather} variant="compact" accent={settings.accent} />
                  : <AnnivCard item={c.data} variant="compact" />}
              </HStack>
            ))}
          </HStack>
        )}

        {settings.showShortcuts && (
          <ShortcutRow items={shortcuts.slice(0, 5)} perRow={5} size={36} transparent={settings.transparentBackground} />
        )}

        <Spacer />
      </VStack>
    </ZStack>
  )
}

function weekday(d: Date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]
}
