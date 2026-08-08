/* App Store iTunes Search API：按名称搜索，返回图标 URL */

// scripting 的 fetch 是全局函数（无需 import），但 Windows IDE 缺少 ambient 声明，
// 这里给一个最小占位声明压住「Cannot find name 'fetch'」的误报，运行时使用真实全局。
declare const fetch: (input: string, init?: any) => Promise<{
  ok: boolean
  status: number
  json(): Promise<any>
  text(): Promise<string>
}>

export interface AppIconResult {
  name: string
  bundleId: string
  iconUrl: string  // 100x100，去掉默认拉伸
  scheme?: string  // 大多没有公开
  url: string      // App Store 网址
}

const ENDPOINT = "https://itunes.apple.com/search"

/**
 * 通过 App 名称搜索 App Store
 * @param keyword App 名
 * @param country 国家代码，默认 cn
 */
export async function searchApp(keyword: string, country = "cn"): Promise<AppIconResult[]> {
  const url = `${ENDPOINT}?term=${encodeURIComponent(keyword)}&country=${country}&entity=software&limit=12`
  const res = await fetch(url, { method: "GET" })
  if (!res.ok) return []
  const data = await res.json() as {
    results?: Array<{
      trackName: string
      bundleId: string
      artworkUrl100?: string
      artworkUrl60?: string
      artworkUrl512?: string
      trackViewUrl?: string
    }>
  }
  return (data.results || []).map(r => ({
    name: r.trackName,
    bundleId: r.bundleId,
    iconUrl: r.artworkUrl512 || r.artworkUrl100 || r.artworkUrl60 || "",
    url: r.trackViewUrl || "",
  })).filter(r => r.iconUrl)
}
