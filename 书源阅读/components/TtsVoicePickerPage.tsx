import {
  Button,
  HStack,
  Image,
  List,
  ProgressView,
  Section,
  Slider,
  Spacer,
  Text,
  Toggle,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { listChineseVoices, ttsController } from "../services/tts_service"
import { ReaderTtsPreferences } from "../types"

const DEFAULT_PREVIEW_FALLBACK = "这是一段朗读试听，希望你喜欢这个声音。"

function languageDisplayName(lang: string): string {
  if (lang.startsWith("zh-CN")) return "普通话（zh-CN）"
  if (lang.startsWith("zh-TW")) return "台湾（zh-TW）"
  if (lang.startsWith("zh-HK")) return "粤语（zh-HK）"
  return lang
}

function qualityLabel(q: SpeechSynthesisVoice["quality"]): string {
  if (q === "premium") return "Premium"
  if (q === "enhanced") return "Enhanced"
  return ""
}

function groupVoices(voices: SpeechSynthesisVoice[]): Array<{ language: string; list: SpeechSynthesisVoice[] }> {
  const map = new Map<string, SpeechSynthesisVoice[]>()
  for (const v of voices) {
    // 归一化为主要前缀（zh-CN / zh-TW / zh-HK / 其他）
    const prefix = v.language.startsWith("zh-CN")
      ? "zh-CN"
      : v.language.startsWith("zh-TW")
        ? "zh-TW"
        : v.language.startsWith("zh-HK")
          ? "zh-HK"
          : v.language
    const bucket = map.get(prefix)
    if (bucket) {
      bucket.push(v)
    } else {
      map.set(prefix, [v])
    }
  }
  return Array.from(map.entries()).map(([language, list]) => ({ language, list }))
}

export function TtsVoicePickerPage({
  tts,
  previewText,
  onChanged,
}: {
  tts: ReaderTtsPreferences
  previewText: string
  onChanged: (next: ReaderTtsPreferences) => void
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listChineseVoices()
        if (!cancelled) {
          setVoices(list)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      // 离开页面时停止试听，避免残留播放
      ttsController.forceStop()
    }
  }, [])

  function update<K extends keyof ReaderTtsPreferences>(key: K, value: ReaderTtsPreferences[K]) {
    onChanged({ ...tts, [key]: value })
  }

  async function preview(voiceIdentifier: string) {
    const sample = (previewText || DEFAULT_PREVIEW_FALLBACK).trim().slice(0, 60)
    const text = sample || DEFAULT_PREVIEW_FALLBACK
    try {
      await ttsController.preview(text, { ...tts, voiceIdentifier })
    } catch (err) {
      console.error("[tts] preview failed", err)
    }
  }

  const groups = groupVoices(voices)

  return (
    <List
      navigationTitle="朗读语音"
      navigationBarTitleDisplayMode="inline"
    >
      <Section
        header={<Text>已选语音</Text>}
        footer={
          <Text>
            点击任意一行切换语音；点右侧图标可用当前参数试听当前章节的开头片段。
          </Text>
        }
      >
        <HStack>
          <VStack alignment="leading" spacing={2}>
            <Text fontWeight="semibold">
              {voices.find((v) => v.identifier === tts.voiceIdentifier)?.name ?? "跟随系统默认（中文）"}
            </Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              {tts.voiceIdentifier
                ? voices.find((v) => v.identifier === tts.voiceIdentifier)?.language ?? ""
                : "未指定，使用 zh-CN"}
            </Text>
          </VStack>
          <Spacer />
          <Button
            title="试听"
            systemImage="play.circle"
            action={() => {
              preview(tts.voiceIdentifier)
            }}
          />
        </HStack>
      </Section>

      {loading ? (
        <Section>
          <HStack>
            <ProgressView />
            <Text foregroundStyle="secondaryLabel">正在加载系统语音...</Text>
          </HStack>
        </Section>
      ) : undefined}

      {error ? (
        <Section header={<Text>加载失败</Text>}>
          <Text>{error}</Text>
        </Section>
      ) : undefined}

      {!loading && !error && voices.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">
            未找到任何中文语音。可前往「设置 {">"} 辅助功能 {">"} 朗读内容 {">"} 声音 {">"} 中文」下载对应语音后重试。
          </Text>
        </Section>
      ) : undefined}

      <Section>
        <Button
          action={() => {
            update("voiceIdentifier", "")
          }}
        >
          <HStack>
            <Image
              systemName={tts.voiceIdentifier === "" ? "checkmark.circle.fill" : "circle"}
              foregroundStyle={tts.voiceIdentifier === "" ? "systemBlue" : "secondaryLabel"}
            />
            <VStack alignment="leading" spacing={2}>
              <Text fontWeight="semibold">跟随系统默认</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">zh-CN · 未指定具体音色</Text>
            </VStack>
            <Spacer />
          </HStack>
        </Button>
      </Section>

      {groups.map((group) => (
        <Section key={group.language} header={<Text>{languageDisplayName(group.language)}</Text>}>
          {group.list.map((voice) => {
            const selected = tts.voiceIdentifier === voice.identifier
            const badge = qualityLabel(voice.quality)
            return (
              <HStack key={voice.identifier}>
                <Button
                  action={() => {
                    update("voiceIdentifier", voice.identifier)
                  }}
                >
                  <HStack>
                    <Image
                      systemName={selected ? "checkmark.circle.fill" : "circle"}
                      foregroundStyle={selected ? "systemBlue" : "secondaryLabel"}
                    />
                    <VStack alignment="leading" spacing={2}>
                      <Text fontWeight={selected ? "semibold" : "regular"}>{voice.name}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel">
                        {voice.language}
                        {badge ? ` · ${badge}` : ""}
                        {voice.gender !== "unspecified" ? ` · ${voice.gender === "female" ? "女声" : "男声"}` : ""}
                      </Text>
                    </VStack>
                    <Spacer />
                  </HStack>
                </Button>
                <Button
                  title="试听"
                  systemImage="play.circle"
                  action={() => {
                    preview(voice.identifier)
                  }}
                />
              </HStack>
            )
          })}
        </Section>
      ))}

      <Section header={<Text>参数</Text>}>
        <VStack spacing={10}>
          <Text>语速：{tts.rate.toFixed(2)}</Text>
          <Slider
            value={tts.rate}
            onChanged={(value) => update("rate", Math.round(value * 100) / 100)}
            min={0.3}
            max={0.7}
            step={0.05}
            label={<Text>语速</Text>}
          />
          <Text>音调：{tts.pitch.toFixed(2)}</Text>
          <Slider
            value={tts.pitch}
            onChanged={(value) => update("pitch", Math.round(value * 100) / 100)}
            min={0.8}
            max={1.3}
            step={0.05}
            label={<Text>音调</Text>}
          />
          <Text>音量：{tts.volume.toFixed(2)}</Text>
          <Slider
            value={tts.volume}
            onChanged={(value) => update("volume", Math.round(value * 100) / 100)}
            min={0.2}
            max={1.0}
            step={0.05}
            label={<Text>音量</Text>}
          />
        </VStack>
      </Section>

      <Section header={<Text>续章</Text>} footer={<Text>开启后，本章读完将自动播放下一章。</Text>}>
        <Toggle
          title="读完自动下一章"
          value={tts.autoNextChapter}
          onChanged={(value) => update("autoNextChapter", value)}
        />
      </Section>
    </List>
  )
}
