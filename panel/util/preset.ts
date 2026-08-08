import {
  Anniversary, Shortcut, PanelSettings, STATUS_KEY_LIST,
} from "./const"

/* 预设快捷入口（圆形按钮，5 个/行）
 * 说明：
 * - URL scheme 必须是「目标 App 自己注册的」才能拉起，仅靠 widget 这边填 URL 不会让 App 凭空支持
 * - 对应 App 必须已安装；未安装会落到 App Store 或无反应
 */
export const PRESET_ICON_URLS: Record<string, string> = {
  p_didi: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/d8/f8/0d/d8f80ded-465c-0b3e-3111-487a40f8328c/AppIcon_default-0-0-1x_U007emarketing-0-6-0-0-85-220.png/512x512bb.jpg",
  p_hello: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1c/26/c5/1c26c551-b32b-e7d8-ed00-77d36902a84a/AppIcon-0-0-1x_U007emarketing-0-8-0-0-85-220.png/512x512bb.jpg",
  p_dida: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/21/f6/75/21f6752b-ad81-af4c-8960-0ad555c003a8/AppIcon-0-0-1x_U007emarketing-0-11-0-0-85-220.png/512x512bb.jpg",
  p_12306: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/43/5e/ac/435eaceb-0c86-383c-c262-2e9a405c8ecf/AppIcon-0-0-1x_U007emarketing-0-9-0-0-85-220.png/512x512bb.jpg",
  p_taobao: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/06/8b/ce/068bce4a-71c6-a64d-fdd9-bab0b5bf0da6/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/512x512bb.jpg",
  p_jd: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ea/23/52/ea2352e2-f4c6-b3a6-5e55-2820e5e59e89/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg",
  p_pdd: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/2a/16/7d/2a167d1a-d777-ff46-6e55-43b53c2a02e7/AppIcon-1x_U007emarketing-0-8-0-0-0-85-220-0.png/512x512bb.jpg",
  p_xianyu: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c5/e4/4f/c5e44f03-14a4-345a-691c-d5181c53e384/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg",
  p_eudic: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ac/30/de/ac30de95-7065-f8e5-b55f-61d6fa557018/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg",
  p_meitu: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/88/aa/24/88aa243a-8ee8-40d9-7bb1-95c7e3689d53/AppIcon-0-0-1x_U007emarketing-0-9-0-85-220.png/512x512bb.jpg",
  p_wxwork: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/6e/f3/e1/6ef3e177-d47c-f550-cd1d-2d68d7cac114/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg",
  p_youku: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/26/9c/ca/269cca81-7260-3797-343d-234053e87990/AppIcon-0-0-1x_U007emarketing-0-9-0-0-85-220.png/512x512bb.jpg",
  p_youtube: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/20/ea/87/20ea8738-6fac-caea-ccc1-72d8375a2310/logo_youtube_2024_q4_color-0-0-1x_U007emarketing-0-0-0-7-0-0-0-85-220.png/512x512bb.jpg",
  p_shortcut: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7a/0c/b4/7a0cb40c-4ed2-4d65-fd2f-45b3584cf3d2/shortcuts-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg",
}

export const PRESET_SHORTCUTS: Shortcut[] = [
  // —— 出行 ——
  { id: "p_didi",      name: "滴滴",       icon: "car.fill",            url: "diditaxi://",       color: "systemOrange", iconUrl: PRESET_ICON_URLS.p_didi },
  { id: "p_hello",     name: "哈啰",       icon: "bicycle",             url: "hellobike://",      color: "systemBlue",   iconUrl: PRESET_ICON_URLS.p_hello },
  { id: "p_dida",      name: "嘀嗒",       icon: "car.2.fill",          url: "didapinche://",     color: "systemYellow", iconUrl: PRESET_ICON_URLS.p_dida },
  { id: "p_12306",     name: "12306",      icon: "tram.fill",           url: "cn.12306://",       color: "systemBlue",   iconUrl: PRESET_ICON_URLS.p_12306 },

  // —— 购物 ——
  { id: "p_taobao",    name: "淘宝",       icon: "bag.fill",            url: "taobao://",         color: "systemOrange", iconUrl: PRESET_ICON_URLS.p_taobao },
  { id: "p_jd",        name: "京东",       icon: "shippingbox.fill",    url: "openApp.jdMobile://", color: "systemRed", iconUrl: PRESET_ICON_URLS.p_jd },
  { id: "p_pdd",       name: "拼多多",     icon: "cart.fill",           url: "pinduoduo://",      color: "systemRed",    iconUrl: PRESET_ICON_URLS.p_pdd },
  { id: "p_xianyu",    name: "闲鱼",       icon: "fish.fill",           url: "fleamarket://",     color: "systemYellow", iconUrl: PRESET_ICON_URLS.p_xianyu },

  // —— 工具 / 工作 ——
  { id: "p_eudic",     name: "欧路词典",   icon: "character.book.closed.fill", url: "eudic://",   color: "systemBlue", iconUrl: PRESET_ICON_URLS.p_eudic },
  { id: "p_meitu",     name: "美图秀秀",   icon: "camera.aperture",     url: "mtxx://",           color: "systemPink",   iconUrl: PRESET_ICON_URLS.p_meitu },
  { id: "p_wxwork",    name: "企业微信",   icon: "briefcase.fill",      url: "wxwork://",         color: "systemBlue",   iconUrl: PRESET_ICON_URLS.p_wxwork },

  // —— 视频 ——
  { id: "p_youku",     name: "优酷",       icon: "play.rectangle.fill", url: "youku://",          color: "systemBlue", iconUrl: PRESET_ICON_URLS.p_youku },
  { id: "p_youtube",   name: "YouTube",    icon: "play.tv.fill",        url: "youtube://",        color: "systemRed",  iconUrl: PRESET_ICON_URLS.p_youtube },

  // —— 系统照片（iOS 内置 schema） ——
  { id: "p_photos",    name: "照片",       icon: "photo.on.rectangle.angled", url: "photos-redirect://", color: "systemPink" },

  // —— 快捷指令（运行指定指令；用户在编辑页填写指令名后会自动拼好 URL） ——
  { id: "p_shortcut",  name: "快捷指令",   icon: "wand.and.stars",      url: "shortcuts://",      color: "systemPurple", iconUrl: PRESET_ICON_URLS.p_shortcut },
]

export function findPresetIconUrl(item: Pick<Shortcut, "id" | "name" | "url" | "icon">): string | undefined {
  const byId = PRESET_ICON_URLS[item.id]
  if (byId) return byId
  const preset = PRESET_SHORTCUTS.find(shortcut =>
    shortcut.name === item.name ||
    shortcut.url === item.url ||
    shortcut.icon === item.icon
  )
  return preset?.iconUrl
}

/* 预设纪念日 */
export const PRESET_ANNIVERSARIES: Anniversary[] = [
  {
    id: "a_together",
    title: "在一起",
    mode: "past",
    date: "2024-05-20",
    color: "systemPink",
    icon: "heart.fill",
  },
  {
    id: "a_newyear",
    title: "新年",
    mode: "future",
    date: nextNewYear(),
    color: "systemRed",
    icon: "sparkles",
    yearly: true,
  },
]

function nextNewYear(): string {
  const now = new Date()
  const year = now.getFullYear() + (now.getMonth() === 11 && now.getDate() > 25 ? 1 : 1)
  return `${year}-01-01`
}

/* 默认全局设置 */
export const DEFAULT_SETTINGS: PanelSettings = {
  theme: "auto",
  accent: "systemPink",
  showAnniversary: true,
  showStatus: true,
  showShortcuts: true,
  showWeather: true,
  statusItems: STATUS_KEY_LIST.map((k) => ({
    key: k,
    enabled: true,
  })),
  bgGradient: ["#FFE5B4", "#FFB6C1"],
  transparentBackground: false,
  weather: {
    enabled: true,
    mode: "auto",
    unit: "metric",
  },
}
