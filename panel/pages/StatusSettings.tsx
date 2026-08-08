import {
  List, Section, Text, TextField, HStack, VStack, Image, Spacer, Button, Toggle,
  NavigationLink, Navigation, Widget, useState, ZStack,
} from "scripting"
import { STATUS_META, StatusItem, StatusKey } from "../util/const"
import {
  loadSettings, saveSettings, moveStatusItem, toggleStatusItemEnabled,
  setStatusItemUrl,
} from "../util/store"

export default function StatusSettings() {
  const [items, setItems] = useState<StatusItem[]>(() => loadSettings().statusItems)
  const [showStatus, setShowStatus] = useState(loadSettings().showStatus)

  const refresh = () => {
    setItems(loadSettings().statusItems)
    Widget.reloadAll()
  }

  const onMove = (key: StatusKey, dir: -1 | 1) => {
    moveStatusItem(key, dir)
    refresh()
  }

  const onToggle = (key: StatusKey) => {
    toggleStatusItemEnabled(key)
    refresh()
  }

  const onShowStatusChange = (v: boolean) => {
    setShowStatus(v)
    const s = loadSettings()
    s.showStatus = v
    saveSettings(s)
    Widget.reloadAll()
  }

  return (
    <List
      navigationTitle="状态项"
      navigationBarTitleDisplayMode="inline"
    >
      <Section
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            状态行用于显示 Wi-Fi / 蜂窝 的连接状态。电量已由系统右上角原生显示，面板不再重复展示。
            {"\n"}受 iOS 限制：第三方小组件无法读取或切换蓝牙、隔空投送、专注，也无法获取 Wi-Fi 名称（SSID）。
            {"\n\n"}⚠️ 关于点击跳转：iOS 16 起 `prefs:root=…` 系列 URL 多数被系统拒绝，
            被拒后系统会回落到宿主 App，因此你可能看到点击后打开了 Scripting。
            进入下方任一项可改为「运行快捷指令」（自建一个同名快捷指令即 100% 稳定打开设置子页）。
          </Text>
        }
      >
        <Toggle title="在小组件中显示状态行" value={showStatus} onChanged={onShowStatusChange} />
      </Section>

      <Section header={<Text>排序与显示</Text>}>
        {items.map((it: StatusItem, idx: number) => {
          const meta = STATUS_META[it.key]
          const isCustom = !!(it.customUrl && it.customUrl.trim())
          const showUrl = isCustom ? it.customUrl! : meta.url
          return (
            <NavigationLink key={it.key}
              destination={
                <StatusItemEdit
                  itemKey={it.key}
                  initialUrl={it.customUrl ?? ""}
                  onSaved={refresh}
                />
              }
            >
              <HStack spacing={10}>
                <ZStack
                  frame={{ width: 32, height: 32 }}
                  background={meta.color}
                  clipShape={{ type: "rect", cornerRadius: 8 }}
                >
                  <Image
                    systemName={meta.iconOn}
                    font={18}
                    foregroundStyle="white"
                  />
                </ZStack>
                <VStack alignment="leading" spacing={2}>
                  <HStack spacing={6}>
                    <Text fontWeight="semibold">{meta.label}</Text>
                    {isCustom && (
                      <Text font={10} fontWeight="medium"
                        foregroundStyle="white"
                        padding={{ leading: 6, trailing: 6, top: 1, bottom: 1 }}
                        background="systemBlue"
                        clipShape={{ type: "rect", cornerRadius: 4 }}>
                        已自定义
                      </Text>
                    )}
                  </HStack>
                  <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{showUrl}</Text>
                </VStack>
                <Spacer />
                <Toggle title="" value={it.enabled} onChanged={() => onToggle(it.key)} />
                <Button title="" systemImage="arrow.up"
                  action={() => onMove(it.key, -1)}
                  disabled={idx === 0}
                  buttonStyle="borderless" controlSize="small" />
                <Button title="" systemImage="arrow.down"
                  action={() => onMove(it.key, 1)}
                  disabled={idx === items.length - 1}
                  buttonStyle="borderless" controlSize="small" />
              </HStack>
            </NavigationLink>
          )
        })}
      </Section>
    </List>
  )
}

/* ------------- 子页：编辑单个状态项 URL ------------- */

function StatusItemEdit({
  itemKey, initialUrl, onSaved,
}: {
  itemKey: StatusKey
  initialUrl: string
  onSaved: () => void
}) {
  const dismiss = Navigation.useDismiss()
  const meta = STATUS_META[itemKey]
  const [url, setUrl] = useState(initialUrl)

  const presets: Array<{ label: string; value: string; hint?: string }> = [
    {
      label: `App-Prefs:root → 设置 → ${meta.label}（推荐先试）`,
      value: meta.url,
      hint: "iOS 16/17/18 上对第三方相对友好的形式",
    },
    {
      label: `prefs:root → 设置 → ${meta.label}（旧形式）`,
      value: `prefs:root=${meta.url.split("=")[1] ?? ""}`,
      hint: "新系统多数已被拦截，会打开宿主 App",
    },
    {
      label: "App-prefs: → 设置首页（兜底）",
      value: "App-Prefs:",
      hint: "进不到子页时的最低保证",
    },
    {
      label: `运行快捷指令「${meta.label}」（最稳）`,
      value: `shortcuts://run-shortcut?name=${encodeURIComponent(meta.label)}`,
      hint: "需在「快捷指令」App 内自建一个同名指令，例如「打开 Wi-Fi 设置」",
    },
  ]
  if (meta.altUrl && !presets.some(p => p.value === meta.altUrl)) {
    presets.push({ label: meta.altLabel ?? "推荐方案", value: meta.altUrl })
  }

  const save = () => {
    setStatusItemUrl(itemKey, url)
    onSaved()
    dismiss()
  }

  const reset = () => {
    setUrl("")
  }

  return (
    <List
      navigationTitle={meta.label}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: <Button title="保存" action={save} />,
      }}
    >
      <Section
        header={<Text>跳转 URL</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            留空则使用默认值：{meta.url}
            {"\n"}如系统拦截 prefs:root=…，可改为 shortcuts:// 自建快捷指令。
          </Text>
        }
      >
        <HStack>
          <TextField title="" value={url} onChanged={setUrl}
            prompt={meta.url}
            axis="vertical"
            lineLimit={{ min: 1, max: 3 }}
          />
        </HStack>
        {url.trim().length > 0 && (
          <Button title="清除（恢复默认）" systemImage="arrow.counterclockwise"
            action={reset} />
        )}
      </Section>

      <Section header={<Text>预设</Text>}>
        {presets.map((p, i) => {
          const sel = url.trim() === p.value
          return (
            <HStack key={`p-${i}`} spacing={10}
              contentShape="rect"
              onTapGesture={() => setUrl(p.value)}
            >
              <Image
                systemName={sel ? "checkmark.circle.fill" : "circle"}
                font={18}
                foregroundStyle={sel ? "systemBlue" : "tertiaryLabel"}
              />
              <VStack alignment="leading" spacing={2}>
                <Text fontWeight={sel ? "semibold" : "regular"}>{p.label}</Text>
                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{p.value}</Text>
                {p.hint && (
                  <Text font={11} foregroundStyle="tertiaryLabel" lineLimit={2}>{p.hint}</Text>
                )}
              </VStack>
              <Spacer />
            </HStack>
          )
        })}
      </Section>
    </List>
  )
}
