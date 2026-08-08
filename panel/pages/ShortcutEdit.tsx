import {
  List, Section, Text, TextField, Button, HStack, VStack, Image, Spacer,
  Navigation, Widget, useState, useMemo, ZStack, Circle, Color,
} from "scripting"
import { Shortcut, ICON_PRESETS, COLOR_PRESETS } from "../util/const"
import { loadShortcuts, upsertShortcut, newId } from "../util/store"
import { searchApp, AppIconResult } from "../util/appicon"
import { cacheIcon } from "../util/icon-cache"

interface Props {
  shortcutId?: string
  onSaved?: () => void
}

export default function ShortcutEdit({ shortcutId, onSaved }: Props) {
  const dismiss = Navigation.useDismiss()

  const original = useMemo<Shortcut | undefined>(() => {
    if (!shortcutId) return undefined
    return loadShortcuts().find(i => i.id === shortcutId)
  }, [shortcutId])
  const isCreate = !original

  const [name, setName] = useState(original?.name ?? "")
  const [url, setUrl] = useState(original?.url ?? "")
  const [icon, setIcon] = useState(original?.icon ?? ICON_PRESETS[0])
  const [iconUrl, setIconUrl] = useState(original?.iconUrl ?? "")
  const [color, setColor] = useState<Color>(original?.color ?? "systemBlue")

  /* 「运行快捷指令」助手：从已有 url 反解出指令名预填 */
  const [shortcutName, setShortcutName] = useState(() => extractShortcutName(original?.url ?? ""))

  const applyRunShortcut = () => {
    const n = shortcutName.trim()
    if (!n) {
      Dialog.alert({ message: "请先填写要运行的快捷指令名称" })
      return
    }
    setUrl(`shortcuts://run-shortcut?name=${encodeURIComponent(n)}`)
  }

  /* App Store 搜图 */
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<AppIconResult[]>([])

  const doSearch = async () => {
    const kw = name.trim()
    if (!kw) {
      Dialog.alert({ message: "请先填写名称作为搜索关键字" })
      return
    }
    setSearching(true)
    try {
      const r = await searchApp(kw)
      setResults(r)
      if (r.length === 0) Dialog.alert({ message: "未找到匹配的 App" })
    } catch (e: any) {
      Dialog.alert({ message: "搜索失败：" + (e?.message || e) })
    } finally {
      setSearching(false)
    }
  }

  const useResult = (r: AppIconResult) => {
    setIconUrl(r.iconUrl)
    cacheIcon(r.iconUrl)
    if (!url) setUrl(r.url)
    if (!name) setName(r.name)
  }

  const canSave = name.trim().length > 0 && url.trim().length > 0

  const save = async () => {
    if (!canSave) {
      Dialog.alert({ message: "请填写名称和链接" })
      return
    }
    const next: Shortcut = {
      id: original?.id ?? newId("sc"),
      name: name.trim(),
      url: url.trim(),
      icon,
      iconUrl: iconUrl || undefined,
      color,
    }
    upsertShortcut(next)
    Widget.reloadAll()
    onSaved?.()
    dismiss()
  }

  return (
    <List
      navigationTitle={isCreate ? "新增快捷入口" : "编辑快捷入口"}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: <Button title="保存" action={save} disabled={!canSave} />,
      }}
    >
      <Section header={<Text>基本</Text>}>
        <HStack>
          <Text>名称</Text>
          <TextField title="" value={name} onChanged={setName} prompt="如：微信" />
        </HStack>
        <HStack>
          <Text>链接</Text>
          <TextField
            title="" value={url} onChanged={setUrl}
            prompt="weixin:// / https:// / shortcuts://run-shortcut?name=..."
            axis="vertical"
            lineLimit={{ min: 1, max: 3 }}
          />
        </HStack>
      </Section>

      <Section
        header={<Text>运行快捷指令</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            填入「快捷指令」App 中已有的指令名，点「应用到链接」会自动生成
            shortcuts://run-shortcut?name=… 并填到上面的链接里。指令名支持中文。
          </Text>
        }
      >
        <HStack>
          <Text>指令名</Text>
          <TextField
            title="" value={shortcutName} onChanged={setShortcutName}
            prompt="如：早安播报"
          />
        </HStack>
        <Button
          title="应用到链接"
          systemImage="wand.and.stars"
          action={applyRunShortcut}
        />
      </Section>

      <Section
        header={<Text>App Store 图标</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            选择一个真实图标后，将自动作为圆形头像。可清除以使用 SF Symbol。
          </Text>
        }
      >
        <HStack>
          <Button title={searching ? "搜索中…" : "在 App Store 搜索"}
            systemImage="magnifyingglass"
            action={doSearch} disabled={searching}
          />
          {iconUrl ? (
            <>
              <Spacer />
              <Button title="清除" systemImage="xmark.circle" action={() => setIconUrl("")} />
            </>
          ) : null}
        </HStack>

        {results.length > 0 && (
          <VStack alignment="leading" spacing={8} padding={{ top: 4, bottom: 4 }}>
            {results.map(r => {
              const sel = iconUrl === r.iconUrl
              return (
                <HStack key={r.bundleId} spacing={10}
                  contentShape="rect"
                  onTapGesture={() => useResult(r)}
                >
                  <Image
                    imageUrl={r.iconUrl}
                    resizable scaleToFill
                    frame={{ width: 36, height: 36 }}
                    clipShape="circle"
                  />
                  <VStack alignment="leading" spacing={2}>
                    <Text fontWeight="semibold" lineLimit={1}>{r.name}</Text>
                    <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{r.bundleId}</Text>
                  </VStack>
                  <Spacer />
                  <Image systemName={sel ? "checkmark.circle.fill" : "circle"}
                    font={18}
                    foregroundStyle={sel ? "systemBlue" : "tertiaryLabel"} />
                </HStack>
              )
            })}
          </VStack>
        )}
      </Section>

      <Section header={<Text>SF Symbol（备用）</Text>}>
        <IconPalette value={icon} onChange={setIcon} color={color} />
      </Section>

      <Section header={<Text>颜色</Text>}>
        <ColorPalette value={color} onChange={setColor} />
      </Section>

      <Section header={<Text>预览</Text>}>
        <HStack spacing={12}>
          <ZStack frame={{ width: 48, height: 48 }}>
            {iconUrl ? (
              <Image imageUrl={iconUrl} resizable scaleToFill
                frame={{ width: 48, height: 48 }} clipShape="circle" />
            ) : (
              <>
                <Circle fill={color} frame={{ width: 48, height: 48 }} />
                <Image systemName={icon} font={22} foregroundStyle="white" />
              </>
            )}
          </ZStack>
          <VStack alignment="leading" spacing={2}>
            <Text fontWeight="semibold">{name || "未命名"}</Text>
            <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{url || "无链接"}</Text>
          </VStack>
          <Spacer />
        </HStack>
      </Section>
    </List>
  )
}

function IconPalette({
  value, onChange, color,
}: { value: string; onChange: (v: string) => void; color: Color }) {
  const cols = 5
  const rows: string[][] = []
  for (let i = 0; i < ICON_PRESETS.length; i += cols) {
    rows.push(ICON_PRESETS.slice(i, i + cols))
  }
  return (
    <VStack alignment="leading" spacing={10} padding={{ top: 4, bottom: 4 }}>
      {rows.map((row, ri) => (
        <HStack key={`r-${ri}`} spacing={10}>
          {row.map(name => {
            const sel = name === value
            return (
              <ZStack key={name}
                frame={{ width: 40, height: 40 }}
                background={sel ? "systemGray5" : "clear"}
                clipShape={{ type: "rect", cornerRadius: 8 }}
                contentShape="rect"
                onTapGesture={() => onChange(name)}
              >
                <Image
                  systemName={name}
                  font={22}
                  foregroundStyle={sel ? color : "secondaryLabel"}
                />
              </ZStack>
            )
          })}
          <Spacer />
        </HStack>
      ))}
    </VStack>
  )
}

function ColorPalette({
  value, onChange,
}: { value: Color; onChange: (v: Color) => void }) {
  const cols = 6
  const rows: Color[][] = []
  for (let i = 0; i < COLOR_PRESETS.length; i += cols) {
    rows.push(COLOR_PRESETS.slice(i, i + cols))
  }
  return (
    <VStack alignment="leading" spacing={10} padding={{ top: 4, bottom: 4 }}>
      {rows.map((row, ri) => (
        <HStack key={`cr-${ri}`} spacing={14}>
          {row.map(c => {
            const sel = c === value
            return (
              <Image key={c}
                systemName={sel ? "checkmark.circle.fill" : "circle.fill"}
                font={28}
                foregroundStyle={c}
                contentShape="rect"
                onTapGesture={() => onChange(c)}
              />
            )
          })}
          <Spacer />
        </HStack>
      ))}
    </VStack>
  )
}

/** 从 shortcuts://run-shortcut?name=XXX 中反解指令名；非该格式返回空串 */
function extractShortcutName(url: string): string {
  if (!url) return ""
  // 支持：shortcuts://run-shortcut?name=...   shortcuts://x-callback-url/run-shortcut?name=...
  const m = url.match(/shortcuts:\/\/(?:x-callback-url\/)?run-shortcut\?(.+)$/i)
  if (!m) return ""
  const qs = m[1]
  for (const pair of qs.split("&")) {
    const [k, v = ""] = pair.split("=")
    if (k === "name") {
      try { return decodeURIComponent(v.replace(/\+/g, " ")) } catch { return v }
    }
  }
  return ""
}
