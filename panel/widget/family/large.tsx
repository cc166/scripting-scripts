import { ZStack, VStack, HStack, Spacer, Text, Image, Button } from "scripting"
import { Anniversary, PanelSettings, Shortcut } from "../../util/const"
import { AnnivCard } from "../comp/anniv-card"
import { StatusRow } from "../comp/status-row"
import { ShortcutRow } from "../comp/shortcut-circle"
import { PanelBackground } from "../comp/bg"
import { WeatherDetailBar } from "../comp/weather-detail-bar"
import { WeatherCache } from "../../util/weather"
import { RefreshIntent } from "../../app_intents"

interface Props {
  anniversaries: Anniversary[]
  shortcuts: Shortcut[]
  settings: PanelSettings
  weather: WeatherCache | null
}

/**
 * 大尺寸（仪表面板）：
 *   顶部：日期 + Wi-Fi/蜂窝（紧凑） + 刷新
 *     —— 顶部天气已移除；电量由系统状态栏呈现
 *   一行：纪念日 / 倒数日（最多 3 张，past + future 混排，按数据顺序）
 *   一行：天气详情条（状况 · 温区 · 体感 · 位置 / 日落 · UV · 降水）—— 仅天气可用时显示
 *   快捷入口 行 1（×5）
 *   快捷入口 行 2（×5）
 *   快捷入口 行 3（×5）
 */
export function View({ anniversaries, shortcuts, settings, weather }: Props) {
  const today = new Date()
  const dateText = `${today.getMonth() + 1}月${today.getDate()}日 ${weekday(today)}`

  const showWeather = settings.showWeather && settings.weather.enabled
  // 第二行：仅纪念日 / 倒数日，最多 3 格（past + future 混排）
  const annivs = settings.showAnniversary ? anniversaries.slice(0, 3) : []

  const rows = settings.showShortcuts ? chunk(shortcuts.slice(0, 15), 5) : []

  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <PanelBackground colors={settings.bgGradient} transparent={settings.transparentBackground} />
      <VStack spacing={10} padding={14} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        {/* 顶部 header：日期 + Wi-Fi/蜂窝 + 刷新 */}
        <HStack spacing={8}>
          <Text font={13} fontWeight="semibold" foregroundStyle="label">{dateText}</Text>
          <Spacer />
          {settings.showStatus && (
            <StatusRow items={settings.statusItems} variant="compact" />
          )}
          <Button intent={RefreshIntent({})} buttonStyle="plain">
            <Image
              systemName="arrow.clockwise"
              font={12}
              fontWeight="semibold"
              foregroundStyle={settings.accent}
              padding={{ leading: 4 }}
            />
          </Button>
        </HStack>

        {/* 第二行：纪念日 / 倒数日 */}
        {annivs.length > 0 && (
          <HStack spacing={8}>
            {annivs.map((a, i) => (
              <HStack key={`a-${i}`} frame={{ maxWidth: "infinity" }}>
                <AnnivCard item={a} variant="compact" />
              </HStack>
            ))}
          </HStack>
        )}

        {/* 第三行：天气详情条（仅在有天气数据时显示） */}
        {showWeather && weather && (
          <WeatherDetailBar data={weather} accent={settings.accent} />
        )}

        {/* 快捷入口：最多 3 行 × 5 列 */}
        {rows.map((row, i) => (
          <ShortcutRow key={`r-${i}`} items={row} perRow={5} size={42} transparent={settings.transparentBackground} />
        ))}

        <Spacer />
      </VStack>
    </ZStack>
  )
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function weekday(d: Date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]
}
