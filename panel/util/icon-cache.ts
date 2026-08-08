import { Path, Script } from "scripting"

declare const fetch: (input: string, init?: any) => Promise<{
  ok: boolean
  data(): Promise<Data>
}>

const BASE_PATH = Path.join(FileManager.appGroupDocumentsDirectory, Script.name)
const CACHE_PATH = Path.join(BASE_PATH, "app-icons")

export function getIconCachePath(iconUrl?: string): string {
  if (!iconUrl) return ""
  const data = Data.fromRawString(iconUrl)
  if (!data) return ""
  const hash = Crypto.md5(data).toHexString()
  return Path.join(CACHE_PATH, `${hash}.png`)
}

export function getExistingIconCachePath(iconUrl?: string): string | undefined {
  const path = getIconCachePath(iconUrl)
  return path && FileManager.existsSync(path) ? path : undefined
}

export async function cacheIcon(iconUrl?: string): Promise<string | undefined> {
  if (!iconUrl) return undefined
  const path = getIconCachePath(iconUrl)
  if (!path) return undefined
  if (FileManager.existsSync(path)) return path

  try {
    if (!FileManager.existsSync(CACHE_PATH)) {
      FileManager.createDirectorySync(CACHE_PATH, true)
    }
    const res = await fetch(iconUrl)
    if (!res.ok) return undefined
    const data = await res.data()
    FileManager.writeAsDataSync(path, data)
    return path
  } catch (e) {
    console.error("cache app icon failed", e)
    return undefined
  }
}

export async function cacheIcons(iconUrls: Array<string | undefined>): Promise<void> {
  for (const iconUrl of iconUrls) {
    await cacheIcon(iconUrl)
  }
}
