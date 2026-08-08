import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchWeather } from "./util/weather"
import { loadSettings } from "./util/store"

/**
 * 通用刷新：
 * - 若启用天气，则强制重新拉取一次天气（绕过缓存）
 * - 然后 reload 所有 widget，触发 Wi-Fi/电池等真实状态重读
 *
 * 注：新版 scripting 的 AppIntentFactory 强制要求传 params，
 * 这里不需要参数，所以约定传一个空对象。
 */
export const RefreshIntent = AppIntentManager.register({
  name: "panel.refresh",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: {}) => {
    try {
      const settings = loadSettings()
      if (settings.showWeather && settings.weather.enabled) {
        await fetchWeather(true)
      }
    } catch {
      // 失败也无所谓，至少 reload 一下让 UI 重新读真实状态
    }
    Widget.reloadAll()
  },
})

