import { ZStack, VStack, HStack, Text, Spacer } from "scripting"
import { Anniversary, PanelSettings, Shortcut } from "../../util/const"
import { AnnivCard } from "../comp/anniv-card"
import { ShortcutCircle } from "../comp/shortcut-circle"
import { PanelBackground } from "../comp/bg"
import { WeatherCard } from "../comp/weather-card"
import { WeatherCache } from "../../util/weather"

interface Props {
  anniversaries: Anniversary[]
  shortcuts: Shortcut[]
  settings: PanelSettings
  weather: WeatherCache | null
}

/** 小尺寸：顶部天气 + 日期 / 1 张纪念日 / 4 个圆形入口 */
export function View({ anniversaries, shortcuts, settings, weather }: Props) {
  const a = settings.showAnniversary ? anniversaries[0] : undefined
  const showWeather = settings.showWeather && settings.weather.enabled
  const today = new Date()
  const dateText = `${today.getMonth() + 1}/${today.getDate()} ${weekday(today)}`

  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <PanelBackground colors={settings.bgGradient} transparent={settings.transparentBackground} />
      <VStack spacing={6} padding={10} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        {/* 顶部：天气 + 日期 */}
        <HStack spacing={6}>
          {showWeather && <WeatherCard data={weather} variant="inline" accent={settings.accent} />}
          <Spacer />
          <Text font={11} fontWeight="medium" foregroundStyle="secondaryLabel">{dateText}</Text>
        </HStack>

        {a ? (
          <AnnivCard item={a} variant="large" />
        ) : (
          <Spacer />
        )}

        {/* 4 个圆形入口 */}
        {settings.showShortcuts && shortcuts.length > 0 && (
          <HStack frame={{ maxWidth: "infinity" }}>
            {shortcuts.slice(0, 4).map((s) => (
              <HStack key={s.id} frame={{ maxWidth: "infinity" }}>
                <ShortcutCircle item={s} size={32} transparent={settings.transparentBackground} />
              </HStack>
            ))}
          </HStack>
        )}
      </VStack>
    </ZStack>
  )
}

function weekday(d: Date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]
}
