// File: index.tsx (取件码脚本 - 最终可运行修正版)

// =====================================
// 导入 Scripting UI 组件
// =====================================
import {
  Navigation, NavigationStack, VStack, Form, Section,
  ScrollView,
  TextField, Toggle, Button, Text, useState, Spacer, HStack, useEffect,
  Script
} from "scripting"
import { extractPickupFromText, type PickupInfo } from "./pickup_parser"

// =====================================
// 全局声明 
// =====================================
declare const Storage: {
  get(key: string): any
  set(key: string, value: any): boolean
  remove(key: string): void
}
declare const Intent: {
  textsParameter?: string[];
  shortcutParameter?: { type: string, value: any };
  text(value: string): any;
}
declare const Safari: {
  openURL(url: string): void
}
declare const Widget: {
    refresh(): void 
    present(element: any): void
    family: "systemSmall" | "systemMedium" | "systemLarge"
}

// 临时键，用于快捷指令回调
const INTENT_DATA_KEY = "smsPickup_intent_data_temp";

// =====================================
// 配置与工具
// =====================================
const CONFIG_KEY = "smsPickup_widget_config_v1"

const DEFAULT_CONFIG = {
  configVersion: 2,
  autoDetectSMS: true,
  keywords: ["菜鸟", "蜂巢", "丰巢", "取件", "取货"],
  widgetShowCount: 5,
  showDate: true,
  importedMessages: [] as string[],
  pickedItems: [] as { code: string, timestamp: number }[]
}

export function loadConfig() {
  try {
    const data = Storage.get(CONFIG_KEY) || {}
    const merged = { ...DEFAULT_CONFIG, ...data }

    if (!data.configVersion || data.configVersion < 2) {
      const diagnosticMessage = "【菜鸟驿站】您的包裹已到，取件码 12-3-4567，请及时领取"
      merged.importedMessages = Array.isArray(merged.importedMessages)
        ? merged.importedMessages.filter((message: string) => message !== diagnosticMessage)
        : []
      merged.pickedItems = Array.isArray(merged.pickedItems)
        ? merged.pickedItems.filter((item: { code: string }) => item.code !== "12-3-4567")
        : []
      merged.configVersion = 2
      Storage.set(CONFIG_KEY, merged)
    }

    if (!Array.isArray(merged.keywords)) {
      merged.keywords = String(merged.keywords).split(",").map((s: string) => s.trim())
    }

    if (!Array.isArray(merged.pickedItems)) {
      if (Array.isArray((data as any).pickedCodes)) {
        merged.pickedItems = (data as any).pickedCodes.map((code: string) => ({
          code,
          timestamp: Date.now()
        }))
        delete (merged as any).pickedCodes
      } else {
        merged.pickedItems = []
      }
    }

    return merged
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(cfg: Partial<typeof DEFAULT_CONFIG>) {
  try {
    const merged = { ...loadConfig(), ...cfg }
    return Storage.set(CONFIG_KEY, merged)
  } catch { return false }
}

function resetConfig() {
  try { 
    Storage.remove(CONFIG_KEY);
    Storage.remove(INTENT_DATA_KEY);
  } catch { }
}

export function markPicked(code: string) {
  const cfg = loadConfig()
  const list = cfg.pickedItems || []

  if (!list.some((item: { code: string }) => item.code === code)) {
    list.push({ code, timestamp: Date.now() })
    cfg.pickedItems = list
    Storage.set(CONFIG_KEY, cfg)
  }
}

export function getAllPickupInfo(config: typeof DEFAULT_CONFIG): PickupInfo[] {
  const pickedSet = new Set(config.pickedItems.map((item: { code: string }) => item.code))
  const seenCodes = new Set<string>()
  const list: PickupInfo[] = []

  for (const msg of config.importedMessages as string[]) {
    const arr = extractPickupFromText(msg)
    for (const it of arr) {
      if (!pickedSet.has(it.code) && !seenCodes.has(it.code)) {
        seenCodes.add(it.code)
        list.push(it)
      }
    }
  }
  return list
}

export function handleAnyData(data: string) {
  if (!data.trim()) return 0

  let parts: string[] = []
  
  if (data.includes("---SMS-DIVIDER---")) {
    parts = data.split(/---SMS-DIVIDER---/g).map((s: string) => s.trim()).filter(Boolean)
  } 
  
  if (parts.length < 2) {
      const normalizedData = data.replace(/(\r\n|\n|\r)/g, '\n').trim();
      
      const splitByBracket = normalizedData.split(/(?=\n?【[^】]{2,10}】)/g);
      parts = splitByBracket
                .map(s => s.trim())
                .filter(Boolean);

      if (parts.length < 2 && normalizedData.includes('\n\n')) {
          parts = normalizedData.split(/\n{2,}|\r{2,}|\r\n{2,}/g).map((s: string) => s.trim()).filter(Boolean);
      } else if (parts.length === 0) {
          parts = [data.trim()];
      }
  }

  const cfg = loadConfig()
  const pickedSet = new Set(cfg.pickedItems.map((item: { code: string }) => item.code))
  const existingMessages = Array.isArray(cfg.importedMessages) ? cfg.importedMessages : []
  const existingMessagesSet = new Set(existingMessages)
  const latestMessages: string[] = []
  let newCount = 0

  for (const part of parts) {
    const extracted = extractPickupFromText(part)
    const hasUnpickedCode = extracted.some((item: PickupInfo) => !pickedSet.has(item.code))
    if (extracted.length === 0 || !hasUnpickedCode || latestMessages.includes(part)) continue

    latestMessages.push(part)
    if (!existingMessagesSet.has(part)) newCount++
  }

  if (latestMessages.length > 0) {
    const latestSet = new Set(latestMessages)
    cfg.importedMessages = [
      ...latestMessages,
      ...existingMessages.filter((message: string) => !latestSet.has(message)),
    ].slice(0, 50)
    Storage.set(CONFIG_KEY, cfg)
  }

  return newCount
}

// =====================================
// 页面 UI 
// =====================================

let globalSetRefreshKey: ((key: number) => void) | null = null; 

function reloadMain() {
    if (globalSetRefreshKey) {
        globalSetRefreshKey(Date.now());
    } else {
        Navigation.present({
            element: <MainView initialInfo={null} initialRefreshKey={Date.now()} />
        });
    }
}

function MessagePreview({ items, config }: { items: PickupInfo[], config: typeof DEFAULT_CONFIG }) {
  const show = items.slice(0, config.widgetShowCount)

  return (
    <VStack alignment="leading" spacing={16}>
      {show.length === 0 ? (
        <Text font="body" foregroundStyle="#888">未检测到取件信息。</Text>
      ) : show.map((it: PickupInfo, i: number) => (
        <VStack key={i} alignment="leading" spacing={8}>
          <Text font="headline">{it.courier ?? "快递"}</Text>
          <Text font="title" fontWeight="bold">取件码：{it.code}</Text>

          <HStack spacing={12}>
            <Button
              title="已取件"
              buttonStyle="bordered"
              action={() => {
                markPicked(it.code)
                try {
                    Widget.refresh();
                } catch (e) {
                    console.error("Widget refresh failed:", e)
                }
                // 🚀 修复点：延迟 100ms 重新加载 UI，确保数据写入完成
                setTimeout(() => {
                    reloadMain()
                }, 100) 
              }}
            />
          </HStack>

          {config.showDate && it.date && it.date.trim() ? (
            <Text font="footnote">{new Date(it.date).toLocaleString()}</Text>
          ) : null}
          <Text font="footnote" opacity={0.6} lineLimit={3}>{it.snippet}</Text>
        </VStack>
      ))}
    </VStack>
  )
}

function SettingsPage() {
  const cfg = loadConfig()
  const [autoDetect, setAutoDetect] = useState(cfg.autoDetectSMS)
  const [keywords, setKeywords] = useState(cfg.keywords.join(","))
  const [showCount, setShowCount] = useState(String(cfg.widgetShowCount))
  const [showDate, setShowDate] = useState(cfg.showDate)
  const [importText, setImportText] = useState("")
  const [info, setInfo] = useState("")

  const preview = importText.trim()
    ? extractPickupFromText(importText)
    : getAllPickupInfo(cfg)

  return (
    <NavigationStack>
      <VStack navigationTitle="取件码设置" safeAreaPadding>
        {!!info && info.trim() ? <Text font="headline" foregroundStyle="#007AFF">{info}</Text> : null}

        <Form formStyle="grouped">
          <Section header={<Text>识别配置</Text>}>
            <Toggle title="启用自动短信识别" value={autoDetect} onChanged={setAutoDetect} />
            <TextField title="关键字" value={keywords} onChanged={setKeywords} />
            <TextField title="显示条数" value={showCount} onChanged={setShowCount} />
            <Toggle title="显示短信时间" value={showDate} onChanged={setShowDate} />
            <Button title="保存设置" buttonStyle="borderedProminent" action={() => {
              saveConfig({
                autoDetectSMS: autoDetect,
                keywords: keywords.split(",").map((s: string) => s.trim()),
                widgetShowCount: parseInt(showCount) || 5,
                showDate
              })
              setInfo("已保存")
              setTimeout(() => setInfo(""), 1500)
            }} />
          </Section>

          <Section header={<Text>数据管理</Text>}>
            <Button title="清除已取记录 (恢复显示所有)" role="destructive" action={() => {
              const c = loadConfig(); c.pickedItems = []; saveConfig(c);
              try {
                  Widget.refresh();
              } catch (e) {
                  console.error("Widget refresh failed:", e)
              }
              setInfo("已清除，所有码将重新显示")
              setTimeout(() => setInfo(""), 1500)
            }} />
          </Section>

          <Section header={<Text>手动导入短信</Text>}>
            <TextField title="粘贴短信内容" value={importText} onChanged={setImportText} />
            <Button title="导入" action={() => {
              if (importText.trim()) {
                const added = handleAnyData(importText.trim())
                setImportText("")
                setInfo(added > 0 ? "短信已导入" : "无新的取件码（可能已取件）")
                setTimeout(() => {
                    if (added > 0) {
                        try {
                            Widget.refresh();
                        } catch (e) {
                            console.error("Widget refresh failed:", e)
                        }
                    }
                    setInfo("");
                }, 1500)
              }
            }} />
          </Section>

          <Section header={<Text>解析预览</Text>}>
            <MessagePreview items={preview} config={cfg} />
          </Section>

          <Section>
            <Button title="退出" role="cancel" action={() => Script.exit()} />
          </Section>
        </Form>
      </VStack>
    </NavigationStack>
  )
}

function getConfigSnapshot(): string {
  const cfg = loadConfig()
  return JSON.stringify({
    importedMessages: cfg.importedMessages,
    pickedItems: cfg.pickedItems,
  })
}

function MainView({ initialInfo, initialRefreshKey }: { initialInfo?: string | null, initialRefreshKey: number }) {
  const [refreshKey, setRefreshKey] = useState(initialRefreshKey);
  
  useEffect(() => {
    globalSetRefreshKey = setRefreshKey;
    let isActive = true
    let lastSnapshot = getConfigSnapshot()

    const pollForChanges = () => {
      setTimeout(() => {
        if (!isActive) return

        const nextSnapshot = getConfigSnapshot()
        if (nextSnapshot !== lastSnapshot) {
          lastSnapshot = nextSnapshot
          setRefreshKey(Date.now())
        }
        pollForChanges()
      }, 1000)
    }
    pollForChanges()

    return () => {
      isActive = false
      globalSetRefreshKey = null;
    };
  }, []);

  const cfg = loadConfig()
  const [info, setInfo] = useState(initialInfo || "")
  
  const preview = getAllPickupInfo(cfg)

  return (
    <NavigationStack key={refreshKey}>
      <VStack safeAreaPadding spacing={18}>
        <Text font="title" fontWeight="bold">📦 取件码小组件</Text>

        {info ? <Text font="headline" foregroundStyle="#007AFF">{info}</Text> : null}

        <ScrollView>
          <VStack alignment="leading" spacing={8} padding={{ top: 20, horizontal: 20 }}>
            <Text font="headline" fontWeight="bold">最新取件码：</Text>
            <MessagePreview items={preview} config={cfg} />
          </VStack>
        </ScrollView>

        <HStack spacing={12}>
          <Button title="⚙️ 设置" action={() => Navigation.present({ element: <SettingsPage /> })} />
          <Button title="🧹 清空" role="destructive" action={() => {
            resetConfig()
            
            setInfo("已清空")
            
            try {
                Widget.refresh();
            } catch (e) {
                console.error("Widget refresh failed:", e)
            }
            
            setTimeout(() => {
                Script.exit(); 
            }, 1500) 
          }} />
        </HStack>

        <Spacer />
        <Button title="退出" role="cancel" action={() => Script.exit()} />
      </VStack>
    </NavigationStack>
  )
}

// 运行入口
function run() {
  let rawDataList: string[] = []
  let launchType: 'NORMAL' | 'STORAGE_IMPORT' | 'INTENT_MULTI' = 'NORMAL'
  let initialInfo: string | null = null
  let refreshKey = 0
  let total = 0 
  
  let isIntentLaunch = false;

  try {
    if (Array.isArray(Intent.textsParameter) && Intent.textsParameter.length > 0) {
      rawDataList = Intent.textsParameter.filter((s: string) => !!s.trim())
      if (rawDataList.length > 0) {
          launchType = "INTENT_MULTI"
          isIntentLaunch = true; // 🚀 标记为 Intent 启动
      }
    }
  } catch { }

  // 检查是否有临时存储的残余数据
  const stored = Storage.get(INTENT_DATA_KEY)
  if (typeof stored === 'string' && stored.length > 0) {
    // 如果是 Intent 启动，这些残余数据也会被处理
    if (!isIntentLaunch) {
        rawDataList = [stored]
        launchType = "STORAGE_IMPORT"
    } else {
        // 如果是 Intent 启动，我们只依赖 Intent.textsParameter，忽略这里的残余数据以简化逻辑
    }
  }


  // 🚀 核心逻辑修正：静默模式只在明确的 Intent 启动下触发
  if (launchType === 'INTENT_MULTI' && rawDataList.length > 0) {
    for (const raw of rawDataList) {
      total += handleAnyData(raw)
    }
    
    // 清理临时存储 (防止下次 NORMAL 启动被误判)
    Storage.remove(INTENT_DATA_KEY) 
    
    if (total > 0) {
        try {
            Widget.refresh()
        } catch (e) {
            console.error("Widget refresh after import failed:", e)
        }
    }
    
    // 立即退出脚本，不显示 UI
    Script.exit(); 
    return;
  }

  // NORMAL/STORAGE_IMPORT 模式（需要显示 UI）
  if (rawDataList.length > 0) {
    for (const raw of rawDataList) {
      total += handleAnyData(raw)
    }
    
    // 清理临时存储
    Storage.remove(INTENT_DATA_KEY) 

    refreshKey = 1
    initialInfo = total > 0
      ? `成功导入 ${total} 条取件码！`
      : `无新的取件码（可能已取件）`
  }


  // 显示 UI
  Navigation.present({
    element: <MainView initialInfo={initialInfo} initialRefreshKey={refreshKey} />
  })
}

// 导出 main 给 intent 使用
export function main() {
  run()
}

// 仅普通脚本入口自动展示 UI；intent.tsx 会直接调用导出的导入函数。
if (Script.env === "index") {
  run()
}
