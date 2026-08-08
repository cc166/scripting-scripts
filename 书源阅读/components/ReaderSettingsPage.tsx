import { Button, ColorPicker, HStack, List, Navigation, NavigationLink, NavigationStack, Picker, Script, Section, Slider, Spacer, Text, VStack, useColorScheme, useState } from "scripting"
import { getReaderPreferences, saveReaderPreferences } from "../storage"
import { ReaderPreferences, ReaderThemePreset, ReaderTtsPreferences } from "../types"
import { BUILTIN_THEME_PRESETS, resolveThemeColors } from "../utils/theme"
import { TtsVoicePickerPage } from "./TtsVoicePickerPage"

const THEME_OPTIONS: { value: ReaderThemePreset; label: string }[] = [
  { value: "paper", label: BUILTIN_THEME_PRESETS.paper.label },
  { value: "sepia", label: BUILTIN_THEME_PRESETS.sepia.label },
  { value: "night", label: BUILTIN_THEME_PRESETS.night.label },
  { value: "grass", label: BUILTIN_THEME_PRESETS.grass.label },
  { value: "ocean", label: BUILTIN_THEME_PRESETS.ocean.label },
  { value: "custom", label: "自定义" },
]

export function ReaderSettingsPage({
  onSaved,
  previewText = "",
}: {
  /** 偏好变更时回调（即时生效）。 */
  onSaved: (preferences: ReaderPreferences) => void
  previewText?: string
}) {
  const dismiss = Navigation.useDismiss()
  const scheme = useColorScheme()
  const [preferences, setPreferences] = useState<ReaderPreferences>(() => getReaderPreferences())
  const [fontMessage, setFontMessage] = useState(
    Script.hasFullAccess()
      ? "支持系统 FontPicker 选字体。"
      : "选择系统字体需要开启 Scripting PRO（完整访问权限）。",
  )

  // 当前生效的配色：preset 命中内置时按 scheme 解析，否则用保存的自定义色
  const effective = resolveThemeColors(preferences.themePreset, scheme) ?? {
    textColor: preferences.textColor,
    backgroundColor: preferences.backgroundColor,
  }

  function applyChange(next: ReaderPreferences) {
    setPreferences(next)
    saveReaderPreferences(next)
    onSaved(next)
  }

  function update<K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) {
    applyChange({
      ...preferences,
      [key]: value,
    })
  }

  function updateTts(next: ReaderTtsPreferences) {
    applyChange({
      ...preferences,
      tts: next,
    })
  }

  function voiceSummary(): string {
    if (!preferences.tts.voiceIdentifier) return "系统默认"
    return preferences.tts.voiceIdentifier.split(".").slice(-1)[0] || "已指定"
  }

  function applyTheme(value: ReaderThemePreset) {
    if (value === "custom") {
      // 手动切到自定义：当前生效色作为初始值
      applyChange({
        ...preferences,
        themePreset: "custom",
        textColor: effective.textColor,
        backgroundColor: effective.backgroundColor,
      })
      return
    }
    const palette = resolveThemeColors(value, scheme)
    if (!palette) return
    applyChange({
      ...preferences,
      themePreset: value,
      textColor: palette.textColor,
      backgroundColor: palette.backgroundColor,
    })
  }

  /**
   * 在 ColorPicker 中手动改色：切到 custom 并保存具体颜色值。
   */
  function handleManualColor(key: "textColor" | "backgroundColor", value: string) {
    applyChange({
      ...preferences,
      themePreset: "custom",
      [key]: value,
      // 对于非正在改的那一色，也以当前生效色定住下来（避免存存者旧 preset 色）
      ...(key === "textColor"
        ? { backgroundColor: preferences.themePreset === "custom" ? preferences.backgroundColor : effective.backgroundColor }
        : { textColor: preferences.themePreset === "custom" ? preferences.textColor : effective.textColor }),
    })
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="阅读设置"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />,
        }}
      >
        <Section
          header={<Text>主题</Text>}
          footer={<Text>内置主题会自动跟随系统深浅色切换。手动调色后将切为“自定义”。</Text>}
        >
          <Picker title="默认主题" value={preferences.themePreset} onChanged={(value: string) => applyTheme(value as ReaderThemePreset)}>
            {THEME_OPTIONS.map((option) => (
              <Text key={option.value} tag={option.value}>{option.label}</Text>
            ))}
          </Picker>
          <ColorPicker
            title="文字颜色"
            value={effective.textColor as any}
            onChanged={(value) => handleManualColor("textColor", value as string)}
          />
          <ColorPicker
            title="背景颜色"
            value={effective.backgroundColor as any}
            onChanged={(value) => handleManualColor("backgroundColor", value as string)}
          />
        </Section>

        <Section header={<Text>字体</Text>} footer={<Text>{fontMessage}</Text>}>
          <Picker title="字体风格" value={preferences.fontDesign} onChanged={(value: string) => update("fontDesign", value as ReaderPreferences["fontDesign"])}>
            <Text tag="serif">衬线</Text>
            <Text tag="default">默认</Text>
            <Text tag="rounded">圆角</Text>
            <Text tag="monospaced">等宽</Text>
          </Picker>
          <Button
            title={preferences.customFontName ? `系统字体：${preferences.customFontName}` : "选择系统字体"}
            action={async () => {
              if (!Script.hasFullAccess()) {
                setFontMessage("当前未开启 Scripting PRO（完整访问权限），暂时不能调用 FontPicker。")
                return
              }
              const picked = await FontPicker.pickFont()
              if (picked) {
                update("customFontName", picked)
                setFontMessage(`已选择系统字体：${picked}`)
              }
            }}
          />
          {preferences.customFontName ? (
            <Button
              title="恢复默认字体"
              action={() => {
                update("customFontName", "")
                setFontMessage("已恢复默认字体。")
              }}
            />
          ) : undefined}
        </Section>

        <Section header={<Text>排版</Text>}>
          <VStack spacing={10}>
            <Text>字号：{Math.round(preferences.fontSize)}</Text>
            <Slider
              value={preferences.fontSize}
              onChanged={(value) => update("fontSize", value)}
              min={14}
              max={30}
              step={1}
              label={<Text>字号</Text>}
            />
            <Text>行距：{Math.round(preferences.lineSpacing)}</Text>
            <Slider
              value={preferences.lineSpacing}
              onChanged={(value) => update("lineSpacing", value)}
              min={2}
              max={20}
              step={1}
              label={<Text>行距</Text>}
            />
            <Text>段间距：{Math.round(preferences.paragraphSpacing)}</Text>
            <Slider
              value={preferences.paragraphSpacing}
              onChanged={(value) => update("paragraphSpacing", value)}
              min={0}
              max={24}
              step={1}
              label={<Text>段间距</Text>}
            />
            <Text>页边距：{Math.round(preferences.horizontalPadding)}</Text>
            <Slider
              value={preferences.horizontalPadding}
              onChanged={(value) => update("horizontalPadding", value)}
              min={12}
              max={40}
              step={1}
              label={<Text>页边距</Text>}
            />
            <Text>首行缩进：{Math.round(preferences.firstLineHeadIndent)}</Text>
            <Slider
              value={preferences.firstLineHeadIndent}
              onChanged={(value) => update("firstLineHeadIndent", value)}
              min={0}
              max={32}
              step={2}
              label={<Text>首行缩进</Text>}
            />
          </VStack>
        </Section>

        <Section header={<Text>对齐</Text>}>
          <Picker title="正文对齐" value={preferences.textAlignment} onChanged={(value: string) => update("textAlignment", value as ReaderPreferences["textAlignment"])}>
            <Text tag="natural">系统默认</Text>
            <Text tag="left">左对齐</Text>
            <Text tag="justified">两端对齐</Text>
          </Picker>
        </Section>

        <Section header={<Text>朗读</Text>} footer={<Text>语速、音调、音量会同时作用于朗读与试听。</Text>}>
          <NavigationLink
            destination={
              <TtsVoicePickerPage
                tts={preferences.tts}
                previewText={previewText}
                onChanged={updateTts}
              />
            }
          >
            <HStack>
              <Text>朗读语音</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">{voiceSummary()}</Text>
            </HStack>
          </NavigationLink>
        </Section>
      </List>
    </NavigationStack>
  )
}
