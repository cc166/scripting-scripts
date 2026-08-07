import { Path, Script } from 'scripting'

export const BASE_PATH = Path.join(
  FileManager.appGroupDocumentsDirectory,
  Script.name
)
export const FILE_PATH = Path.join(BASE_PATH, 'launcher_apps.json')
export const CONFIG_PATH = Path.join(BASE_PATH, 'launcher_config.json')
export const CACHE_PATH = Path.join(BASE_PATH, 'cache')
export const FOLDERS_PATH = Path.join(BASE_PATH, 'launcher_folders.json')

export function getIconCachePath(url: string) {
  if (!url) return ''
  const hash = Crypto.md5(Data.fromRawString(url)!).toHexString()
  return Path.join(CACHE_PATH, `${hash}.png`)
}

export interface AppItem {
  id: string
  name: string
  icon: string
  iconType?: 'symbol' | 'image' | 'transparent_image'
  mode?: 'url' | 'bundleId'
  url: string
  bundleId?: string
  color: string
  folderId?: string
}

export interface Folder {
  id: string
  name: string
}

export interface Config {
  shape: 'rounded' | 'circle'
  iconSize: number
  spacing: number
  widgetAccentedRenderingMode:
    | 'accented'
    | 'desaturated'
    | 'accentedDesaturated'
    | 'fullColor'
}

export const DEFAULT_CONFIG: Config = {
  shape: 'rounded',
  iconSize: 50,
  spacing: 15,
  widgetAccentedRenderingMode: 'fullColor'
}

const ICON_NAME_MIGRATIONS: Record<string, string> = {
  'yen.sign.circle.fill': 'creditcard.fill',
  'yensign.circle.fill': 'creditcard.fill'
}

const DEFAULT_APP_PROFILES: Record<string, Partial<AppItem>> = {
  微信: {
    bundleId: 'com.tencent.xin',
    icon: 'message.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    color: '#07C160'
  },
  支付宝: {
    bundleId: 'com.alipay.iphoneclient',
    icon: 'creditcard.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    color: '#1677FF'
  },
  设置: {
    bundleId: 'com.apple.Preferences',
    icon: 'gear',
    iconType: 'symbol',
    mode: 'bundleId',
    color: '#8E8E93'
  },
  扫一扫: {
    bundleId: 'com.tencent.xin',
    icon: 'qrcode.viewfinder',
    iconType: 'symbol',
    mode: 'url',
    url: 'weixin://scanqrcode',
    color: '#07C160'
  },
  付款码: {
    bundleId: 'com.alipay.iphoneclient',
    icon: 'creditcard.viewfinder',
    iconType: 'symbol',
    mode: 'url',
    url: 'alipayqr://platformapi/startapp?saId=10000007',
    color: '#1677FF'
  },
  乘车码: {
    bundleId: 'com.alipay.iphoneclient',
    icon: 'bus.fill',
    iconType: 'symbol',
    mode: 'url',
    url: 'alipayqr://platformapi/startapp?saId=200011235',
    color: '#1677FF'
  },
  日历: {
    bundleId: 'com.apple.mobilecal',
    icon: 'calendar',
    iconType: 'symbol',
    mode: 'bundleId',
    color: '#FF3B30'
  },
  照片: {
    bundleId: 'com.apple.mobileslideshow',
    icon: 'photo.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    color: '#FF2D55'
  }
}

export function migrateAppIcons(apps: AppItem[]): AppItem[] {
  return apps.map(app => {
    const migratedIcon = ICON_NAME_MIGRATIONS[app.icon]
    return migratedIcon ? { ...app, icon: migratedIcon } : app
  })
}

export function normalizeApp(app: AppItem): AppItem {
  const migrated = migrateAppIcons([app])[0]
  const profile = DEFAULT_APP_PROFILES[migrated.name]

  if (!profile) {
    return {
      ...migrated,
      iconType:
        migrated.iconType ??
        (migrated.icon.startsWith('http') ? 'image' : 'symbol')
    }
  }

  return {
    ...migrated,
    ...profile,
    icon: profile.icon ?? migrated.icon,
    iconType:
      profile.iconType ??
      migrated.iconType ??
      (migrated.icon.startsWith('http') ? 'image' : 'symbol'),
    mode: profile.mode ?? migrated.mode,
    url: profile.url ?? migrated.url,
    bundleId: profile.bundleId ?? migrated.bundleId,
    color: profile.color ?? migrated.color
  }
}

export function normalizeApps(apps: AppItem[]): AppItem[] {
  return apps.map(app => normalizeApp(app))
}

export const DEFAULT_APPS: AppItem[] = [
  {
    id: '1',
    name: '微信',
    icon: 'message.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    url: 'weixin://',
    bundleId: 'com.tencent.xin',
    color: '#07C160'
  },
  {
    id: '2',
    name: '支付宝',
    icon: 'creditcard.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    url: 'alipay://',
    bundleId: 'com.alipay.iphoneclient',
    color: '#1677FF'
  },
  {
    id: '3',
    name: '设置',
    icon: 'gear',
    iconType: 'symbol',
    mode: 'bundleId',
    url: 'App-Prefs:root',
    bundleId: 'com.apple.Preferences',
    color: '#8E8E93'
  },
  {
    id: '4',
    name: '扫一扫',
    icon: 'qrcode.viewfinder',
    iconType: 'symbol',
    mode: 'url',
    url: 'weixin://scanqrcode',
    bundleId: 'com.tencent.xin',
    color: '#07C160'
  },
  {
    id: '5',
    name: '付款码',
    icon: 'creditcard.viewfinder',
    iconType: 'symbol',
    mode: 'url',
    url: 'alipayqr://platformapi/startapp?saId=10000007',
    bundleId: 'com.alipay.iphoneclient',
    color: '#1677FF'
  },
  {
    id: '6',
    name: '乘车码',
    icon: 'bus.fill',
    iconType: 'symbol',
    mode: 'url',
    url: 'alipayqr://platformapi/startapp?saId=200011235',
    bundleId: 'com.alipay.iphoneclient',
    color: '#1677FF'
  },
  {
    id: '7',
    name: '日历',
    icon: 'calendar',
    iconType: 'symbol',
    mode: 'bundleId',
    url: 'calshow://',
    bundleId: 'com.apple.mobilecal',
    color: '#FF3B30'
  },
  {
    id: '8',
    name: '照片',
    icon: 'photo.fill',
    iconType: 'symbol',
    mode: 'bundleId',
    url: 'photos-redirect://',
    bundleId: 'com.apple.mobileslideshow',
    color: '#FF2D55'
  }
]
