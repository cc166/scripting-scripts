import {
  List, Section, Text, HStack, VStack, Spacer, Image, Toggle, Picker,
  ZStack, RoundedRectangle, Color, Widget, useState,
} from "scripting"
import { COLOR_PRESETS, GRADIENT_PRESETS, PanelTheme } from "../util/const"
import { loadSettings, saveSettings } from "../util/store"

export default function Appearance() {
  const init = loadSettings()
  const [theme, setTheme] = useState<PanelTheme>(init.theme)
  const [accent, setAccent] = useState<Color>(init.accent)
  const [showAnniv, setShowAnniv] = useState(init.showAnniversary)
  const [showShortcuts, setShowShortcuts] = useState(init.showShortcuts)
  const [showWeather, setShowWeather] = useState(init.showWeather)
  const [bg, setBg] = useState<[Color, Color]>(init.bgGradient)
  const [transparent, setTransparent] = useState(!!init.transparentBackground)

  const persist = (patch: Partial<typeof init>) => {
    const s = { ...loadSettings(), ...patch }
    saveSettings(s)
    Widget.reloadAll()
  }

  return (
    <List
      navigationTitle="外观"
      navigationBarTitleDisplayMode="inline"
    >
      <Section header={<Text>显示</Text>}>
        <Toggle title="纪念日卡片" value={showAnniv}
          onChanged={(v: boolean) => { setShowAnniv(v); persist({ showAnniversary: v }) }} />
        <Toggle title="天气卡片" value={showWeather}
          onChanged={(v: boolean) => { setShowWeather(v); persist({ showWeather: v }) }} />
        <Toggle title="快捷入口" value={showShortcuts}
          onChanged={(v: boolean) => { setShowShortcuts(v); persist({ showShortcuts: v }) }} />
      </Section>

      <Section header={<Text>主题</Text>}>
        <Picker title="模式" value={theme} onChanged={(v: any) => { setTheme(v); persist({ theme: v }) }}>
          <Text tag="auto">跟随系统</Text>
          <Text tag="light">浅色</Text>
          <Text tag="dark">深色</Text>
        </Picker>
      </Section>

      <Section header={<Text>强调色</Text>}>
        <ColorPalette value={accent} onChange={(c) => { setAccent(c); persist({ accent: c }) }} />
      </Section>

      <Section
        header={<Text>背景</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            开启「透明背景」后，widget 会直接透出主屏壁纸，渐变设置将被忽略。
          </Text>
        }
      >
        <Toggle title="透明背景" value={transparent}
          onChanged={(v: boolean) => { setTransparent(v); persist({ transparentBackground: v }) }} />

        {!transparent && (
          <VStack alignment="leading" spacing={10} padding={{ top: 4, bottom: 4 }}>
            {GRADIENT_PRESETS.map(p => {
              const sel = p.value[0] === bg[0] && p.value[1] === bg[1]
              return (
                <HStack key={p.name} spacing={12}
                  contentShape="rect"
                  onTapGesture={() => { setBg(p.value); persist({ bgGradient: p.value }) }}
                >
                  <ZStack frame={{ width: 64, height: 32 }}>
                    <RoundedRectangle
                      cornerRadius={8}
                      fill={{
                        colors: p.value,
                        startPoint: { x: 0, y: 0 },
                        endPoint: { x: 1, y: 1 },
                      }}
                      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
                    />
                  </ZStack>
                  <Text fontWeight={sel ? "semibold" : "regular"}>{p.name}</Text>
                  <Spacer />
                  {sel && (
                    <Image systemName="checkmark.circle.fill"
                      foregroundStyle="systemBlue" font={18} />
                  )}
                </HStack>
              )
            })}
          </VStack>
        )}
      </Section>
    </List>
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
