import { Widget } from "scripting"
import {
  loadShortcuts, loadAnniversaries, loadSettings,
} from "./util/store"
import { getWeatherForWidget, WeatherCache } from "./util/weather"
import { cacheIcons } from "./util/icon-cache"

import { View as SmallView } from "./widget/family/small"
import { View as MediumView } from "./widget/family/medium"
import { View as LargeView } from "./widget/family/large"

async function run() {
  const settings = loadSettings()

  // 仅在用户启用天气时才请求，避免无谓的定位
  let weather: WeatherCache | null = null
  if (settings.showWeather && settings.weather.enabled) {
    weather = await getWeatherForWidget()
  }

  const anniversaries = loadAnniversaries()
  // 过滤被用户隐藏的快捷入口（enabled === false）；缺省字段视为启用
  const shortcuts = loadShortcuts().filter(s => s.enabled !== false)
  if (!settings.transparentBackground) {
    await cacheIcons(shortcuts.map(s => s.iconUrl))
  }

  const props = { anniversaries, shortcuts, settings, weather }

  const PresentView = () => {
    switch (Widget.family) {
      case "systemSmall":  return <SmallView  {...props} />
      case "systemMedium": return <MediumView {...props} />
      case "systemLarge":  return <LargeView  {...props} />
      default: return <LargeView {...props} />
    }
  }

  Widget.present(<PresentView />)
}

run()
