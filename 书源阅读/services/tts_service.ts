import { saveTtsPosition, clearTtsPosition } from "../storage"
import { ReaderTtsPreferences } from "../types"

declare function setTimeout(handler: () => void, timeout: number): number
declare function clearTimeout(handle: number): void

export type TtsState = "idle" | "speaking" | "paused"

export type TtsListener = (state: TtsState) => void

/** 上下文信息：让控制器知道当前朗读的是哪本书/哪一章，以便持久化进度 */
export type TtsSpeakContext = {
  bookKey: string
  chapterId: string
  /** 原始完整正文长度（normalize 之前），用于写入 position.contentLength */
  contentLength: number
  /** 相对于完整正文的起始字符偏移（续读时 > 0，从头读时为 0） */
  baseOffset: number
  /** 供切章替换朗读时预先更新锁屏/控制中心信息 */
  preloadNowPlaying?: boolean
  /** 用于展示在 Now Playing Center 的元数据 */
  nowPlaying?: {
    title: string
    artist?: string
    albumTitle?: string
    artwork?: UIImage
  }
  /** 供锁屏 / 控制中心远程命令回调的能力 */
  commands?: {
    nextTrack?: () => void
    previousTrack?: () => void
  }
}

const CN_LANG_PREFIXES = ["zh-CN", "zh-TW", "zh-HK", "zh-"]
const POSITION_SAVE_THROTTLE_MS = 2000
const CHARS_PER_SECOND_BASELINE = 6

function qualityWeight(q: SpeechSynthesisVoice["quality"]): number {
  if (q === "premium") return 0
  if (q === "enhanced") return 1
  return 2
}

function languageWeight(lang: string): number {
  if (lang.startsWith("zh-CN")) return 0
  if (lang.startsWith("zh-TW")) return 1
  if (lang.startsWith("zh-HK")) return 2
  return 3
}

function estimateDurationSeconds(charCount: number, rate: number): number {
  if (charCount <= 0) return 0
  const normalizedRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  return Math.max(1, charCount / (CHARS_PER_SECOND_BASELINE * normalizedRate))
}

function toNowPlayingRate(state: TtsState): number {
  return state === "speaking" ? 1 : 0
}

/**
 * 读取系统可用的中文语音，并按「普通话 > 台湾 > 香港」+「Premium > Enhanced > Default」排序。
 */
export async function listChineseVoices(): Promise<SpeechSynthesisVoice[]> {
  const all = await Speech.speechVoices
  return all
    .filter((v) => CN_LANG_PREFIXES.some((p) => v.language.startsWith(p)))
    .sort((a, b) => {
      const la = languageWeight(a.language)
      const lb = languageWeight(b.language)
      if (la !== lb) return la - lb
      const qa = qualityWeight(a.quality)
      const qb = qualityWeight(b.quality)
      if (qa !== qb) return qa - qb
      return a.name.localeCompare(b.name)
    })
}

/**
 * 合成朗读文本。
 * - 保留段落分隔（用自然停顿代替多余空白）
 * - 去掉多余的控制字符
 */
export function normalizeTextForSpeech(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim()
}

/** 句末标点：中英句号/问号/感叹号/分号/换行 */
const SENTENCE_ENDERS = new Set([
  "。",
  "！",
  "？",
  "；",
  "…",
  ".",
  "!",
  "?",
  ";",
  "\n",
])

/**
 * 把任意字符 offset 向前对齐到最近一个句子开头（上一句结束标点 + 空白之后的第一个字符）。
 * 若 offset 落在前 30 个字符内，直接返回 0（从头读）。
 */
export function alignToSentenceStart(content: string, offset: number): number {
  if (offset <= 0) return 0
  if (offset >= content.length) return content.length
  if (offset < 30) return 0

  // 从 offset 向前扫描，找到第一个句末标点
  for (let i = offset - 1; i >= 0; i--) {
    if (SENTENCE_ENDERS.has(content[i])) {
      // 跳过标点后的空白与换行
      let start = i + 1
      while (start < content.length && /\s/.test(content[start])) start++
      return start
    }
  }
  return 0
}

class TtsController {
  state: TtsState = "idle"
  private listeners = new Set<TtsListener>()
  private audioSessionReady = false
  private onFinishCallback: (() => void) | null = null
  /** 用户主动 stop / 切章时设置为 true，避免 finish 事件触发自动续章 */
  private suppressFinish = false
  /** 章节切换替换朗读时为 true：cancel 不进入 idle / 不清空 Now Playing */
  private replacingSpeech = false
  /** 章节切换替换朗读的事务代号；用于跨 await 保留“这次 cancel 属于 replace”标记 */
  private replaceGeneration = 0
  /** 章节切换替换朗读时，短时间内抑制 idle 清空锁屏信息 */
  private suppressIdleClear = false
  private currentSpeechRate = 1

  private log(event: string, extra?: Record<string, unknown>) {
    try {
      console.log(
        `[tts][debug] ${event}`,
        JSON.stringify({
          state: this.state,
          replacingSpeech: this.replacingSpeech,
          replaceGeneration: this.replaceGeneration,
          suppressFinish: this.suppressFinish,
          suppressIdleClear: this.suppressIdleClear,
          chapterId: this.currentContext?.chapterId ?? null,
          title: this.currentContext?.nowPlaying?.title ?? null,
          ...extra,
        }),
      )
    } catch (err) {
      console.log(`[tts][debug] ${event}`, extra)
    }
  }

  /** 当前 speak 的上下文（续读 / 持久化需要） */
  private currentContext: TtsSpeakContext | null = null
  /** 最近一次 progress 事件对应的绝对字符 offset（相对于完整正文） */
  private lastAbsoluteOffset = 0
  /** 节流计时器句柄 */
  private saveTimer: number | null = null
  /** 上次写入 Storage 的时间戳 */
  private lastSavedAt = 0

  constructor() {
    Speech.addListener("start", this.handleStart)
    Speech.addListener("pause", this.handlePause)
    Speech.addListener("continue", this.handleContinue)
    Speech.addListener("finish", this.handleFinish)
    Speech.addListener("cancel", this.handleCancel)
    Speech.addListener("progress", this.handleProgress)

    // 冷启动兜底：上次脚本退出时可能残留系统 Speech 队列或状态，
    // 强制 stop 一次，保证新的 speak 能从干净状态开始。
    Speech.stop("immediate").catch(() => undefined)
  }

  private handleStart = () => {
    this.log("speech.start")
    this.setState("speaking")
  }

  private handlePause = () => {
    // 暂停时立刻 flush 一次位置
    this.flushPositionNow()
    this.setState("paused")
  }

  private handleContinue = () => {
    this.setState("speaking")
  }

  private handleFinish = () => {
    const shouldFireCallback = !this.suppressFinish
    const cb = this.onFinishCallback
    const ctx = this.currentContext
    this.log("speech.finish", {
      shouldFireCallback,
      finishChapterId: ctx?.chapterId ?? null,
    })
    this.onFinishCallback = null
    this.suppressFinish = false

    // 本章自然读完 → 清除续读位置（不然下次进来会"续读最后一句"）
    if (ctx) {
      clearTtsPosition(ctx.bookKey)
    }
    this.resetProgressTracking()
    this.setState("idle")

    if (shouldFireCallback && cb) {
      try {
        cb()
      } catch (err) {
        console.error("[tts] onFinish callback error", err)
      }
    }
  }

  private handleCancel = () => {
    const pendingReplace = this.replaceGeneration > 0
    this.log("speech.cancel.before", {
      pendingReplace,
    })
    // 用户 stop / 切章 → flush 最后的位置到 Storage（方便下次续读）
    this.flushPositionNow()
    this.onFinishCallback = null
    this.suppressFinish = false

    if (pendingReplace) {
      this.log("speech.cancel.skip_idle_due_to_replace", {
        pendingReplace,
      })
      this.replaceGeneration = Math.max(0, this.replaceGeneration - 1)
      this.replacingSpeech = false
      return
    }

    this.replacingSpeech = false
    this.resetProgressTracking()
    this.log("speech.cancel.to_idle", {
      preserveNowPlaying: this.suppressIdleClear,
    })
    this.setState("idle", { preserveNowPlaying: this.suppressIdleClear })
  }

  private handleProgress = (details: SpeechProgressDetails) => {
    const ctx = this.currentContext
    if (!ctx) return
    // details.start 是相对于本次 speak 文本（可能是 slice 后的片段）的字符索引
    this.lastAbsoluteOffset = ctx.baseOffset + (details.start ?? 0)
    this.schedulePositionSave()
    this.syncNowPlaying()
  }

  private schedulePositionSave() {
    const now = Date.now()
    // 距上次写入已超过节流时间 → 立刻写一次
    if (now - this.lastSavedAt >= POSITION_SAVE_THROTTLE_MS) {
      this.flushPositionNow()
      return
    }
    // 否则起定时器在节流结束后写
    if (this.saveTimer != null) return
    const delay = POSITION_SAVE_THROTTLE_MS - (now - this.lastSavedAt)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flushPositionNow()
    }, Math.max(200, delay))
  }

  private flushPositionNow() {
    if (this.saveTimer != null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const ctx = this.currentContext
    if (!ctx) return
    const offset = this.lastAbsoluteOffset
    if (offset <= 0) return
    try {
      saveTtsPosition({
        bookKey: ctx.bookKey,
        chapterId: ctx.chapterId,
        charOffset: offset,
        contentLength: ctx.contentLength,
        updatedAt: new Date().toISOString(),
      })
      this.lastSavedAt = Date.now()
    } catch (err) {
      console.warn("[tts] save position failed", err)
    }
  }

  private resetProgressTracking() {
    if (this.saveTimer != null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.currentContext = null
    this.lastAbsoluteOffset = 0
    this.lastSavedAt = 0
    this.currentSpeechRate = 1
  }

  private clearNowPlaying() {
    this.log("now_playing.clear")
    if (this.suppressIdleClear) return
    try {
      MediaPlayer.nowPlayingInfo = null
      MediaPlayer.playbackState = MediaPlayerPlaybackState.stopped
      MediaPlayer.setAvailableCommands([])
      MediaPlayer.commandHandler = null
    } catch (err) {
      console.warn("[tts] clear now playing failed", err)
    }
  }

  private transitionToIdle(options?: { preserveNowPlaying?: boolean }) {
    this.log("state.transition_to_idle", { preserveNowPlaying: options?.preserveNowPlaying === true })
    this.state = "idle"
    if (!options?.preserveNowPlaying) {
      this.clearNowPlaying()
    }
    for (const listener of this.listeners) {
      try {
        listener("idle")
      } catch (err) {
        console.error("[tts] listener error", err)
      }
    }
  }

  private syncNowPlaying() {
    const ctx = this.currentContext
    const meta = ctx?.nowPlaying
    if (!ctx || !meta) {
      this.log("now_playing.sync.skip", {
        hasContext: Boolean(ctx),
        hasMeta: Boolean(meta),
      })
      return
    }

    const elapsed = Math.max(0, estimateDurationSeconds(this.lastAbsoluteOffset, this.currentSpeechRate))
    const duration = Math.max(elapsed, estimateDurationSeconds(ctx.contentLength, this.currentSpeechRate))

    try {
      this.log("now_playing.sync", {
        elapsed,
        duration,
        playbackRate: toNowPlayingRate(this.state),
        playbackState: this.state,
      })
      MediaPlayer.nowPlayingInfo = {
        title: meta.title,
        artist: meta.artist,
        albumTitle: meta.albumTitle,
        artwork: meta.artwork,
        mediaType: MediaType.audio,
        elapsedPlaybackTime: elapsed,
        playbackDuration: duration,
        playbackRate: toNowPlayingRate(this.state),
      }
      MediaPlayer.playbackState =
        this.state === "speaking"
          ? MediaPlayerPlaybackState.playing
          : this.state === "paused"
            ? MediaPlayerPlaybackState.paused
            : MediaPlayerPlaybackState.stopped
    } catch (err) {
      console.warn("[tts] update now playing failed", err)
    }
  }

  private installRemoteCommands() {
    const commandSet: MediaPlayerRemoteCommand[] = ["play", "pause", "togglePausePlay", "stop"]
    if (this.currentContext?.commands?.previousTrack) {
      commandSet.push("previousTrack")
    }
    if (this.currentContext?.commands?.nextTrack) {
      commandSet.push("nextTrack")
    }

    try {
      MediaPlayer.setAvailableCommands(commandSet)
      MediaPlayer.commandHandler = ((command: "pause" | "play" | "stop" | "togglePausePlay" | "nextTrack" | "previousTrack") => {
        if (command === "play") {
          this.resume().catch((err) => console.warn("[tts] remote play failed", err))
          return
        }
        if (command === "pause") {
          this.pause().catch((err) => console.warn("[tts] remote pause failed", err))
          return
        }
        if (command === "togglePausePlay") {
          if (this.state === "speaking") {
            this.pause().catch((err) => console.warn("[tts] remote toggle pause failed", err))
          } else if (this.state === "paused") {
            this.resume().catch((err) => console.warn("[tts] remote toggle play failed", err))
          }
          return
        }
        if (command === "previousTrack") {
          this.currentContext?.commands?.previousTrack?.()
          return
        }
        if (command === "nextTrack") {
          this.currentContext?.commands?.nextTrack?.()
          return
        }
        if (command === "stop") {
          this.stop().catch((err) => console.warn("[tts] remote stop failed", err))
        }
      }) as any
    } catch (err) {
      console.warn("[tts] install remote commands failed", err)
    }
  }

  private setState(next: TtsState, options?: { preserveNowPlaying?: boolean }) {
    if (this.state === next) return
    this.log("state.set", {
      from: this.state,
      to: next,
      preserveNowPlaying: options?.preserveNowPlaying === true,
    })
    this.state = next
    if (next === "idle") {
      if (!options?.preserveNowPlaying) {
        this.clearNowPlaying()
      }
    } else {
      this.syncNowPlaying()
    }
    for (const listener of this.listeners) {
      try {
        listener(next)
      } catch (err) {
        console.error("[tts] listener error", err)
      }
    }
  }

  addListener(listener: TtsListener): void {
    this.listeners.add(listener)
  }

  removeListener(listener: TtsListener): void {
    this.listeners.delete(listener)
  }

  private async ensureAudioSession(): Promise<void> {
    if (this.audioSessionReady) return
    try {
      Speech.usesApplicationAudioSession = true
      await SharedAudioSession.setCategory("playback", [])
      await SharedAudioSession.setActive(true)
      this.audioSessionReady = true
    } catch (err) {
      console.warn("[tts] audio session init failed", err)
    }
  }

  /**
   * 开始朗读文本。若当前已有朗读，会先取消再重新开始。
   * 传入 context 后，progress 会被节流持久化为续读位置。
   * text 应该已经是"从 baseOffset 截断后"的片段（调用方负责 slice 并 normalize 对齐到句子开头）。
   */
  async speak(
    text: string,
    prefs: ReaderTtsPreferences,
    options?: {
      onFinish?: () => void
      context?: TtsSpeakContext
      replaceCurrent?: boolean
    },
  ): Promise<void> {
    this.log("speak.begin", {
      replaceCurrent: options?.replaceCurrent === true,
      preloadNowPlaying: options?.context?.preloadNowPlaying === true,
      nextChapterId: options?.context?.chapterId ?? null,
    })
    const content = normalizeTextForSpeech(text)
    if (!content) return

    await this.ensureAudioSession()

    // 无论 JS 端 state 如何都强制清一次系统队列
    this.suppressFinish = true
    this.onFinishCallback = null
    this.replacingSpeech = options?.replaceCurrent === true
    if (options?.replaceCurrent === true) {
      this.replaceGeneration += 1
    }
    this.suppressIdleClear = options?.replaceCurrent === true
    this.log("speak.before_stop_current", {
      replaceCurrent: this.replacingSpeech,
      replaceGeneration: this.replaceGeneration,
      suppressIdleClear: this.suppressIdleClear,
    })
    try {
      await Speech.stop("immediate")
    } catch (err) {
      console.warn("[tts] stop before speak failed", err)
    }

    // 重置 progress 跟踪并绑定新上下文
    this.resetProgressTracking()
    this.currentContext = options?.context ?? null
    this.lastAbsoluteOffset = options?.context?.baseOffset ?? 0
    this.lastSavedAt = 0
    this.currentSpeechRate = prefs.rate

    if (options?.replaceCurrent === true && options?.context?.preloadNowPlaying) {
      this.log("speak.preload_now_playing", {
        chapterId: options.context.chapterId,
      })
      this.state = "paused"
      this.installRemoteCommands()
      this.syncNowPlaying()
    }

    this.onFinishCallback = options?.onFinish ?? null
    this.suppressFinish = false
    this.replacingSpeech = false
    this.log("speak.before_start_new", {
      chapterId: this.currentContext?.chapterId ?? null,
    })
    this.installRemoteCommands()
    this.syncNowPlaying()

    try {
      await Speech.speak(content, {
        voiceIdentifier: prefs.voiceIdentifier || undefined,
        voiceLanguage: prefs.voiceIdentifier ? undefined : "zh-CN",
        rate: prefs.rate,
        pitch: prefs.pitch,
        volume: prefs.volume,
      })
    } finally {
      this.log("speak.finally", {
        chapterId: this.currentContext?.chapterId ?? null,
      })
      this.suppressIdleClear = false
    }
  }

  /**
   * 试听：忽略 onFinish 回调与进度持久化。
   */
  async preview(text: string, prefs: ReaderTtsPreferences): Promise<void> {
    const content = normalizeTextForSpeech(text)
    if (!content) return

    await this.ensureAudioSession()

    this.suppressFinish = true
    this.onFinishCallback = null
    this.replacingSpeech = false
    try {
      await Speech.stop("immediate")
    } catch (err) {
      console.warn("[tts] stop before preview failed", err)
    }

    this.resetProgressTracking()
    this.onFinishCallback = null
    this.suppressFinish = false
    this.clearNowPlaying()

    await Speech.speak(content, {
      voiceIdentifier: prefs.voiceIdentifier || undefined,
      voiceLanguage: prefs.voiceIdentifier ? undefined : "zh-CN",
      rate: prefs.rate,
      pitch: prefs.pitch,
      volume: prefs.volume,
    })
  }

  async pause(): Promise<void> {
    if (this.state !== "speaking") return
    await Speech.pause("word")
  }

  async resume(): Promise<void> {
    if (this.state !== "paused") return
    await Speech.resume()
  }

  /**
   * 停止朗读。用户主动停止会 flush 最后位置到 Storage（供下次续读）。
   */
  async stop(): Promise<void> {
    // 先把当前位置写下去（如果有的话）
    this.flushPositionNow()

    this.suppressFinish = true
    this.onFinishCallback = null
    this.replacingSpeech = false
    this.replaceGeneration = 0
    this.suppressIdleClear = false
    try {
      await Speech.stop("immediate")
    } catch (err) {
      console.warn("[tts] stop failed", err)
    }
    this.resetProgressTracking()
    if (this.state !== "idle") {
      this.transitionToIdle()
    }
  }

  /**
   * 同步触发停止，用于组件卸载等无法 await 的场景。
   * fire-and-forget，但仍会尝试 flush 最后位置。
   */
  forceStop(): void {
    this.flushPositionNow()
    this.suppressFinish = true
    this.onFinishCallback = null
    this.replacingSpeech = false
    this.replaceGeneration = 0
    this.suppressIdleClear = false
    Speech.stop("immediate").catch(() => undefined)
    this.resetProgressTracking()
    if (this.state !== "idle") {
      this.transitionToIdle()
    }
  }
}

export const ttsController = new TtsController()
