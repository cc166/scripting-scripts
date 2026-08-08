/* ======================================================================
 * 天气：定位 + Open-Meteo + 缓存
 * ======================================================================
 *
 * 数据源：Open-Meteo（https://open-meteo.com）
 *   - 完全免费、无需 API Key、无需注册
 *   - 国内可访问；为提高可靠性使用主备双域名 fallback
 *   - 文档：https://open-meteo.com/en/docs
 *
 * 流程：定位 → 反向地理 → Open-Meteo forecast → 缓存
 *
 * 缓存 30 分钟，避免频繁定位/请求。
 */

import { STORAGE } from "./const"

declare const Storage: {
  get<T = any>(key: string): T | null
  set(key: string, value: any): void
  remove(key: string): void
}

/** Scripting Location API */
declare const Location: {
  isAuthorizedForWidgetUpdates: boolean
  requestCurrent(options?: { forceRequest?: boolean }): Promise<{
    latitude: number
    longitude: number
    timestamp: number
  } | null>
  reverseGeocode(options: {
    latitude: number
    longitude: number
    locale?: string
  }): Promise<Array<{
    name?: string
    locality?: string
    subLocality?: string
    administrativeArea?: string
    country?: string
  }> | null>
}

/** 全局 fetch（Scripting 运行时提供） */
declare const fetch: (input: string, init?: any) => Promise<{
  ok: boolean
  status: number
  json(): Promise<any>
  text(): Promise<string>
}>

export interface WeatherCache {
  /** 用于显示的城市/区名 */
  place: string
  /** 当前温度（已四舍五入） */
  temp: number
  /** "23°C" 已格式化 */
  tempText: string
  /** 体感温度 */
  feelsLike: number
  /** 天气状况（WMO code 字符串，例如 "wmo-3"） */
  condition: string
  /** 中文天气描述 */
  conditionText: string
  /** SF Symbol */
  symbol: string
  /** 湿度 0-100 */
  humidity: number
  /** 缓存时间戳 ms */
  fetchedAt: number
  /** 经纬度 */
  lat: number
  lon: number

  /* ---- 扩展字段（Open-Meteo daily 提供） ---- */
  /** 今日最低温（整数） */
  tempMin?: number
  /** 今日最高温（整数） */
  tempMax?: number
  /** 日出（"06:12" 24h，本地时区） */
  sunrise?: string
  /** 日落（"18:42" 24h，本地时区） */
  sunset?: string
  /** 当日紫外线最大指数（整数） */
  uvIndex?: number
  /** 紫外线等级文案：弱/中/强/很强/极强 */
  uvLevel?: string
  /** 当日降水概率最大值 0-100 */
  precipProb?: number
  /** 是否白天（用于挑选 SF Symbol 日/夜版本） */
  isDay?: boolean
}

/* ============================ 缓存 ============================ */
const CACHE_TTL = 30 * 60 * 1000 // 30 分钟

export function loadWeatherCache(): WeatherCache | null {
  return Storage.get<WeatherCache>(STORAGE.weatherCache)
}
export function saveWeatherCache(c: WeatherCache) {
  Storage.set(STORAGE.weatherCache, c)
}
export function clearWeatherCache() {
  Storage.remove(STORAGE.weatherCache)
}

export function isCacheFresh(c: WeatherCache | null): boolean {
  if (!c) return false
  return Date.now() - c.fetchedAt < CACHE_TTL
}

/* ============================ WMO 天气码翻译 ============================
 * Open-Meteo 使用 WMO Code 4677：
 *   https://open-meteo.com/en/docs#weathervariables
 * 这里给出中文文案和 SF Symbol（区分日/夜）。
 */
interface WmoMeta {
  text: string
  /** 白天 SF Symbol */
  day: string
  /** 夜间 SF Symbol */
  night: string
}

const WMO: Record<number, WmoMeta> = {
  0:  { text: "晴",       day: "sun.max.fill",            night: "moon.stars.fill" },
  1:  { text: "大部晴朗", day: "sun.max.fill",            night: "moon.stars.fill" },
  2:  { text: "局部多云", day: "cloud.sun.fill",          night: "cloud.moon.fill" },
  3:  { text: "多云",     day: "cloud.fill",              night: "cloud.fill" },
  45: { text: "雾",       day: "cloud.fog.fill",          night: "cloud.fog.fill" },
  48: { text: "冰雾",     day: "cloud.fog.fill",          night: "cloud.fog.fill" },
  51: { text: "毛毛雨",   day: "cloud.drizzle.fill",      night: "cloud.drizzle.fill" },
  53: { text: "毛毛雨",   day: "cloud.drizzle.fill",      night: "cloud.drizzle.fill" },
  55: { text: "毛毛雨",   day: "cloud.drizzle.fill",      night: "cloud.drizzle.fill" },
  56: { text: "冻毛毛雨", day: "cloud.sleet.fill",        night: "cloud.sleet.fill" },
  57: { text: "冻毛毛雨", day: "cloud.sleet.fill",        night: "cloud.sleet.fill" },
  61: { text: "小雨",     day: "cloud.rain.fill",         night: "cloud.rain.fill" },
  63: { text: "中雨",     day: "cloud.rain.fill",         night: "cloud.rain.fill" },
  65: { text: "大雨",     day: "cloud.heavyrain.fill",    night: "cloud.heavyrain.fill" },
  66: { text: "冻雨",     day: "cloud.sleet.fill",        night: "cloud.sleet.fill" },
  67: { text: "冻雨",     day: "cloud.sleet.fill",        night: "cloud.sleet.fill" },
  71: { text: "小雪",     day: "cloud.snow.fill",         night: "cloud.snow.fill" },
  73: { text: "中雪",     day: "cloud.snow.fill",         night: "cloud.snow.fill" },
  75: { text: "大雪",     day: "snowflake",               night: "snowflake" },
  77: { text: "雪粒",     day: "snowflake",               night: "snowflake" },
  80: { text: "阵雨",     day: "cloud.sun.rain.fill",     night: "cloud.moon.rain.fill" },
  81: { text: "阵雨",     day: "cloud.heavyrain.fill",    night: "cloud.heavyrain.fill" },
  82: { text: "强阵雨",   day: "cloud.heavyrain.fill",    night: "cloud.heavyrain.fill" },
  85: { text: "阵雪",     day: "cloud.snow.fill",         night: "cloud.snow.fill" },
  86: { text: "强阵雪",   day: "cloud.snow.fill",         night: "cloud.snow.fill" },
  95: { text: "雷暴",     day: "cloud.bolt.rain.fill",    night: "cloud.bolt.rain.fill" },
  96: { text: "雷暴伴冰雹", day: "cloud.bolt.rain.fill",  night: "cloud.bolt.rain.fill" },
  99: { text: "雷暴伴冰雹", day: "cloud.bolt.rain.fill",  night: "cloud.bolt.rain.fill" },
}

function wmoMeta(code: number): WmoMeta {
  return WMO[code] ?? { text: "未知", day: "questionmark.circle", night: "questionmark.circle" }
}

/** 兼容旧调用（部分组件可能仍引用 translateCondition）；现在直接返回输入或 WMO 文案 */
export function translateCondition(cond: string): string {
  // 形如 "wmo-3"
  const m = /^wmo-(\d+)$/.exec(cond)
  if (m) return wmoMeta(parseInt(m[1], 10)).text
  return cond
}

/** UV 指数 → 等级文案（WHO 标准） */
function uvLevelText(uv: number): string {
  if (uv < 3) return "弱"
  if (uv < 6) return "中"
  if (uv < 8) return "强"
  if (uv < 11) return "很强"
  return "极强"
}

/** "2026-05-26T18:42" → "18:42" */
function hhmm(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const i = iso.indexOf("T")
  if (i < 0) return undefined
  return iso.slice(i + 1, i + 6)
}

/* ============================ Open-Meteo 取数 ============================ */

const OPEN_METEO_HOSTS = [
  "https://api.open-meteo.com",
  "https://customer-api.open-meteo.com", // 备用域名（同样免 key 公开可访问）
]

interface OpenMeteoResp {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    weather_code?: number
    is_day?: number
  }
  daily?: {
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    sunrise?: string[]
    sunset?: string[]
    uv_index_max?: number[]
    precipitation_probability_max?: number[]
    weather_code?: number[]
  }
  current_units?: { temperature_2m?: string }
}

async function fetchFromOpenMeteo(lat: number, lon: number): Promise<OpenMeteoResp> {
  const params =
    `?latitude=${lat.toFixed(4)}` +
    `&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,weather_code` +
    `&timezone=auto` +
    `&forecast_days=1`

  let lastErr: any = null
  for (const host of OPEN_METEO_HOSTS) {
    const url = `${host}/v1/forecast${params}`
    try {
      const res = await fetch(url, { method: "GET" })
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`)
        continue
      }
      return await res.json() as OpenMeteoResp
    } catch (e) {
      lastErr = e
      continue
    }
  }
  throw new Error(`天气服务不可达：${String(lastErr?.message ?? lastErr)}`)
}

/* ============================ 主流程 ============================ */

import { loadSettings } from "./store"

/** 真正取一次天气；失败抛错。调用方负责回落到缓存。 */
export async function fetchWeather(force = false): Promise<WeatherCache> {
  const settings = loadSettings()
  const ws = settings.weather

  let lat: number | undefined
  let lon: number | undefined
  let placeOverride: string | undefined

  if (ws.mode === "manual" && typeof ws.manualLat === "number" && typeof ws.manualLon === "number") {
    lat = ws.manualLat
    lon = ws.manualLon
    placeOverride = ws.manualName
  } else {
    const loc = await Location.requestCurrent({ forceRequest: force })
    if (!loc) throw new Error("无法获取定位")
    lat = loc.latitude
    lon = loc.longitude
  }

  // 反向地理编码（失败不影响主流程）
  let place = placeOverride ?? ""
  if (!place) {
    try {
      const placemarks = await Location.reverseGeocode({
        latitude: lat,
        longitude: lon,
        locale: "zh-Hans-CN",
      })
      const p = placemarks?.[0]
      place = p?.locality || p?.subLocality || p?.administrativeArea || p?.name || ""
    } catch {
      // ignore
    }
  }

  const data = await fetchFromOpenMeteo(lat, lon)

  const cur = data.current ?? {}
  const daily = data.daily ?? {}
  const code = cur.weather_code ?? daily.weather_code?.[0] ?? 0
  const isDay = (cur.is_day ?? 1) === 1
  const meta = wmoMeta(code)

  const temp = Math.round(cur.temperature_2m ?? 0)
  const feels = Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0)
  const humid = Math.round(cur.relative_humidity_2m ?? 0)
  const unit = data.current_units?.temperature_2m ?? "°C"

  const tempMin = daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : undefined
  const tempMax = daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : undefined
  const sunrise = hhmm(daily.sunrise?.[0])
  const sunset  = hhmm(daily.sunset?.[0])
  const uvRaw   = daily.uv_index_max?.[0]
  const uvIndex = uvRaw != null ? Math.round(uvRaw) : undefined
  const uvLevel = uvIndex != null ? uvLevelText(uvIndex) : undefined
  const precipProb = daily.precipitation_probability_max?.[0] != null
    ? Math.round(daily.precipitation_probability_max[0])
    : undefined

  const cache: WeatherCache = {
    place: place || "当前位置",
    temp,
    tempText: `${temp}${unit}`,
    feelsLike: feels,
    condition: `wmo-${code}`,
    conditionText: meta.text,
    symbol: isDay ? meta.day : meta.night,
    humidity: humid,
    fetchedAt: Date.now(),
    lat, lon,
    tempMin, tempMax,
    sunrise, sunset,
    uvIndex, uvLevel,
    precipProb,
    isDay,
  }
  saveWeatherCache(cache)
  return cache
}

/**
 * Widget 端使用的"读天气"主入口。
 * - 命中缓存即返回
 * - 否则尝试请求；失败返回过期缓存（如果有）
 * - 都没有则返回 null
 */
export async function getWeatherForWidget(): Promise<WeatherCache | null> {
  const cached = loadWeatherCache()
  if (isCacheFresh(cached)) return cached
  try {
    return await fetchWeather(false)
  } catch {
    return cached // 过期也比没有好
  }
}
