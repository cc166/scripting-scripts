import {
  List, Section, Text, HStack, VStack, Image, Spacer, NavigationLink,
  Button, Widget, useState, ZStack, Circle, Toggle,
} from "scripting"
import { Shortcut } from "../util/const"
import {
  loadShortcuts, removeShortcut, moveShortcut, resetShortcuts,
  toggleShortcutEnabled,
} from "../util/store"
import ShortcutEdit from "./ShortcutEdit"

export default function ShortcutList() {
  const [items, setItems] = useState<Shortcut[]>(() => loadShortcuts())

  const refresh = () => {
    setItems(loadShortcuts())
    Widget.reloadAll()
  }

  const onDelete = async (s: Shortcut) => {
    const ok = await Dialog.confirm({ title: "删除", message: `删除「${s.name}」？` })
    if (!ok) return
    removeShortcut(s.id)
    refresh()
  }

  const onMove = (s: Shortcut, dir: -1 | 1) => {
    moveShortcut(s.id, dir)
    refresh()
  }

  const onToggle = (s: Shortcut) => {
    toggleShortcutEnabled(s.id)
    refresh()
  }

  const onReset = async () => {
    const ok = await Dialog.confirm({ title: "恢复预设", message: "覆盖现有快捷入口？" })
    if (!ok) return
    resetShortcuts()
    refresh()
  }

  const visibleCount = items.filter(x => x.enabled !== false).length

  return (
    <List
      navigationTitle="快捷入口"
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: (
          <NavigationLink destination={<ShortcutEdit onSaved={refresh} />}>
            <Image systemName="plus" />
          </NavigationLink>
        ),
      }}
    >
      <Section
        header={<Text>共 {items.length} 项 · 已显示 {visibleCount} 个 · 大组件最多 15 个（5×3）</Text>}
        footer={<Text font={12} foregroundStyle="secondaryLabel">
          关闭右侧开关可隐藏该入口（不删除，可随时恢复）；编辑时可一键从 App Store 抓取真实图标。
        </Text>}
      >
        {items.map((s: Shortcut, idx: number) => {
          const enabled = s.enabled !== false
          return (
            <HStack key={s.id} spacing={10} opacity={enabled ? 1 : 0.45}>
              <ZStack frame={{ width: 36, height: 36 }}>
                {s.iconUrl ? (
                  <Image
                    imageUrl={s.iconUrl}
                    resizable scaleToFill
                    frame={{ width: 36, height: 36 }}
                    clipShape="circle"
                  />
                ) : (
                  <>
                    <Circle fill={s.color} frame={{ width: 36, height: 36 }} />
                    <Image systemName={s.icon} font={16} foregroundStyle="white" />
                  </>
                )}
              </ZStack>
              <NavigationLink destination={<ShortcutEdit shortcutId={s.id} onSaved={refresh} />}>
                <VStack alignment="leading" spacing={2}>
                  <Text fontWeight="semibold">{s.name}</Text>
                  <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{s.url}</Text>
                </VStack>
              </NavigationLink>
              <Spacer />
              <Toggle
                title=""
                value={enabled}
                onChanged={() => onToggle(s)}
                labelsHidden
              />
              <Button title="" systemImage="arrow.up"   action={() => onMove(s, -1)} disabled={idx === 0} buttonStyle="borderless" controlSize="small" />
              <Button title="" systemImage="arrow.down" action={() => onMove(s,  1)} disabled={idx === items.length - 1} buttonStyle="borderless" controlSize="small" />
              <Button title="" systemImage="trash" action={() => onDelete(s)} buttonStyle="borderless" controlSize="small" foregroundStyle="#fe4f67" />
            </HStack>
          )
        })}
      </Section>

      <Section>
        <Button title="恢复预设" systemImage="arrow.counterclockwise" action={onReset} />
      </Section>
    </List>
  )
}
