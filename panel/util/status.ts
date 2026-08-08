/* 系统状态读取（电池为真实，网络仅做"是否在线"推断） */

declare const Device: {
  batteryLevel: number
  batteryState: "full" | "charging" | "unplugged" | "unknown"
  systemName: string
  systemVersion: string
  model: string
  networkInterfaces(): Record<string, Array<{
    address: string
    family: "IPv4" | "IPv6"
    isInternal: boolean
  }>>
}

/** 电池信息 */
export function getBattery(): { level: number; charging: boolean } {
  return {
    level: Math.round((Device.batteryLevel ?? 0) * 100),
    charging: Device.batteryState === "charging" || Device.batteryState === "full",
  }
}

/** 推断网络是否连接 + 是否走 Wi-Fi
 *  iOS 上 Wi-Fi 一般是 en0；蜂窝是 pdp_ip0
 */
export function getNetwork(): { online: boolean; wifi: boolean; cellular: boolean } {
  try {
    const ifs = Device.networkInterfaces?.() || {}
    const en0 = (ifs["en0"] || []).some(i => i.family === "IPv4" && !i.isInternal)
    const pdp = Object.keys(ifs)
      .filter(k => k.startsWith("pdp_ip"))
      .some(k => (ifs[k] || []).some(i => i.family === "IPv4" && !i.isInternal))
    return { online: en0 || pdp, wifi: en0, cellular: pdp }
  } catch {
    return { online: false, wifi: false, cellular: false }
  }
}

/** 把 0-100 映射到 SF Symbol 电池图标 */
export function batteryIcon(level: number, charging: boolean): string {
  if (charging) return "battery.100.bolt"
  if (level >= 88) return "battery.100"
  if (level >= 63) return "battery.75"
  if (level >= 38) return "battery.50"
  if (level >= 13) return "battery.25"
  return "battery.0"
}
