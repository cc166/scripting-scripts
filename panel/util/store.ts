import {
  Shortcut, Anniversary, PanelSettings, StatusKey, STORAGE,
} from "./const"
import {
  PRESET_SHORTCUTS, PRESET_ANNIVERSARIES, DEFAULT_SETTINGS, findPresetIconUrl,
} from "./preset"
import { cacheIcon } from "./icon-cache"

// Storage 是 Scripting 的全局对象，无需 import
declare const Storage: {
  get<T = any>(key: string): T | null
  set(key: string, value: any): void
  remove(key: string): void
}

/* ============================ 通用 ID ============================ */
export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ============================ Shortcuts ============================ */
export function loadShortcuts(): Shortcut[] {
  const list = Storage.get<Shortcut[]>(STORAGE.shortcuts)
  if (!list) {
    Storage.set(STORAGE.shortcuts, PRESET_SHORTCUTS)
    return [...PRESET_SHORTCUTS]
  }
  const migrated = migratePresetShortcutIcons(list)
  if (migrated.changed) Storage.set(STORAGE.shortcuts, migrated.list)
  return migrated.list
}
export function saveShortcuts(list: Shortcut[]) {
  Storage.set(STORAGE.shortcuts, list)
  cacheShortcutIcons(list)
}
function migratePresetShortcutIcons(list: Shortcut[]): { list: Shortcut[]; changed: boolean } {
  let changed = false
  const next = list.map(item => {
    const iconUrl = findPresetIconUrl(item)
    if (!iconUrl || item.iconUrl) return item
    changed = true
    return { ...item, iconUrl }
  })
  return { list: next, changed }
}
function cacheShortcutIcons(list: Shortcut[]) {
  Promise.all(list.map(item => cacheIcon(item.iconUrl))).catch(e => {
    console.error("cache shortcut icons failed", e)
  })
}
export function upsertShortcut(item: Shortcut) {
  const list = loadShortcuts()
  const i = list.findIndex(x => x.id === item.id)
  if (i >= 0) list[i] = item
  else list.push(item)
  saveShortcuts(list)
}
export function removeShortcut(id: string) {
  saveShortcuts(loadShortcuts().filter(x => x.id !== id))
}
export function moveShortcut(id: string, dir: -1 | 1) {
  const list = loadShortcuts()
  const i = list.findIndex(x => x.id === id)
  if (i < 0) return
  const t = i + dir
  if (t < 0 || t >= list.length) return
  ;[list[i], list[t]] = [list[t], list[i]]
  saveShortcuts(list)
}
export function toggleShortcutEnabled(id: string) {
  const list = loadShortcuts()
  const it = list.find(x => x.id === id)
  if (!it) return
  // 缺省视为启用，因此首次切换 = 关闭
  it.enabled = !(it.enabled !== false)
  saveShortcuts(list)
}
export function resetShortcuts() {
  saveShortcuts([...PRESET_SHORTCUTS])
}

/* ============================ Anniversaries ============================ */
export function loadAnniversaries(): Anniversary[] {
  const list = Storage.get<Anniversary[]>(STORAGE.anniversaries)
  if (!list) {
    Storage.set(STORAGE.anniversaries, PRESET_ANNIVERSARIES)
    return [...PRESET_ANNIVERSARIES]
  }
  return list
}
export function saveAnniversaries(list: Anniversary[]) {
  Storage.set(STORAGE.anniversaries, list)
}
export function upsertAnniversary(item: Anniversary) {
  const list = loadAnniversaries()
  const i = list.findIndex(x => x.id === item.id)
  if (i >= 0) list[i] = item
  else list.push(item)
  saveAnniversaries(list)
}
export function removeAnniversary(id: string) {
  saveAnniversaries(loadAnniversaries().filter(x => x.id !== id))
}
export function moveAnniversary(id: string, dir: -1 | 1) {
  const list = loadAnniversaries()
  const i = list.findIndex(x => x.id === id)
  if (i < 0) return
  const t = i + dir
  if (t < 0 || t >= list.length) return
  ;[list[i], list[t]] = [list[t], list[i]]
  saveAnniversaries(list)
}
export function resetAnniversaries() {
  saveAnniversaries([...PRESET_ANNIVERSARIES])
}

/* ============================ Settings ============================ */
export function loadSettings(): PanelSettings {
  const s = Storage.get<PanelSettings>(STORAGE.settings)
  if (!s) {
    Storage.set(STORAGE.settings, DEFAULT_SETTINGS)
    return { ...DEFAULT_SETTINGS, statusItems: [...DEFAULT_SETTINGS.statusItems] }
  }
  // 合并 default 字段（避免老版本数据缺字段）+ 清洗已废弃的状态项（蓝牙/隔空投送/专注）
  const validKeys = new Set(DEFAULT_SETTINGS.statusItems.map(x => x.key))
  const cleanedItems = (s.statusItems ?? DEFAULT_SETTINGS.statusItems)
    .filter(x => validKeys.has(x.key))
  // 补齐：若用户老数据中缺少新版本里的某些 key，按默认顺序追加
  for (const def of DEFAULT_SETTINGS.statusItems) {
    if (!cleanedItems.find(x => x.key === def.key)) cleanedItems.push({ ...def })
  }
  return { ...DEFAULT_SETTINGS, ...s, statusItems: cleanedItems }
}
export function saveSettings(s: PanelSettings) {
  Storage.set(STORAGE.settings, s)
}
export function patchSettings(patch: Partial<PanelSettings>) {
  saveSettings({ ...loadSettings(), ...patch })
}
export function moveStatusItem(key: StatusKey, dir: -1 | 1) {
  const s = loadSettings()
  const i = s.statusItems.findIndex(x => x.key === key)
  if (i < 0) return
  const t = i + dir
  if (t < 0 || t >= s.statusItems.length) return
  ;[s.statusItems[i], s.statusItems[t]] = [s.statusItems[t], s.statusItems[i]]
  saveSettings(s)
}
export function toggleStatusItemEnabled(key: StatusKey) {
  const s = loadSettings()
  const item = s.statusItems.find(x => x.key === key)
  if (!item) return
  item.enabled = !item.enabled
  saveSettings(s)
}
export function setStatusItemUrl(key: StatusKey, url: string) {
  const s = loadSettings()
  const item = s.statusItems.find(x => x.key === key)
  if (!item) return
  const v = url.trim()
  if (v) item.customUrl = v
  else delete item.customUrl
  saveSettings(s)
}
