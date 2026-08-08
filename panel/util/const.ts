/* ======================================================================
 * 仪表面板 - 数据模型
 * ====================================================================== */
import { Color } from "scripting"

/** 纪念日 / 倒计时项 */
export interface Anniversary {
  id: string
  /** 标题，例如 "我和小美" / "高考" */
  title: string
  /** 模式：past = 已经在一起 X 天；future = 距离 X 还有 X 天 */
  mode: "past" | "future"
  /** 目标日期 ISO（yyyy-MM-dd） */
  date: string
  /** 主题色（systemColor 关键字 / HEX / rgba） */
  color: Color
  /** SF Symbol 图标 */
  icon: string
  /** 是否每年重复（仅 future 有效，例如生日、纪念日） */
  yearly?: boolean
}

/** 快捷入口（5 个/行 × 最多 3 行） */
export interface Shortcut {
  id: string
  name: string
  /** SF Symbol 图标名（与 iconUrl 二选一，iconUrl 优先） */
  icon: string
  /** 远程图标 URL（来自 App Store iTunes 搜索） */
  iconUrl?: string
  /** 跳转 URL（scheme / https / shortcuts） */
  url: string
  /** 主题色（用于 fallback 圆形底色 + SF Symbol 颜色） */
  color: Color
  /** 是否在 widget 中显示，默认为 true（缺省视为 true，向后兼容老数据） */
  enabled?: boolean
}

/**
 * 状态项（仅保留 iOS 允许第三方 widget 读取真实状态的项）
 * - 蓝牙 / 隔空投送 / 专注：iOS 不开放查询，已移除展示
 * - 电量：系统右上角自带，面板内不重复展示，已移除
 */
export type StatusKey = "wifi" | "cellular"

export interface StatusItem {
  key: StatusKey
  /** 是否在 widget 中显示 */
  enabled: boolean
  /**
   * 自定义点击跳转 URL，若为空则使用 STATUS_META[key].url 默认值。
   * 推荐值：
   * - prefs:root=WIFI / prefs:root=Bluetooth …（子页深链，部分 iOS 版本生效）
   * - shortcuts://run-shortcut?name=XXX（最稳，需用户自建快捷指令）
   * - App-Prefs:root=…（旧形式，新系统多数已失效，仅落到设置首页）
   */
  customUrl?: string
}

/** 仪表面板主题 */
export type PanelTheme = "auto" | "light" | "dark"

/** 天气配置 */
export interface WeatherSettings {
  /** 是否显示天气卡片 */
  enabled: boolean
  /**
   * 位置模式
   * - auto：使用设备定位（widget 中需开启 widget 定位授权）
   * - manual：使用下方 manualLat/manualLon + manualName
   */
  mode: "auto" | "manual"
  /** 手动经度 */
  manualLon?: number
  /** 手动纬度 */
  manualLat?: number
  /** 手动城市名（展示用） */
  manualName?: string
  /** 单位仅展示用，°C / °F 由系统格式化决定，这里保留扩展位 */
  unit?: "metric" | "imperial"
}

/** 全局设置 */
export interface PanelSettings {
  /** 主题 */
  theme: PanelTheme
  /** 主题强调色（systemColor 关键字 / HEX / rgba） */
  accent: Color
  /** 是否在大尺寸 widget 顶部展示纪念日 */
  showAnniversary: boolean
  /** 是否展示状态行 */
  showStatus: boolean
  /** 是否展示快捷入口 */
  showShortcuts: boolean
  /** 是否展示天气卡片 */
  showWeather: boolean
  /** 状态项配置（顺序+开关） */
  statusItems: StatusItem[]
  /** 用户自选 widget 背景渐变（top, bottom） */
  bgGradient: [Color, Color]
  /** 是否使用透明背景（启用后忽略 bgGradient，让 widget 直接透出系统壁纸） */
  transparentBackground: boolean
  /** 天气配置 */
  weather: WeatherSettings
}

/* ----------- 存储 key ------------- */
export const STORAGE = {
  shortcuts: "panel.shortcuts.v2",
  anniversaries: "panel.anniversaries.v1",
  settings: "panel.settings.v2",
  /** 天气缓存 */
  weatherCache: "panel.weather.cache.v1",
} as const

/* ----------- 备选项 ------------- */

export const ICON_PRESETS = [
  "link", "cart.fill", "creditcard.fill", "phone.fill", "envelope.fill",
  "message.fill", "calendar", "map.fill", "car.fill", "house.fill",
  "music.note", "camera.fill", "magnifyingglass", "bookmark.fill", "star.fill",
  "bolt.fill", "gear", "person.fill", "leaf.fill", "flame.fill",
  "heart.fill", "gift.fill", "graduationcap.fill", "airplane", "sparkles",
]

export const COLOR_PRESETS: Color[] = [
  "systemBlue", "systemRed", "systemOrange", "systemYellow",
  "systemGreen", "systemTeal", "systemIndigo", "systemPurple",
  "systemPink", "systemBrown", "systemGray",
]

export const ANNIV_ICON_PRESETS = [
  "heart.fill", "gift.fill", "star.fill", "calendar", "graduationcap.fill",
  "airplane", "balloon.fill", "birthday.cake.fill", "figure.2", "flame.fill",
]

/** 状态项文案/图标映射（运行时使用） */
export const STATUS_META: Record<StatusKey, {
  label: string
  iconOn: string
  iconOff: string
  color: Color
  /**
   * 默认点击跳转的 URL。
   *
   * iOS 16/17/18 对 `prefs:root=...` 的访问限制非常严格：
   * 第三方 App / Widget 直接打开往往被系统拒绝（表现为打开宿主 App 而非进入设置）。
   *
   * 经测试目前对第三方相对友好的形式是 `App-Prefs:root=...`（带连字符、首字母大写），
   * 在多数 iOS 版本上能落到设置子页或设置首页；如仍被拒，建议用户改为 shortcuts://
   * 跳转到自建快捷指令（最稳）。
   */
  url: string
  /** 推荐替代方案（在设置 UI 里展示给用户做参考） */
  altLabel?: string
  altUrl?: string
}> = {
  wifi: {
    label: "Wi-Fi",
    iconOn: "wifi",
    iconOff: "wifi.slash",
    color: "systemBlue",
    url: "App-Prefs:root=WIFI",
    altLabel: "运行「Wi-Fi」快捷指令（最稳）",
    altUrl: "shortcuts://run-shortcut?name=Wi-Fi",
  },
  cellular: {
    label: "蜂窝",
    iconOn: "antenna.radiowaves.left.and.right",
    iconOff: "antenna.radiowaves.left.and.right.slash",
    color: "systemGreen",
    url: "App-Prefs:root=MOBILE_DATA_SETTINGS_ID",
    altLabel: "运行「蜂窝」快捷指令（最稳）",
    altUrl: "shortcuts://run-shortcut?name=蜂窝",
  },
}

export const STATUS_KEY_LIST: StatusKey[] = ["wifi", "cellular"]

/* ----------- 渐变预设 ------------- */
export const GRADIENT_PRESETS: Array<{ name: string; value: [Color, Color] }> = [
  { name: "晨曦",   value: ["#FFE5B4", "#FFB6C1"] },
  { name: "海洋",   value: ["#4FACFE", "#00F2FE"] },
  { name: "极光",   value: ["#A1FFCE", "#FAFFD1"] },
  { name: "夜空",   value: ["#1E3C72", "#2A5298"] },
  { name: "薰衣草", value: ["#C2B6F8", "#7E5BEF"] },
  { name: "石墨",   value: ["#2C2C2E", "#1C1C1E"] },
]
