import {
  Navigation, Script, TabView, Tab,
  VStack, HStack, Text, Button, TextField,
  Spacer, ScrollView, Image, LazyVGrid, ProgressView,
  useState, useEffect, useMemo, useRef, useObservable, fetch, VideoPlayer, AVPlayerView,
  NavigationStack, List, Section, GeometryReader, ZStack, Rectangle,
} from "scripting"
import type { PIPStatus } from "scripting"

// (download 函数运行时不存在，已改用 fetch + Data + FileManager)
// Data.fromArrayBuffer 由运行时 Data 类提供，无需 custom declare

const KEY_SEC_UID = "douyin_sec_uid"
const KEY_HISTORY = "douyin_history"
const KEY_SAVED_USERS = "douyin_saved_users"
const KEY_COOKIE = "douyin_cookie"

// 运行时全局对象
declare const screen: { width: number; height: number; scale: number } | undefined

interface VideoInfo {
  aweme_id: string; desc: string; create_time: number; cover: string
  play_url: string; duration: number; digg_count: number
  comment_count: number; author_nickname: string; author_avatar: string; unique_id: string; author_ip_location: string
  images: ImageInfo[]
}
interface ImageInfo {
  url: string        // 静态图片 URL
  videoUrl?: string  // 动图视频 URL（API 中部分图片带此字段）
}
interface HistoryItem extends VideoInfo { viewed_at: number }
interface SavedUser { id: string; nickname: string; avatar: string; savedAt: number; shortId?: string; totalFavorited?: number; followingCount?: number; followerCount?: number; signature?: string; ipLocation?: string; gender?: number }

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
const ANDROID_UA = "Mozilla/5.0 (Android; Mobile; rv:54.0) Gecko/54.0 Firefox/54.0"

// ─── 工具函数 ───
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
function pickFirstUrl(urls?: string[]): string { if (!urls || urls.length === 0) return ""; const h = urls.find((u) => u.startsWith("https://")); return h || urls[0] || "" }

/** 检测是否是 GIF 动图 URL（通过路径扩展名） */
function isGifUrl(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    return path.endsWith(".gif")
  } catch {
    const path = url.split("?")[0].split("#")[0].toLowerCase()
    return path.endsWith(".gif")
  }
}

/** 检测是否是 WebP 动图 URL */
function isAnimatedWebpUrl(url: string): boolean {
  if (!url) return false
  const path = url.split("?")[0].toLowerCase()
  return path.endsWith(".webp")
}

/**
 * 检测 Data 是否为 GIF 动图（通过 magic bytes）。
 * GIF89a / GIF87a 开头即为 GIF。
 */
function isGifData(data: Data): boolean {
  try {
    const bytes = data.toUint8Array()
    if (!bytes || bytes.length < 6) return false
    // GIF89a = 0x47 0x49 0x46 0x38 0x39 0x61
    // GIF87a = 0x47 0x49 0x46 0x38 0x37 0x61
    return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
           bytes[3] === 0x38 && (bytes[4] === 0x39 || bytes[4] === 0x37) && bytes[5] === 0x61
  } catch { return false }
}

/** 取 url_list 中最高画质的 URL（通常最后一个是最高画质 CDN） */
function pickBestUrl(urls?: string[]): string {
  if (!urls || urls.length === 0) return ""
  const https = urls.filter((u) => u.startsWith("https://"))
  return https.length > 0 ? https[https.length - 1] : (urls[0] || "")
}
function formatDuration(ms: number): string { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}` }
function formatCount(n: number): string { if (n >= 10000) return (n / 10000).toFixed(1) + "w"; if (n >= 1000) return (n / 1000).toFixed(1) + "k"; return String(n) }

// ─── 去水印 API 配置 ───
const DEWATERMARK_APIS = [
  { type: "jx", url: "https://apis.jxcxin.cn/api/douyin" },
  { type: "hybrid", url: "http://47.116.14.174:8080" },
  { type: "hybrid", url: "http://124.221.224.159:9000" },
  { type: "hybrid", url: "http://129.154.217.183:9000" },
]

/** 从 aweme_id 构造抖音分享链接 */
function getShareUrl(video: VideoInfo): string {
  return `https://www.douyin.com/video/${video.aweme_id}`
}

/**
 * 展示保存/分享选择界面
 */
async function shareVideo(video: VideoInfo, isImage: boolean, animIdx?: number) {
  const shareUrl = getShareUrl(video)
  // 如果传入了图片索引，使用该索引的图片信息
  const imgInfo = animIdx !== undefined ? video.images[animIdx] : video.images[0]
  await Navigation.present(
    <ShareProgressView
      video={video}
      shareUrl={shareUrl}
      isImage={isImage}
      originalUrl={isImage ? (imgInfo?.url || "") : video.play_url}
      imageVideoUrl={isImage ? (imgInfo?.videoUrl || "") : ""}
    />
  )
}

// ─── 分享进度视图 ───
function ShareProgressView({ video, shareUrl, isImage, originalUrl, imageVideoUrl }: {
  video: VideoInfo
  shareUrl: string
  isImage: boolean
  originalUrl: string
  imageVideoUrl: string
}) {
  const dismiss = Navigation.useDismiss()
  const [step, setStep] = useState(0)         // 0=准备, 1=去水印, 2=下载, 3=保存, 4=完成, -1=失败
  const [progressText, setProgressText] = useState("准备中...")
  const [errorMsg, setErrorMsg] = useState("")
  const [apiStatus, setApiStatus] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        // 步骤1：尝试去水印接口
        setStep(1)
        setProgressText("正在尝试去水印接口...")
        
        let targetUrl: string | null = null
        
        setApiStatus(prev => [...prev, `🔗 视频链接: ${shareUrl}`])
        
        // 依次尝试4个接口，显示详细诊断
        for (let i = 0; i < DEWATERMARK_APIS.length; i++) {
          const api = DEWATERMARK_APIS[i]
          setApiStatus(prev => [...prev, `⏳ 接口 ${i+1}/${DEWATERMARK_APIS.length} 尝试中...`])
          
          try {
            let requestUrl: string
            if (api.type === "jx") {
              requestUrl = `${api.url}?url=${encodeURIComponent(shareUrl)}`
            } else {
              requestUrl = `${api.url}/api/hybrid/video_data?url=${encodeURIComponent(shareUrl)}&minimal=false`
            }
            
            setApiStatus(prev => [...prev, `  请求: ${requestUrl.substring(0, 80)}...`])
            
            const resp = await fetch(requestUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" }
            })
            
            const statusText = `  HTTP ${resp.status} ${resp.statusText}`
            setApiStatus(prev => [...prev, statusText])
            
            if (!resp.ok) {
              setApiStatus(prev => [...prev, `  ❌ HTTP 状态码错误`])
              continue
            }
            
            const rawText = await resp.text()
            let json: any
            try { json = JSON.parse(rawText) } catch {
              setApiStatus(prev => [...prev, `  ❌ JSON 解析失败，返回不是 JSON`])
              continue
            }
            
            // 检查 detail 错误响应（Douyin_TikTok_Download_API 的错误格式）
            if (json.detail) {
              const errCode = json.detail.code || "?"
              const errMsg = json.detail.message || JSON.stringify(json.detail).substring(0, 100)
              setApiStatus(prev => [...prev, `  ❌ API 错误 [${errCode}]: ${errMsg}`])
              continue
            }
            
            // 宽松检查 code
            const respCode = json.code
            const codeOk = respCode === 200 || respCode === "200" || Number(respCode) === 200
            
            if (!codeOk) {
              setApiStatus(prev => [...prev, `  ❌ 返回 code=${respCode}，期待 200`])
              continue
            }
            
            if (!json.data) {
              setApiStatus(prev => [...prev, `  ❌ 返回无 data 字段`])
              continue
            }
            
            // --- 提取无水印 URL ---
            let extractedUrl: string | null = null
            
            if (api.type === "jx") {
              // apis.jxcxin.cn: data.url
              if (json.data.url) {
                extractedUrl = json.data.url
              } else {
                setApiStatus(prev => [...prev, `  ❌ data 格式不符，无 url 字段`])
                continue
              }
            } else {
              // Douyin_TikTok_Download_API hybrid 接口
              // 实际返回结构是 aweme_detail 的原始数据，在 data 顶层：
              // data.video.play_addr.url_list[] — 视频
              // data.images[].url_list[] — 图文
              // 也可能有 data.aweme_detail.video.play_addr.url_list[] 嵌套
              // 或 data.video_data.play_addr.url_list[]
              const vd = json.data
              
              // 根据 isImage 分开提取视频/图片路径，避免图文作品误取视频 URL
              if (isImage) {
                // 图片：只看图片路径
                const imagePaths = [
                  () => vd.images?.[0]?.url_list,
                  () => vd.image_data?.[0]?.url_list,
                  () => vd.aweme_detail?.images?.[0]?.url_list,
                ]
                for (const getList of imagePaths) {
                  try {
                    const list = getList()
                    if (list?.length > 0) {
                      extractedUrl = list[list.length - 1]
                      break
                    }
                  } catch {}
                }
              } else {
                // 视频：只看视频路径
                const videoPaths = [
                  () => vd.video?.play_addr?.url_list,
                  () => vd.video_data?.play_addr?.url_list,
                  () => vd.aweme_detail?.video?.play_addr?.url_list,
                  () => vd.aweme_detail?.video_data?.play_addr?.url_list,
                ]
                for (const getList of videoPaths) {
                  try {
                    const list = getList()
                    if (list?.length > 0) {
                      extractedUrl = list[list.length - 1]
                      break
                    }
                  } catch {}
                }
              }
              
              if (extractedUrl) {
                // 成功
              } else {
                const dataStr = JSON.stringify(vd).substring(0, 300)
                setApiStatus(prev => [...prev, `  ❌ 未找到视频/图片 URL，data 结构: ${dataStr}`])
                continue
              }
            }
            
            if (extractedUrl) {
              targetUrl = extractedUrl
              setApiStatus(prev => [...prev, `  ✅ 接口 ${i+1} 成功！`])
              break
            }
          } catch (e: any) {
            setApiStatus(prev => [...prev, `  ❌ 异常: ${e.message || e}`])
          }
        }
        
        if (!targetUrl) {
          setApiStatus(prev => [...prev, `⚠️ 所有去水印接口失败，回退原始地址`])
          targetUrl = originalUrl
        }
        
        if (!targetUrl) {
          throw new Error("无法获取下载地址（原始地址也为空）")
        }
        // 锁定 targetUrl 为不可变常量，方便后续窄化
        const finalTargetUrl = targetUrl
        setApiStatus(prev => [...prev, `📥 下载地址已获取，长度: ${finalTargetUrl.length} 字符`])
        
        // 动图处理：如果图片有伴随的视频 URL，直接下载视频保存为 mp4
        const isAnimatedImage = isImage && imageVideoUrl.length > 0
        const downloadUrl = isAnimatedImage ? imageVideoUrl : finalTargetUrl
        if (isAnimatedImage) {
          setApiStatus(prev => [...prev, `🎬 检测到动图视频源，将保存为 MP4 视频`])
        }
        
        // 步骤2：下载文件（带百分比进度）
        setStep(2)
        setProgressText("正在下载文件...")
        
        // 检测是否是 GIF 动图
        const isGif = !isAnimatedImage && isGifUrl(downloadUrl)
        const ext = isAnimatedImage ? "mp4" : (isImage ? (isGif ? "gif" : "jpg") : "mp4")
        const fileName = `${video.aweme_id}${isAnimatedImage ? "_video" : (isGif ? "_" + (video.images[0]?.url || "").split("/").pop()?.split("?")[0].replace(/[^a-zA-Z0-9]/g, "").substring(0, 10) : "")}.${ext}`
        
        setApiStatus(prev => [...prev, `📦 文件名: ${fileName}${isGif ? " (检测到 GIF 动图)" : ""}`])
        
        // 用 fetch + Data + FileManager 下载（绕过不存在的 download 函数）
        setApiStatus(prev => [...prev, `📥 开始下载...`])
        
        const downloadResp = await fetch(downloadUrl, {
          headers: { "User-Agent": MOBILE_UA }
        })
        if (!downloadResp.ok) {
          throw new Error(`下载 HTTP ${downloadResp.status}`)
        }
        
        setProgressText("正在下载... 接收数据中")
        const arrayBuf = await downloadResp.arrayBuffer()
        const data = Data.fromArrayBuffer(arrayBuf)
        if (!data) {
          throw new Error("将下载数据转换为 Data 失败")
        }
        
        setProgressText(`正在下载... ${data.size} 字节`)
        
        // 如果下载后发现是 GIF（magic bytes 检测），修正扩展名
        const actuallyGif = isGif || isGifData(data)
        const finalExt = isAnimatedImage ? "mp4" : (isImage ? (actuallyGif ? "gif" : "jpg") : "mp4")
        // 重新生成正确的文件名
        const baseFileName = `${video.aweme_id}${isAnimatedImage ? "_video" : (actuallyGif ? "_gif" : "")}`
        const finalFileName = `${baseFileName}.${finalExt}`
        
        if (actuallyGif && ext !== finalExt) {
          setApiStatus(prev => [...prev, `🔍 下载后检测到 GIF 动图 magic bytes，修正格式为 .gif`])
        }
        
        // 步骤3：写入 Documents + 保存到相册
        setStep(3)
        setProgressText("正在保存到相册...")
        
        const docPath = FileManager.documentsDirectory + finalFileName
        if (await FileManager.exists(docPath)) {
          await FileManager.remove(docPath)
        }
        try {
          // @ts-ignore
          await FileManager.writeAsData(docPath, data)
        } catch (writeErr: any) {
          throw new Error(`写入文件失败: ${writeErr?.message || String(writeErr)}`)
        }
        setApiStatus(prev => [...prev, `💾 已写入: ${docPath} (${data.size} 字节)`])
        
        // 保存到相册：
        // 1. 动图（带视频URL的）→ 保存为 MP4 视频
        // 2. GIF 动图 → Data 模式保存保留动画
        // 3. 普通图片 → 路径模式保存
        // 4. 视频 → 路径模式保存
        let savedOk = false
        if (isAnimatedImage) {
          // 动图：下载的是视频，用 saveVideo 保存为 MP4
          savedOk = await Photos.saveVideo(docPath, { fileName: finalFileName, shouldMoveFile: true })
          setApiStatus(prev => [...prev, `📤 动图已保存为 MP4 视频${savedOk ? "" : "（失败）"}`])
        } else if (actuallyGif) {
          // GIF 动图：用 Data 直接保存，保留动画
          savedOk = await Photos.savePhoto(data, { fileName: finalFileName })
          setApiStatus(prev => [...prev, `📤 GIF 动图已用 Data 模式保存${savedOk ? "" : "（失败）"}`])
        } else if (isImage) {
          savedOk = await Photos.savePhoto(docPath, { fileName: finalFileName, shouldMoveFile: true })
          setApiStatus(prev => [...prev, `📤 图片已保存${savedOk ? "" : "（失败）"}`])
        } else {
          savedOk = await Photos.saveVideo(docPath, { fileName: finalFileName, shouldMoveFile: true })
          setApiStatus(prev => [...prev, `📤 视频已保存${savedOk ? "" : "（失败）"}`])
        }
        setApiStatus(prev => [...prev, `📤 保存${savedOk ? "成功" : "失败"}`])
        
        if (!savedOk) {
          // 回退：ShareSheet
          setApiStatus(prev => [...prev, `⚠️ Photos 保存失败，尝试 ShareSheet 回退`])
          await ShareSheet.present([docPath])
        }
        
        setStep(4)
        setProgressText("完成 ✓")
        
      } catch (e: any) {
        setStep(-1)
        const msg = (e?.message || String(e) || JSON.stringify(e) || "未知错误").substring(0, 200)
        setErrorMsg(msg)
        setApiStatus(prev => [...prev, `❌ ${msg}`])
      }
    })()
  }, [])

  return (
    <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="systemBackground"
      padding={24} spacing={16} alignment="center"
    >
      <Text font="title2" bold>保存/分享</Text>
      
      {step !== -1 && step < 4 ? (
        <ProgressView foregroundStyle="systemBlue" />
      ) : null}
      
      {step !== -1 && step < 4 ? (
        <Text font="body" foregroundStyle="secondaryLabel">{progressText}</Text>
      ) : null}
      
      {step === 4 ? (
        <Image systemName="checkmark.circle.fill" font="largeTitle" foregroundStyle="systemGreen" />
      ) : null}
      
      {step === -1 ? (
        <VStack spacing={8} alignment="center" padding={{ top: 4 }}>
          <Image systemName="xmark.circle.fill" font="largeTitle" foregroundStyle="systemRed" />
          <Text font="body" foregroundStyle="systemRed">{errorMsg}</Text>
        </VStack>
      ) : null}
      
      {/* 详细诊断日志 */}
      {apiStatus.length > 0 ? (
        <ScrollView frame={{ maxWidth: "infinity", maxHeight: 280 }}>
          <VStack spacing={2} frame={{ maxWidth: "infinity" }}>
            {apiStatus.map((s, i) => (
              <Text key={i} font="caption2" foregroundStyle="tertiaryLabel" lineLimit={3}>{s}</Text>
            ))}
          </VStack>
        </ScrollView>
      ) : null}
      
      {step >= 4 || step === -1 ? (
        <Button title="关闭" action={() => dismiss()} />
      ) : null}
    </VStack>
  )}

// ─── 动图/图片单页组件 ──—
/**
 * 单张图片/动图页面：
 * - 如果有 videoUrl（API 提供的动图视频），用 AVPlayer 循环播放
 * - 如果是 GIF 动图 URL，用 WebView 原生渲染动画
 * - 否则显示静态 Image
 */
function AnimatedImagePage({ imgInfo, pageWidth, pageHeight }: { imgInfo: ImageInfo; pageWidth: number; pageHeight: number }) {
  const [player, setPlayer] = useState<AVPlayer | null>(null)
  const [playerError, setPlayerError] = useState(false)

  // 有视频 URL 时自动创建播放器并循环播放
  useEffect(() => {
    if (!imgInfo.videoUrl) return
    const p = new AVPlayer()
    p.setSource(imgInfo.videoUrl, {
      headers: { "User-Agent": MOBILE_UA, Referer: "https://www.douyin.com/" }
    })
    // 静音播放（动图通常无声音）
    p.volume = 0
    // 无限循环
    p.numberOfLoops = -1
    SharedAudioSession.setCategory('playback', [])
    SharedAudioSession.setActive(true)
    p.onReadyToPlay = () => {
      setPlayer(p)
      p.play()
    }
    p.onError = () => {
      setPlayerError(true)
    }
    return () => {
      try { p.stop(); p.dispose() } catch {}
    }
  }, [])

  // 情况1：有视频 URL 且播放器就绪 → 播放视频
  if (imgInfo.videoUrl && player) {
    return (
      <VStack frame={{ width: pageWidth, height: pageHeight }} background="black" alignment="center">
        <VideoPlayer
          player={player}
          overlay={
            <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={8}>
              {/* 动图标识 */}
              <HStack padding={{ horizontal: 6, vertical: 2 }} background="black" opacity={0.5} clipShape={{ type: "rect", cornerRadius: 4 }}>
                <Text font="caption2" foregroundStyle="white">GIF</Text>
              </HStack>
            </VStack>
          }
        />
      </VStack>
    )
  }

  // 情况2：有视频 URL 但出错或未就绪 → 显示静态图 + loading
  if (imgInfo.videoUrl && !player) {
    return (
      <VStack frame={{ width: pageWidth, height: pageHeight }} background="black" alignment="center">
        <Image
          imageUrl={imgInfo.url}
          resizable
          aspectRatio={{ value: null, contentMode: 'fit' }}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          opacity={playerError ? 1 : 0.5}
        />
        {!playerError ? (
          <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} alignment="center">
            <ProgressView foregroundStyle="white" />
          </VStack>
        ) : null}
      </VStack>
    )
  }

  // 情况3：GIF 动图 URL → 用 WebView 原生渲染动画
  if (isGifUrl(imgInfo.url)) {
    return (
      <VStack frame={{ width: pageWidth, height: pageHeight }} background="black" alignment="center">
        <Image
          imageUrl={imgInfo.url}
          resizable
          aspectRatio={{ value: null, contentMode: 'fit' }}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />
      </VStack>
    )
  }

  // 情况4：普通静态图
  return (
    <VStack frame={{ width: pageWidth, maxHeight: "infinity" }} background="black" alignment="center">
      <Image
        imageUrl={imgInfo.url}
        resizable
        aspectRatio={{ value: null, contentMode: 'fit' }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
    </VStack>
  )
}

// ─── 图文预览 ───
function ImagePostPreviewView({ video }: { video: VideoInfo }) {
  const dismiss = Navigation.useDismiss()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  return (
    <GeometryReader>{(proxy) => {
      const topInset = Math.max(64, proxy.safeAreaInsets.top + 12)
      const { width, height } = proxy.size
      return (
        <ZStack
          frame={{ width, height }}
          background="black"
          ignoresSafeArea
          statusBarHidden
        >
          <ScrollView
            axes="horizontal"
            scrollTargetBehavior="paging"
            scrollIndicator="never"
            frame={{ width, height }}
            onScrollTargetVisibilityChange={{
              idType: "number",
              threshold: 0.6,
              onChanged: (ids) => {
                const index = ids.find((id): id is number => typeof id === "number")
                if (index !== undefined) setCurrentImageIndex(index)
              },
            }}
          >
            <HStack spacing={0} scrollTargetLayout>
              {video.images.map((imgInfo, index) => (
                <AnimatedImagePage key={index} imgInfo={imgInfo} pageWidth={width} pageHeight={height} />
              ))}
            </HStack>
          </ScrollView>
          <VStack
            frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
            padding={{ top: topInset, bottom: 24, horizontal: 16 }}
            spacing={0}
          >
            <HStack frame={{ maxWidth: "infinity" }}>
              <ZStack frame={{ width: 80, height: 72 }} onTapGesture={dismiss}>
                <Rectangle fill="rgba(0,0,0,0.001)" frame={{ width: 80, height: 72 }} />
                <Image systemName="xmark.circle.fill" font="title" foregroundStyle="white" opacity={0.88} />
              </ZStack>
              <Spacer />
            </HStack>
            <Spacer />
            <HStack frame={{ maxWidth: "infinity" }}>
              <Button action={() => shareVideo(video, true, currentImageIndex)}>
                <Image systemName="square.and.arrow.up" font="title3" foregroundStyle="white" opacity={0.9} />
              </Button>
              <Spacer />
            </HStack>
          </VStack>
        </ZStack>
      )
    }}</GeometryReader>
  )
}

// ─── BBplayer 同款双播放器手势流 ───
type FeedPlaybackPhase = "loading" | "playing" | "error"
type FeedPlayerSlot = 0 | 1
type FeedPlayerPair = [AVPlayer, AVPlayer]

function makeFeedPlayerPair(): FeedPlayerPair {
  const pair: FeedPlayerPair = [new AVPlayer(), new AVPlayer()]
  for (const player of pair) {
    player.volume = 1
    player.defaultRate = 1
    player.numberOfLoops = -1
  }
  return pair
}

function releaseFeedPlayerPair(pair: FeedPlayerPair): void {
  for (const player of pair) {
    try { player.stop(); player.dispose() } catch {}
  }
}

function VideoSwipeFeedView({ videos, initialIndex }: { videos: VideoInfo[]; initialIndex: number }) {
  const dismiss = Navigation.useDismiss()
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, videos.length - 1))
  const initialPlayers = useMemo(() => makeFeedPlayerPair(), [])
  const playersRef = useRef<FeedPlayerPair>(initialPlayers)
  const activeSlotRef = useRef<FeedPlayerSlot>(0)
  const currentIndexRef = useRef(safeInitialIndex)
  const slotVideoIDs = useRef<[string | undefined, string | undefined]>([undefined, undefined])
  const slotGenerations = useRef<[number, number]>([0, 0])
  const mounted = useRef(true)
  const switching = useRef(false)
  const closing = useRef(false)
  const pipStatus = useObservable<PIPStatus>()
  const [activeSlot, setActiveSlot] = useState<FeedPlayerSlot>(0)
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex)
  const [phase, setPhase] = useState<FeedPlaybackPhase>("loading")
  const [dragOffset, setDragOffset] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")

  function playerAt(slot: FeedPlayerSlot): AVPlayer {
    return playersRef.current[slot]
  }

  function inactiveSlot(): FeedPlayerSlot {
    return activeSlotRef.current === 0 ? 1 : 0
  }

  function isCurrentGeneration(slot: FeedPlayerSlot, generation: number): boolean {
    return slotGenerations.current[slot] === generation
  }

  function installPlayerCallbacks(slot: FeedPlayerSlot, generation: number): void {
    const player = playerAt(slot)
    player.onReadyToPlay = () => {
      if (!mounted.current || !isCurrentGeneration(slot, generation) || slot !== activeSlotRef.current) return
      if (!player.play()) {
        setErrorMessage("视频已就绪，但自动播放失败")
        setPhase("error")
      }
    }
    player.onTimeControlStatusChanged = (status) => {
      if (!mounted.current || !isCurrentGeneration(slot, generation) || slot !== activeSlotRef.current) return
      if (status === TimeControlStatus.playing) setPhase("playing")
      else if (status === TimeControlStatus.waitingToPlayAtSpecifiedRate) setPhase("loading")
    }
    player.onError = (message) => {
      if (!mounted.current || !isCurrentGeneration(slot, generation)) return
      if (slot !== activeSlotRef.current) {
        slotVideoIDs.current[slot] = undefined
        player.stop()
        console.warn(`下一条视频预热失败：${message}`)
        return
      }
      setErrorMessage(message || "视频播放失败")
      setPhase("error")
    }
  }

  function configureSource(slot: FeedPlayerSlot, item: VideoInfo): boolean {
    if (!item.play_url) return false
    const player = playerAt(slot)
    const generation = slotGenerations.current[slot] + 1
    slotGenerations.current[slot] = generation
    player.stop()
    installPlayerCallbacks(slot, generation)
    const accepted = player.setSource(item.play_url, {
      headers: { "User-Agent": MOBILE_UA, Referer: "https://www.douyin.com/" }
    })
    slotVideoIDs.current[slot] = accepted ? item.aweme_id : undefined
    return accepted
  }

  function prewarmNextVideo(): void {
    const next = videos[currentIndexRef.current + 1]
    if (!next) return
    const slot = inactiveSlot()
    if (slotVideoIDs.current[slot] === next.aweme_id) return
    if (!configureSource(slot, next)) {
      console.warn("下一条视频媒体预热失败，将在切换时重试")
    }
  }

  function closePlayer(): void {
    if (closing.current) return
    closing.current = true
    playerAt(0).pause()
    playerAt(1).pause()
    dismiss()
  }

  function updateDrag(translationX: number, translationY: number): void {
    if (switching.current || phase === "error") return
    if (Math.abs(translationX) > Math.abs(translationY)) {
      setDragOffset(0)
      return
    }
    const atTop = currentIndexRef.current <= 0
    const atBottom = currentIndexRef.current >= videos.length - 1
    const blocked = (translationY > 0 && atTop) || (translationY < 0 && atBottom)
    setDragOffset(translationY * (blocked ? 0.18 : 1))
  }

  async function finishDrag(
    translationX: number,
    translationY: number,
    predictedY: number,
    velocityY: number,
    pageHeight: number,
  ): Promise<void> {
    if (switching.current || phase === "error") {
      setDragOffset(0)
      return
    }

    const vertical = Math.abs(translationY) > Math.abs(translationX)
    const projected = Math.abs(predictedY) > Math.abs(translationY) ? predictedY : translationY
    const threshold = Math.min(110, Math.max(1, pageHeight) * 0.18)
    const enoughDistance = Math.abs(translationY) >= threshold
    const enoughMomentum = Math.abs(velocityY) >= 650 && Math.abs(projected) >= 70
    const direction = vertical && (enoughDistance || enoughMomentum)
      ? (projected < 0 ? 1 : projected > 0 ? -1 : 0)
      : 0
    const targetIndex = currentIndexRef.current + direction

    if (direction === 0 || targetIndex < 0 || targetIndex >= videos.length) {
      await withAnimation(Animation.interactiveSpring({ response: 0.28, dampingFraction: 0.86 }), () => {
        setDragOffset(0)
      })
      return
    }

    switching.current = true
    const oldIndex = currentIndexRef.current
    const oldSlot = activeSlotRef.current
    const targetSlot = inactiveSlot()
    const target = videos[targetIndex]
    try {
      setErrorMessage("")
      const outgoingDirection = direction > 0 ? -1 : 1
      await withAnimation(Animation.easeOut(0.2), () => {
        setDragOffset(outgoingDirection * pageHeight)
      })
      if (!mounted.current) return
      if (slotVideoIDs.current[targetSlot] !== target.aweme_id && !configureSource(targetSlot, target)) {
        throw new Error("播放器无法打开该视频地址")
      }

      playerAt(oldSlot).pause()
      activeSlotRef.current = targetSlot
      currentIndexRef.current = targetIndex
      setActiveSlot(targetSlot)
      setCurrentIndex(targetIndex)
      setPhase("loading")
      addToHistory(target)

      // 预热播放器的 ready 回调可能已经触发；切换槽位后必须主动 play。
      playerAt(targetSlot).play()
      setDragOffset(-outgoingDirection * pageHeight)
      await withAnimation(Animation.spring({ duration: 0.3, bounce: 0.05 }), () => {
        setDragOffset(0)
      })
      prewarmNextVideo()
    } catch (error) {
      currentIndexRef.current = oldIndex
      activeSlotRef.current = oldSlot
      setCurrentIndex(oldIndex)
      setActiveSlot(oldSlot)
      setDragOffset(0)
      setErrorMessage(error instanceof Error ? error.message : "切换视频失败")
      setPhase("error")
      playerAt(oldSlot).play()
    } finally {
      switching.current = false
    }
  }

  useEffect(() => {
    mounted.current = true
    SharedAudioSession.setCategory("playback", [])
      .then(() => SharedAudioSession.setActive(true))
      .catch((error) => console.warn(`音频会话配置失败：${String(error)}`))

    const initial = videos[safeInitialIndex]
    addToHistory(initial)
    if (!configureSource(0, initial)) {
      setErrorMessage("无法打开当前视频地址")
      setPhase("error")
    }
    prewarmNextVideo()

    return () => {
      mounted.current = false
      releaseFeedPlayerPair(playersRef.current)
      SharedAudioSession.setActive(false, ["notifyOthersOnDeactivation"]).catch(() => {})
    }
  }, [])

  const current = videos[currentIndex]
  const feedback = phase === "error" ? (
    <VStack spacing={12} padding={24} frame={{ maxWidth: 320 }} background="black" opacity={0.86} clipShape={{ type: "rect", cornerRadius: 8 }}>
      <Image systemName="exclamationmark.triangle.fill" font="largeTitle" foregroundStyle="white" />
      <Text font="subheadline" foregroundStyle="white" multilineTextAlignment="center">{errorMessage}</Text>
      <Button title="关闭" action={closePlayer} />
    </VStack>
  ) : phase === "loading" ? (
    <ProgressView foregroundStyle="white" />
  ) : undefined

  return (
    <GeometryReader>{(proxy) => {
      const topInset = Math.max(64, proxy.safeAreaInsets.top + 12)
      return (
      <ZStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background="black"
        ignoresSafeArea
        statusBarHidden
        persistentSystemOverlays="hidden"
      >
        <ZStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          offset={{ x: 0, y: dragOffset }}
        >
          <AVPlayerView
            key={`feed-player-${activeSlot}-${current.aweme_id}`}
            player={playerAt(activeSlot)}
            pipStatus={pipStatus}
            allowsPictureInPicturePlayback={false}
            updatesNowPlayingInfoCenter={false}
            videoGravity="resizeAspect"
            frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          />
          <Rectangle
            fill="clear"
            contentShape="rect"
            frame={{ width: proxy.size.width, height: proxy.size.height }}
            onDragGesture={{
              minDistance: 8,
              coordinateSpace: "global",
              onChanged: (details) => updateDrag(details.translation.width, details.translation.height),
              onEnded: (details) => {
                void finishDrag(
                  details.translation.width,
                  details.translation.height,
                  details.predictedEndTranslation.height,
                  details.velocity.height,
                  proxy.size.height,
                )
              },
            }}
          />
          {feedback}
        </ZStack>

        <VStack
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          padding={{ top: topInset, bottom: 24, horizontal: 16 }}
          spacing={0}
        >
          <HStack frame={{ maxWidth: "infinity" }}>
            <ZStack frame={{ width: 80, height: 72 }} onTapGesture={closePlayer}>
              <Rectangle fill="rgba(0,0,0,0.001)" frame={{ width: 80, height: 72 }} />
              <Image systemName="xmark.circle.fill" font="title" foregroundStyle="white" opacity={0.88} />
            </ZStack>
            <Spacer />
            <Text font="caption" foregroundStyle="white" opacity={0.75}>{currentIndex + 1} / {videos.length}</Text>
          </HStack>
          <Spacer />
          <VStack frame={{ maxWidth: "infinity" }} alignment="leading" spacing={10}>
            {current.desc ? <Text font="subheadline" foregroundStyle="white" lineLimit={2}>{current.desc}</Text> : null}
            <HStack frame={{ maxWidth: "infinity" }}>
              <Button action={() => shareVideo(current, false)}>
                <Image systemName="square.and.arrow.up" font="title3" foregroundStyle="white" opacity={0.9} />
              </Button>
              <Spacer />
            </HStack>
          </VStack>
        </VStack>
      </ZStack>
      )
    }}</GeometryReader>
  )
}

// ─── 打开作品（防双击） ───
let _openingVideo = false
async function openVideo(items: VideoInfo[], initialIndex: number) {
  if (_openingVideo || items.length === 0) return
  const selected = items[Math.max(0, Math.min(initialIndex, items.length - 1))]
  _openingVideo = true
  try {
    if (selected.images.length > 0) {
      addToHistory(selected)
      await Navigation.present({
        element: <ImagePostPreviewView video={selected} />,
        modalPresentationStyle: 'overFullScreen',
      })
      return
    }

    const videos = items.filter((item) => item.images.length === 0)
    const startIndex = Math.max(0, videos.findIndex((item) => item.aweme_id === selected.aweme_id))
    await Navigation.present({
      element: <VideoSwipeFeedView videos={videos} initialIndex={startIndex} />,
      modalPresentationStyle: 'overFullScreen',
    })
  } finally {
    _openingVideo = false
  }
}

// ─── Storage ───
function loadSecUid(): string { return Storage.get<string>(KEY_SEC_UID) || "" }
function saveSecUid(uid: string) { Storage.set(KEY_SEC_UID, uid) }

function loadHistory(): HistoryItem[] {
  try { const raw = Storage.get<string>(KEY_HISTORY); if (!raw) return []; return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [] }
  catch { return [] }
}
function saveHistory(items: HistoryItem[]) { Storage.set(KEY_HISTORY, JSON.stringify(items.slice(0, 500))) }
function addToHistory(video: VideoInfo) {
  const history = loadHistory(); const idx = history.findIndex((h) => h.aweme_id === video.aweme_id)
  if (idx >= 0) history.splice(idx, 1)
  history.unshift({ ...video, viewed_at: Date.now() }); saveHistory(history)
}
function loadSavedUsers(): SavedUser[] {
  try { const raw = Storage.get<string>(KEY_SAVED_USERS); if (!raw) return []; return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [] }
  catch { return [] }
}
function loadCurrentSavedUser(): SavedUser | null {
  const uid = loadSecUid()
  if (!uid) return null
  return loadSavedUsers().find((u) => u.id === uid) || null
}
function saveUser(user: SavedUser) {
  const users = loadSavedUsers(); const idx = users.findIndex((u) => u.id === user.id)
  if (idx >= 0) users.splice(idx, 1); users.unshift(user)
  Storage.set(KEY_SAVED_USERS, JSON.stringify(users.slice(0, 20)))
}

// ─── 抖音号解析 ───
function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s]+/)
  return m ? m[0].replace(/[:：][^\s]*$/, "") : text
}

// ─── iesdouyin API + Cookie 直调 ───
// 有 Cookie 时带上，可能 API 需要认证才能正确返回 JSON
async function resolveViaIesdouyin(uniqueId: string): Promise<{ secUid: string; nickname: string; avatar: string; shortId: string; totalFavorited: number; followingCount: number; followerCount: number; signature: string; ipLocation: string; gender: number } | null> {
  try {
    const cookie = (Storage.get<string>(KEY_COOKIE) || "").trim()
    const headers: Record<string, string> = { "User-Agent": ANDROID_UA, Referer: "https://www.iesdouyin.com/" }
    if (cookie) headers["Cookie"] = cookie
    const url = `https://www.iesdouyin.com/web/api/v2/user/info/?unique_id=${encodeURIComponent(uniqueId)}`
    const resp = await timeoutFetch(fetch(url, { method: "GET", headers }), 5000)
    if (!resp.ok) return null
    const text = await resp.text()
    let data: any
    try { data = JSON.parse(text) } catch { return null }
    const info = data?.user_info
    if (!info || !info.sec_uid) return null
    return {
      secUid: info.sec_uid,
      nickname: info.nickname || "",
      avatar: pickFirstUrl(info.avatar_thumb?.url_list) || pickFirstUrl(info.avatar_larger?.url_list) || "",
      shortId: info.unique_id || "",
      totalFavorited: parseInt(info.total_favorited) || 0,
      followingCount: info.following_count || 0,
      followerCount: info.follower_count || 0,
      signature: info.signature || info.desc || "",
      ipLocation: info.ip_location || info.ip_loc || info.region || "",
      gender: info.gender ?? 0,
    }
  } catch {
    return null
  }
}

async function resolveViaWebView(url: string): Promise<string> {
  const webView = new WebViewController({ ephemeral: true })
  try {
    webView.setCustomUserAgent(MOBILE_UA)
    await webView.loadURL(url)
    await webView.waitForLoad()
    // 等待页面重定向和 JS 渲染完成
    let prevUrl = url
    for (let i = 0; i < 6; i++) {
      await sleep(1500)
      const currentUrl = await webView.evaluateJavaScript<string>("location.href")
      if (currentUrl && currentUrl !== prevUrl) {
        prevUrl = currentUrl
        // URL 变了（重定向了），额外等一会儿让新页面渲染
        await sleep(2000)
        break
      }
    }
    const extracted = await webView.evaluateJavaScript<string>(`
      (function(){
        var h=location.href;
        // 1. 优先从 URL 提取：/user/xxx 或 /share/user/xxx
        var m=h.match(/\/user\/([A-Za-z0-9_\-\.@]+)/);
        if(m&&m[1].length>15)return m[1];
        m=h.match(/sec_user_id=([^&#]+)/);
        if(m)return decodeURIComponent(m[1]);
        // 2. 从 _ROUTER_DATA 提取
        try{var v=Object.values(window._ROUTER_DATA?.loaderData||{});for(var i=0;i<v.length;i++){if(v[i]?.userPage?.sec_uid)return v[i].userPage.sec_uid;if(v[i]?.sec_uid)return v[i].sec_uid}}catch(e){}
        // 3. 从 __INITIAL_STATE__ 提取
        try{var s=window.__INITIAL_STATE__;if(s?.user?.sec_uid)return s.user.sec_uid}catch(e){}
        // 4. 从 __NEXT_DATA__ 提取
        try{var nd=JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent||'{}');if(nd?.props?.pageProps?.user?.sec_uid)return nd.props.pageProps.user.sec_uid;if(nd?.props?.pageProps?.sec_uid)return nd.props.pageProps.sec_uid}catch(e){}
        // 5. 从所有 script 标签搜索 sec_uid
        try{var sc=document.scripts;for(var j=0;j<sc.length;j++){m=(sc[j].textContent||'').match(/"sec_uid"\s*:\s*"([A-Za-z0-9_\-\.@]+)"/);if(m&&m[1].length>15)return m[1]}}catch(e){}
        // 6. 从 SSR state 提取
        try{var ssr=window.__SSR_RENDER_DATA__||window.__STORE__||window.__PREFETCH_DATA__;if(ssr&&typeof ssr==='object'){var json=JSON.stringify(ssr);m=json.match(/"sec_uid"\s*:\s*"([A-Za-z0-9_\-\.@]+)"/);if(m&&m[1].length>15)return m[1]}}catch(e){}
        return''})()
    `)
    return typeof extracted === "string" ? extracted : ""
  } finally { webView.dispose() }
}

async function resolveSecUid(input: string): Promise<{ secUid: string; nickname?: string; avatar?: string; shortId?: string; totalFavorited?: number; followingCount?: number; followerCount?: number; signature?: string; ipLocation?: string; gender?: number; error?: string }> {
  let val = extractUrl(input)
  if (!val) return { secUid: "", error: "输入为空" }
  if (/v\.douyin\.com/.test(val)) {
    try {
      const uid = await resolveViaWebView(val)
      if (uid) return { secUid: uid }
      return { secUid: "", error: "无法解析该短链接" }
    }
    catch (e) { return { secUid: "", error: `解析失败: ${(e as Error).message}` } }
  }
  const mShare = val.match(/douyin\.com\/share\/user\/([A-Za-z0-9_\-\.]+)/)
  if (mShare) {
    const shareName = mShare[1]
    // 先用 Cookie 解析，不行再用 WebView
    try {
      const info = await resolveViaIesdouyin(shareName)
      if (info) return { secUid: info.secUid, nickname: info.nickname, avatar: info.avatar, shortId: shareName, totalFavorited: info.totalFavorited, followingCount: info.followingCount, followerCount: info.followerCount, signature: info.signature, ipLocation: info.ipLocation, gender: info.gender }
    } catch {}
    try {
      const uid = await resolveViaSharePage(shareName)
      if (uid) return { secUid: uid }
    } catch {}
    try {
      const uid = await resolveViaWebView(val)
      if (uid) return { secUid: uid }
    } catch {}
    return { secUid: "", error: "无法解析该分享链接" }
  }
  const m1 = val.match(/sec_user_id=([^&#]+)/)
  if (m1) return { secUid: decodeURIComponent(m1[1]) }
  const m2 = val.match(/douyin\.com\/user\/([A-Za-z0-9_\-\.]+)/)
  if (m2) return { secUid: m2[1] }
  if (val.length > 20 && /^[A-Za-z0-9_\-\.]{20,}$/.test(val)) return { secUid: val }
  if (/^[A-Za-z0-9_.]{3,30}$/.test(val) && !/^https?:\/\//.test(val)) {
    try {
      // 1. 原始 iesdouyin API + Cookie（最快，返回完整资料）
      const info = await resolveViaIesdouyin(val)
      if (info) return { secUid: info.secUid, nickname: info.nickname, avatar: info.avatar, shortId: val, totalFavorited: info.totalFavorited, followingCount: info.followingCount, followerCount: info.followerCount, signature: info.signature, ipLocation: info.ipLocation, gender: info.gender }
      // 2. SSR 分享页面 + Cookie
      const uid2 = await resolveViaSharePage(val)
      if (uid2) return { secUid: uid2, shortId: val }
      // 3. 最终兜底：WebView
      const uid3 = await resolveViaWebView(`https://www.douyin.com/share/user/${encodeURIComponent(val)}`)
      if (uid3) return { secUid: uid3, shortId: val }
      return { secUid: "", error: "无法解析该抖音号" }
    }
    catch (e) { return { secUid: "", error: `解析失败: ${(e as Error).message}` } }
  }
  if (/^https?:\/\//.test(val)) {
    try { const uid = await resolveViaWebView(val); if (uid) return { secUid: uid }; return { secUid: "", error: "无法从该链接解析" } }
    catch (e) { return { secUid: "", error: `解析失败: ${(e as Error).message}` } }
  }
  return { secUid: val }
}

// ─── 通过 Cookie 请求 SSR 分享页面解析抖音号 ───
// 原理：douyin.com/share/user/{抖音号} 是服务端渲染页面，HTML 中包含用户数据的 JSON
// 比 WebView 快（单次 HTTP 请求），比搜索 API 可靠
async function resolveViaSharePage(keyword: string): Promise<string> {
  const cookie = (Storage.get<string>(KEY_COOKIE) || "").trim()
  if (!cookie) return ""
  try {
    const url = `https://www.douyin.com/share/user/${encodeURIComponent(keyword)}`
    const resp = await timeoutFetch(fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": MOBILE_UA,
        "Cookie": cookie,
        "Referer": "https://www.douyin.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      }
    }), 5000)
    if (!resp.ok) return ""
    const html = await resp.text()

    // 1. 尝试从 __INITIAL_STATE__ 提取
    const m1 = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.*?});?\s*<\/script>/)
    if (m1) {
      try {
        const state = JSON.parse(m1[1])
        // 不同页面结构：{ user: { sec_uid } } 或 { userPage: { sec_uid } }
        if (state?.user?.sec_uid) return state.user.sec_uid
        if (state?.userPage?.sec_uid) return state.userPage.sec_uid
      } catch {}
    }

    // 2. 直接用正则搜索所有 script 中的 "sec_uid":"xxxx"
    const m2 = html.match(/"sec_uid"\s*:\s*"([A-Za-z0-9_\-\.@]{10,})"/)
    if (m2) return m2[1]

    // 3. 从任意 script 内容里提取
    const scriptRe = /<script[^>]*>([^<]{0,50000}?"sec_uid"[^<]*?)<\/script>/g
    let sm
    while ((sm = scriptRe.exec(html)) !== null) {
      const m = sm[1].match(/"sec_uid"\s*:\s*"([A-Za-z0-9_\-\.@]{10,})"/)
      if (m) return m[1]
    }
  } catch {}
  return ""
}

/** 判断 Cookie 是否包含已登录账号的核心会话 */
function hasLoginSession(cookie: string): boolean {
  return /(?:^|;\s*)(?:sessionid|sessionid_ss)=[^;]+(?:;|$)/.test(cookie)
}

/** 从 Storage 读取会话；缺失时自动从持久 WebView Cookie 仓库同步 */
async function loadLoginCookie(): Promise<string> {
  const stored = (Storage.get<string>(KEY_COOKIE) || "").trim()
  if (hasLoginSession(stored)) return stored

  const webView = new WebViewController()
  try {
    const cookies: any[] = await webView.getCookies("https://www.douyin.com/")
    const cookie = cookiesToString(cookies)
    if (hasLoginSession(cookie)) {
      Storage.set(KEY_COOKIE, cookie)
      return cookie
    }
    return stored
  } finally {
    webView.dispose()
  }
}

/** 生成不包含 Cookie/令牌明文的响应摘要 */
function summarizeResponseBody(text: string): string {
  const compact = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim()
  if (!compact) return "空响应"
  return compact
    .slice(0, 160)
    .replace(/((?:sessionid|sessionid_ss|sid_guard|sid_tt|uid_tt|token|cookie)=)[^;\s"']+/gi, "$1[已隐藏]")
}

// ─── API ───
function parseAwemeResponse(rawJson: string, responseMeta?: { status: number; contentType: string }): { videos: VideoInfo[]; maxCursor: number; hasMore: boolean } {
  let data: any
  try {
    data = JSON.parse(rawJson)
  } catch {
    const meta = responseMeta
      ? `HTTP ${responseMeta.status}，Content-Type: ${responseMeta.contentType || "未知"}，`
      : ""
    throw new Error(`接口未返回 JSON（${meta}${rawJson.length} 字符，${summarizeResponseBody(rawJson)}）`)
  }
  if (data.status_code !== 0) throw new Error(`API 错误: ${data.status_msg || data.status_code}`)
  let awemeList: any[] = Array.isArray(data.aweme_list) ? data.aweme_list : []
  if (awemeList.length === 0) {
    function findAwemeList(obj: any): any[] | null {
      if (!obj || typeof obj !== 'object') return null
      if (Array.isArray(obj.aweme_list)) return obj.aweme_list
      for (const k of Object.keys(obj)) { const v = obj[k]; if (v && typeof v === 'object') { if (Array.isArray(v.aweme_list)) return v.aweme_list; const r = findAwemeList(v); if (r) return r } }
      return null
    }
    const found = findAwemeList(data)
    if (found) awemeList = found
  }
  if (awemeList.length === 0) throw new Error("未找到作品数据")
  const videos: VideoInfo[] = awemeList.map((item: any) => ({
    aweme_id: item.aweme_id || "", desc: item.desc || "", create_time: item.create_time || 0,
    cover: pickBestUrl(item.video?.origin_cover?.url_list) || pickBestUrl(item.video?.cover?.url_list),
    play_url: pickBestUrl(item.video?.play_addr?.url_list) || pickBestUrl(item.video?.download_addr?.url_list) || "",
    duration: item.video?.duration || 0, digg_count: item.statistics?.digg_count || 0,
    comment_count: item.statistics?.comment_count || 0,
    author_nickname: item.author?.nickname || "",
    author_avatar: pickBestUrl(item.author?.avatar_larger?.url_list) || pickBestUrl(item.author?.avatar_medium?.url_list) || pickBestUrl(item.author?.avatar_thumb?.url_list),
    unique_id: item.author?.unique_id || "",
    author_ip_location: item.author?.ip_location || item.author?.ip_loc || item.author?.region || "",
    images: (item.images || []).map((img: any) => ({
      url: pickBestUrl(img.url_list),
      videoUrl: pickBestUrl(img.video?.play_addr?.url_list) || undefined,
    })).filter((img: ImageInfo) => img.url),
  }))
  return { videos, maxCursor: data.max_cursor || 0, hasMore: data.has_more === 1 }
}

async function fetchViaWebView(secUid: string, cursor: number = 0): Promise<string> {
  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=web&aid=6383&sec_user_id=${encodeURIComponent(secUid)}&count=21&max_cursor=${cursor}&cookie_enabled=true&platform=web&downlink=10`
  const webView = new WebViewController({ ephemeral: false })
  try {
    webView.setCustomUserAgent(MOBILE_UA)
    await webView.loadURL("https://www.douyin.com/")
    await webView.waitForLoad()
    let sig = ""
    for (let i = 0; i < 15; i++) {
      await sleep(2000)
      try {
        sig = await webView.evaluateJavaScript<string>("(document.cookie.match(/__ac_signature=([^;]+)/)||[])[1]||''")
        if (sig && sig.length > 5) break
      } catch {}
    }
    if (!sig || sig.length <= 5) {
      try {
        await webView.loadURL(`https://www.douyin.com/user/${encodeURIComponent(secUid)}`)
        await webView.waitForLoad()
        await sleep(3000)
        for (let i = 0; i < 10; i++) {
          await sleep(2000)
          try {
            sig = await webView.evaluateJavaScript<string>("(document.cookie.match(/__ac_signature=([^;]+)/)||[])[1]||''")
            if (sig && sig.length > 5) break
          } catch {}
        }
      } catch {}
    }
    if (!sig || sig.length <= 5) {
      throw new Error("WebView 未获取到 __ac_signature。请在设置页填写 douyin.com Cookie 即可跳过此步骤。")
    }
    await webView.evaluateJavaScript(`
      (function(){window.__API_DONE=0;window.__API_DATA='';try{
        var x=new XMLHttpRequest();
        x.open('GET','${apiUrl.replace(/'/g, "\\'")}',true);
        x.setRequestHeader('Accept','application/json, text/plain, */*');
        x.onload=function(){window.__API_DATA=x.responseText;window.__API_DONE=2};
        x.onerror=function(){window.__API_DONE=1;window.__API_ERR='onerror'};
        x.ontimeout=function(){window.__API_DONE=1;window.__API_ERR='timeout'};
        x.timeout=20000;x.send()
      }catch(e){window.__API_DONE=1;window.__API_ERR=String(e)}})()
    `)
    for (let i = 0; i < 15; i++) {
      await sleep(1500)
      try {
        const done = await webView.evaluateJavaScript<string>("String(window.__API_DONE)")
        if (done === "2") return await webView.evaluateJavaScript<string>("window.__API_DATA") || ""
        if (done === "1") break
      } catch {}
    }
    try {
      const err = await webView.evaluateJavaScript<string>("window.__API_ERR || ''")
      throw new Error(`WebView XHR 失败: ${err || '请求超时或无响应'}`)
    } catch { throw new Error("WebView XHR 请求失败") }
  } finally { webView.dispose() }
}

async function fetchViaCookie(secUid: string, cursor: number = 0): Promise<{ text: string; status: number; contentType: string }> {
  const cookie = await loadLoginCookie()
  if (!hasLoginSession(cookie)) throw new Error("未获取到登录会话 Cookie，请在设置页重新登录")
  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=web&aid=6383&sec_user_id=${encodeURIComponent(secUid)}&count=21&max_cursor=${cursor}&cookie_enabled=true&platform=web&downlink=10`
  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": MOBILE_UA, "Referer": `https://www.douyin.com/user/${encodeURIComponent(secUid)}`, "Cookie": cookie, "Accept": "application/json, text/plain, */*" },
  })
  const text = await resp.text()
  const contentType = resp.headers.get("content-type") || ""
  if (!resp.ok) {
    throw new Error(`作品接口 HTTP ${resp.status}（${contentType || "类型未知"}，${summarizeResponseBody(text)}）`)
  }
  return { text, status: resp.status, contentType }
}

async function fetchUserPosts(secUid: string, cursor: number = 0): Promise<{ videos: VideoInfo[]; maxCursor: number; hasMore: boolean }> {
  const response = await fetchViaCookie(secUid, cursor)
  return parseAwemeResponse(response.text, response)
}

// ─── 获取用户完整资料 ───
function timeoutFetch<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}

async function fetchUserProfile(secUid: string): Promise<Partial<SavedUser> | null> {
  let result: Partial<SavedUser> = {}
  let shortId = ""

  // 1. 用 sec_uid 调 iesdouyin（基础数据）+ Cookie
  try {
    const cookie = (Storage.get<string>(KEY_COOKIE) || "").trim()
    const headers: Record<string, string> = { "User-Agent": ANDROID_UA, Referer: "https://www.iesdouyin.com/" }
    if (cookie) headers["Cookie"] = cookie
    const url = `https://www.iesdouyin.com/web/api/v2/user/info/?sec_uid=${encodeURIComponent(secUid)}`
    const resp = await fetch(url, { method: "GET", headers })
    if (resp.ok) {
      const data = await resp.json()
      const info = data?.user_info
      if (info && info.sec_uid) {
        result = {
          nickname: info.nickname || "",
          avatar: pickFirstUrl(info.avatar_thumb?.url_list) || pickFirstUrl(info.avatar_larger?.url_list) || "",
          shortId: info.unique_id || "",
          totalFavorited: parseInt(info.total_favorited) || 0,
          followingCount: info.following_count || 0,
          followerCount: info.follower_count || 0,
          signature: info.signature || info.desc || "",
          ipLocation: info.ip_location || info.ip_loc || info.region || "",
          gender: info.gender ?? 0,
        }
      }
    }
  } catch {}
  // 2. 从已保存数据拿 shortId
  if (!shortId) {
    const existing = loadSavedUsers().find((u) => u.id === secUid)
    if (existing?.shortId) shortId = existing.shortId
  }

  // 3. 从作品 API 的 author 提取 unique_id
  if (!shortId) {
    try {
      const response = await timeoutFetch(fetchViaCookie(secUid, 0), 15000)
      const data = JSON.parse(response.text)
      const author = data?.aweme_list?.[0]?.author
      if (author?.unique_id) shortId = author.unique_id
    } catch {}
  }



  // 4. 尝试抖音官方用户资料 API（需要 Cookie）— 补充任何缺失字段
  if (!result.totalFavorited || !result.signature || !result.ipLocation || !result.gender) {
    try {
      const cookie = Storage.get<string>(KEY_COOKIE) || ""
      if (cookie && cookie.length >= 50) {
        const url = `https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=${encodeURIComponent(secUid)}&device_platform=web&aid=6383&cookie_enabled=true&platform=web`
        const resp = await timeoutFetch(fetch(url, {
          method: "GET",
          headers: { "User-Agent": ANDROID_UA, "Cookie": cookie, "Referer": "https://www.douyin.com/" }
        }), 15000)
        if (resp.ok) {
          const data = await resp.json()
          const user = data?.user
          if (user) {
            const avatar = pickFirstUrl(user.avatar_thumb?.url_list) || pickFirstUrl(user.avatar_larger?.url_list) || ""
            result = {
              nickname: user.nickname || result.nickname || "",
              avatar: avatar || result.avatar || "",
              shortId: user.unique_id || result.shortId || "",
              totalFavorited: parseInt(user.total_favorited) || result.totalFavorited || 0,
              followingCount: user.following_count || result.followingCount || 0,
              followerCount: user.follower_count || result.followerCount || 0,
              signature: user.signature || user.desc || result.signature || "",
              ipLocation: user.ip_location || user.ip_loc || user.region || result.ipLocation || "",
              gender: user.gender ?? result.gender ?? 0,
            }
            // 不要 return — 后面还有从 author 数据补 IP 的步骤
          }
        }
      }
    } catch {}
  }

  // 5.5 如果 IP 地区仍为空，尝试从保存的用户数据中提取（不额外请求 API）
  if (!result.ipLocation) {
    // 从已保存的用户列表里找同一个人
    const existing = loadSavedUsers().find((u) => u.id === secUid)
    if (existing?.ipLocation) result.ipLocation = existing.ipLocation
  }

  // 6. 最终回退：直接从 author 数据
  if (!result.totalFavorited) {
    try {
      const response = await timeoutFetch(fetchViaCookie(secUid, 0), 15000)
      const data = JSON.parse(response.text)
      const author = data?.aweme_list?.[0]?.author
      if (author) {
        result = {
          nickname: author.nickname || result.nickname || "",
          avatar: pickFirstUrl(author.avatar_thumb?.url_list) || pickFirstUrl(author.avatar_larger?.url_list) || result.avatar || "",
          shortId: author.unique_id || result.shortId || "",
          totalFavorited: parseInt(author.total_favorited) || result.totalFavorited || 0,
          followingCount: author.following_count || result.followingCount || 0,
          followerCount: author.follower_count || result.followerCount || 0,
          signature: author.signature || result.signature || "",
          ipLocation: author.ip_location || author.ip_loc || author.region || result.ipLocation || "",
          gender: author.gender ?? result.gender ?? 0,
        }
      }
    } catch {}
  }

  return Object.keys(result).length > 0 ? result : null
}


// ─── 切换用户弹窗 ───
function SwitchUserView({ onSwitch, currentUid }: { onSwitch: (uid: string) => void; currentUid: string }) {
  const dismiss = Navigation.useDismiss()
  const users = loadSavedUsers()
  const [switching, setSwitching] = useState(false)

  return (
    <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="systemBackground">
      <NavigationStack>
        <List navigationTitle="切换抖音号">
          {users.length === 0 ? (
            <VStack frame={{ maxWidth: "infinity", height: 300 }} alignment="center" spacing={16}>
              <Image systemName="person.2.slash" font="largeTitle" foregroundStyle="tertiaryLabel" />
              <Text font="title3" bold foregroundStyle="secondaryLabel">还没有保存的抖音号</Text>
              <Text font="callout" foregroundStyle="tertiaryLabel">去「设置」标签页添加</Text>
            </VStack>
          ) : (
            <Section>
              {/* 用网格展示 */}
              <VStack>
                <LazyVGrid columns={[
                  { size: { type: "flexible", min: 80, max: 120 }, spacing: 12 },
                  { size: { type: "flexible", min: 80, max: 120 }, spacing: 12 },
                  { size: { type: "flexible", min: 80, max: 120 }, spacing: 12 },
                ]} spacing={16} padding={16}>
                  {users.map((u) => (
                    <VStack key={u.id} spacing={6} alignment="center" frame={{ maxWidth: "infinity" }} onTapGesture={() => {
                      if (u.id === currentUid) { dismiss(); return }
                      setSwitching(true); saveSecUid(u.id); dismiss(); onSwitch(u.id)
                    }}>
                      {u.avatar ? (
                        <Image imageUrl={u.avatar} resizable scaleToFill frame={{ width: 64, height: 64 }} clipShape={{ type: "rect", cornerRadius: 32 }} />
                      ) : (
                        <VStack frame={{ width: 64, height: 64 }} background="systemGray4" clipShape={{ type: "rect", cornerRadius: 32 }} alignment="center">
                          <Image systemName="person.fill" font="title2" foregroundStyle="secondaryLabel" />
                        </VStack>
                      )}
                      <Text font="caption" lineLimit={1}>{u.nickname || u.id.slice(0, 10)}</Text>
                      {u.id === currentUid ? <Text font="caption2" foregroundStyle="systemBlue">当前</Text> : null}
                    </VStack>
                  ))}
                </LazyVGrid>
              </VStack>
            </Section>
          )}
        </List>
      </NavigationStack>
    </VStack>
  )
}

// ─── Cookie 工具函数 ───

/** 将 Cookie 数组序列化为 HTTP Cookie 字符串 */
function cookiesToString(cookies: { name: string; value: string; domain: string }[]): string {
  // 只保留 douyin.com 域名的 cookie
  const relevant = cookies.filter((c) => c.domain.includes("douyin.com") || c.domain.includes("iesdouyin.com"))
  // 去重（后出现的覆盖前面的同名 cookie）
  const seen = new Map<string, string>()
  for (const c of relevant) {
    seen.set(c.name, c.value)
  }
  return Array.from(seen.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

/** 从 WebView 提取所有 douyin.com Cookie 并保存到 Storage */
async function extractAndSaveCookies(webView: any): Promise<string> {
  const cookies: any[] = await webView.getCookies("https://www.douyin.com/")
  const cookieStr = cookiesToString(cookies)
  if (hasLoginSession(cookieStr)) {
    Storage.set(KEY_COOKIE, cookieStr)
  }
  return cookieStr
}

/** 检查已保存的 Cookie 是否仍然有效（调用抖音简单 API） */
async function checkCookieValidity(): Promise<{ valid: boolean; detail: string }> {
  const cookie = await loadLoginCookie()
  if (!hasLoginSession(cookie)) {
    return { valid: false, detail: "未获取到账号会话 Cookie，请重新登录" }
  }
  try {
    // self profile 能明确区分有效登录（status_code=0 + user）与失效会话（status_code=8）。
    const resp = await fetch(
      "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=web&aid=6383",
      {
        method: "GET",
        headers: {
          "User-Agent": MOBILE_UA,
          "Cookie": cookie,
          "Referer": "https://www.douyin.com/",
          "Accept": "application/json",
        },
      }
    )
    const contentType = resp.headers.get("content-type") || ""
    const text = await resp.text()
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      return {
        valid: false,
        detail: `校验接口未返回 JSON（HTTP ${resp.status}，${contentType || "类型未知"}，${summarizeResponseBody(text)}）`,
      }
    }
    if (!resp.ok) {
      return { valid: false, detail: `校验接口 HTTP ${resp.status}` }
    }
    if (json.status_code === 0 && json.user) {
      return { valid: true, detail: "Cookie 有效" }
    }
    if (json.status_code === 8 || json.status_code === 3 || json.status_code === -99 || String(text).includes("用户未登录")) {
      return { valid: false, detail: "登录会话已过期，请重新登录" }
    }
    return { valid: false, detail: `校验失败: ${json.status_msg || json.status_code || "未返回用户资料"}` }
  } catch (e: any) {
    return { valid: false, detail: `检查失败: ${e.message || e}` }
  }
}

/**
 * 静默刷新 Cookie：打开一个不可见的 WebView，导航到抖音
 * 利用已有的 cookie（非 ephemeral WebView 共享 cookie store）
 * 看能否自动续期 __ac_signature
 */
async function silentRefreshCookie(): Promise<{ ok: boolean; message: string }> {
  const currentCookie = (Storage.get<string>(KEY_COOKIE) || "").trim()
  if (!hasLoginSession(currentCookie)) {
    return { ok: false, message: "未获取到账号会话 Cookie，请重新登录" }
  }
  
  let webView: any = null
  try {
    webView = new WebViewController()
    webView.setCustomUserAgent(MOBILE_UA)
    
    // 先预置现有 Cookie
    const cookiePairs = currentCookie.split(";").map(s => s.trim())
    for (const pair of cookiePairs) {
      const eq = pair.indexOf("=")
      if (eq <= 0) continue
      const name = pair.substring(0, eq)
      const value = pair.substring(eq + 1)
      await webView.setCookie({
        name,
        value,
        domain: ".douyin.com",
        path: "/",
        isSecure: false,
        isHTTPOnly: false,
        isSessionOnly: false,
      })
    }
    
    // 加载抖音首页（cookie 会被自动携带）
    await webView.loadURL("https://www.douyin.com/")
    await webView.waitForLoad()
    await sleep(3000)
    
    // 获取更新后的 cookie
    const allCookies: any[] = await webView.getAllCookies()
    const newCookieStr = cookiesToString(allCookies)
    
    if (hasLoginSession(newCookieStr)) {
      // 检查 __ac_signature 是否更新
      const oldSig = currentCookie.match(/__ac_signature=([^;]+)/)?.[1] || ""
      const newSig = newCookieStr.match(/__ac_signature=([^;]+)/)?.[1] || ""
      
      if (newSig && newSig !== oldSig) {
        // __ac_signature 已更新 — 保存新 cookie
        Storage.set(KEY_COOKIE, newCookieStr)
        return { ok: true, message: "Cookie 已自动刷新" }
      } else if (newSig) {
        return { ok: true, message: "Cookie 仍有效，无需刷新" }
      }
    }
    
    return { ok: false, message: "无法自动刷新，请重新登录" }
  } catch (e: any) {
    return { ok: false, message: `刷新失败: ${e.message || e}` }
  } finally {
    if (webView) webView.dispose()
  }
}

// ─── 抖音 WebView 登录 ───
interface LoginResult { ok: boolean; message: string }

async function clearDouyinWebCookies(webView: WebViewController): Promise<void> {
  const cookies = await webView.getAllCookies()
  for (const cookie of cookies) {
    if (cookie.domain.includes("douyin.com") || cookie.domain.includes("iesdouyin.com")) {
      await webView.deleteCookie(cookie)
    }
  }
  Storage.set(KEY_COOKIE, "")
}

async function clickWebLoginButton(webView: WebViewController): Promise<boolean> {
  try {
    return await webView.evaluateJavaScript<boolean>(`
      return (function () {
        var elements = Array.from(document.querySelectorAll('button, a, div, span'))
        var candidates = elements.filter(function (element) {
          return (element.innerText || '').trim() === '登录'
        })
        var target = candidates.find(function (element) {
          return element.tagName === 'BUTTON' || element.tagName === 'A'
        }) || candidates[0]
        if (!target) return false
        target.click()
        return true
      })()
    `)
  } catch {
    return false
  }
}

/**
 * 使用桌面网页打开完整登录面板。移动 UA 会被抖音重定向到仅含“下载 APP”的精简页。
 * 登录成功后主动关闭当前 WebView，并把 HttpOnly 会话同步到 Storage。
 */
async function presentDouyinLogin(forceFreshLogin: boolean): Promise<LoginResult> {
  const webView = new WebViewController()
  let stopped = false

  try {
    if (forceFreshLogin) await clearDouyinWebCookies(webView)

    webView.setCustomUserAgent(DESKTOP_UA)
    const loaded = await webView.loadURL(
      "https://www.douyin.com/user/self?enter_from=personal_homepage&enter_method=personal_panel&from_tab_name=main"
    )
    if (!loaded) return { ok: false, message: "抖音登录页加载失败" }

    await webView.waitForLoad()
    await sleep(2500)

    const existing = await extractAndSaveCookies(webView)
    if (hasLoginSession(existing) && !forceFreshLogin) {
      return { ok: true, message: "已同步 WebView 登录会话" }
    }

    await clickWebLoginButton(webView)

    // present() 阻塞到页面关闭，因此在旁路轮询 HttpOnly 会话 Cookie。
    const monitor = (async () => {
      for (let i = 0; i < 150 && !stopped; i++) {
        await sleep(2000)
        if (stopped) return
        try {
          const cookie = await extractAndSaveCookies(webView)
          if (hasLoginSession(cookie)) {
            webView.dismiss()
            return
          }
        } catch {}
      }
    })()

    await webView.present({ fullscreen: true, navigationTitle: "登录抖音" })
    stopped = true

    // 用户主动关闭页面时也做最后一次抓取，避免错过刚写入的 Cookie。
    const cookie = await extractAndSaveCookies(webView)
    await monitor
    if (hasLoginSession(cookie)) {
      return { ok: true, message: "登录成功，账号会话已保存" }
    }
    return { ok: false, message: "未检测到登录会话，请完成验证码或扫码确认后再关闭页面" }
  } catch (e: any) {
    return { ok: false, message: `登录失败: ${e?.message || e}` }
  } finally {
    stopped = true
    webView.dispose()
  }
}

async function syncDouyinWebLogin(): Promise<LoginResult> {
  const webView = new WebViewController()
  try {
    const cookie = await extractAndSaveCookies(webView)
    if (!hasLoginSession(cookie)) {
      return { ok: false, message: "WebView 中没有可同步的账号会话" }
    }
    const check = await checkCookieValidity()
    return check.valid
      ? { ok: true, message: "已同步网页登录" }
      : { ok: false, message: check.detail }
  } catch (e: any) {
    return { ok: false, message: `同步失败: ${e?.message || e}` }
  } finally {
    webView.dispose()
  }
}

// ─── 主页 ───
function HomeView({ dismissApp, isActive }: { dismissApp: () => void; isActive: boolean }) {
  const [secUid, setSecUid] = useState(() => loadSecUid())
  const [videos, setVideos] = useState<VideoInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [cursor, setCursor] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [userInfo, setUserInfo] = useState<{ nickname: string; avatar: string }>({ nickname: "", avatar: "" })

  async function doLoadVideos(reset: boolean, uidParam?: string) {
    const targetUid = uidParam || loadSecUid()
    if (!targetUid) { setError("请先设置抖音号"); return }
    const c = reset ? 0 : cursor
    if (reset) { setLoading(true); setVideos([]) } else { setLoadingMore(true) }
    setError("")
    try {
      const result = await fetchUserPosts(targetUid, c)
      if (reset) setVideos(result.videos)
      else setVideos((prev) => {
        const existingIds = new Set(prev.map((video) => video.aweme_id))
        return [...prev, ...result.videos.filter((video) => !existingIds.has(video.aweme_id))]
      })
      setCursor(result.maxCursor)
      setHasMore(result.hasMore)
      if (result.videos.length > 0) {
        const first = result.videos[0]
        const info = { nickname: first.author_nickname, avatar: first.author_avatar }
        setUserInfo(info)
        // 保留已保存用户的已有字段，同时从作品数据提取 IP 地区
        const users = loadSavedUsers()
        const existing = users.find((u) => u.id === targetUid)
        const ipLoc = first.author_ip_location || ""
        if (existing) {
          saveUser({ ...existing, nickname: info.nickname, avatar: info.avatar, ipLocation: ipLoc || existing.ipLocation || "" })
        } else {
          saveUser({ id: targetUid, ...info, savedAt: Date.now(), ipLocation: ipLoc || "" })
        }
      }
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
    }
    if (reset) setLoading(false)
    else setLoadingMore(false)
  }

  useEffect(() => {
    if (!isActive) return
    const activeUid = loadSecUid()
    if (activeUid !== secUid) setSecUid(activeUid)
    doLoadVideos(true, activeUid)
  }, [isActive])

  function handleSwitchUser(uid: string) {
    setSecUid(uid)
    doLoadVideos(true, uid)
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={userInfo.nickname || "抖音作品"}
        toolbar={{
          topBarLeading: <Button title="关闭" action={() => dismissApp()} />,
          topBarTrailing: (
            <HStack spacing={8}>
              <Button title="刷新" action={() => doLoadVideos(true)} disabled={loading} />
              {userInfo.avatar ? (
                <Image
                  imageUrl={userInfo.avatar}
                  resizable scaleToFill
                  frame={{ width: 28, height: 28 }}
                  clipShape={{ type: "rect", cornerRadius: 14 }}
                  onTapGesture={() => {
                    Navigation.present(<SwitchUserView onSwitch={handleSwitchUser} currentUid={secUid} />)
                  }}
                />
              ) : (
                <Image
                  systemName="person.circle"
                  font="title2"
                  foregroundStyle="systemBlue"
                  onTapGesture={() => {
                    Navigation.present(<SwitchUserView onSwitch={handleSwitchUser} currentUid={secUid} />)
                  }}
                />
              )}
            </HStack>
          ),
        }}
      >
        {error ? (
          <Section>
            <VStack padding={{ vertical: 8, horizontal: 4 }} spacing={8} frame={{ maxWidth: "infinity" }}>
              <HStack spacing={6}>
                <Image systemName="exclamationmark.triangle.fill" foregroundStyle="systemRed" font="subheadline" />
                <Text font="subheadline" foregroundStyle="systemRed">{error}</Text>
              </HStack>
              {error.includes("Cookie") || error.includes("__ac_signature") ? (
                <VStack padding={12} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 10 }} spacing={6}>
                  <Text font="caption" bold>💡 建议：</Text>
                  <Text font="caption">在「设置」标签页填入有效的 douyin.com Cookie，可跳过 WebView 直接加载，速度快且稳定。</Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel">获取 Cookie：在 Safari 打开 douyin.com 并登录 → 开发者工具 → 复制 Cookie 字符串</Text>
                </VStack>
              ) : null}
            </VStack>
          </Section>
        ) : null}

        {loading ? (
          <Section>
            <VStack frame={{ maxWidth: "infinity", height: 300 }} alignment="center" spacing={12}>
              <ProgressView />
              <Text font="callout" foregroundStyle="secondaryLabel">加载中...</Text>
            </VStack>
          </Section>
        ) : videos.length === 0 ? (
          <Section>
            <VStack frame={{ maxWidth: "infinity", height: 300 }} alignment="center" spacing={8}>
              <Image systemName="video.slash" font="title" foregroundStyle="tertiaryLabel" />
              <Text font="callout" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>暂无作品</Text>
            </VStack>
          </Section>
        ) : (
          <Section>
            <VStack padding={{ horizontal: 8 }}>
              <LazyVGrid columns={[
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
              ]} spacing={6}>
                {videos.map((v, idx) => (
                    <VStack key={v.aweme_id} spacing={3} onTapGesture={() => openVideo(videos, idx)}>
                      <VStack frame={{ maxWidth: "infinity", height: 200 }} background="systemGray5" clipShape={{ type: "rect", cornerRadius: 8 }}>
                        {v.cover ? <Image imageUrl={v.cover} resizable aspectRatio={{ value: 9/16, contentMode: 'fit' }} frame={{ maxWidth: "infinity", height: 200 }} overlay={{ alignment: "bottom", content: (
                          <VStack padding={3} spacing={3}>
                            <HStack>
                              {v.duration > 0 ? (
                                <HStack padding={{ horizontal: 6, vertical: 2 }} background="black" opacity={0.6} clipShape={{ type: "rect", cornerRadius: 4 }} spacing={3}>
                                  <Image systemName="play.fill" font="caption2" foregroundStyle="white" />
                                  <Text font="caption2" foregroundStyle="white">{formatDuration(v.duration)}</Text>
                                </HStack>
                              ) : null}
                              {v.images.length > 0 ? (
                                <HStack padding={{ horizontal: 6, vertical: 2 }} background="black" opacity={0.6} clipShape={{ type: "rect", cornerRadius: 4 }} spacing={3}>
                                  <Image systemName="photo.on.rectangle" font="caption2" foregroundStyle="white" />
                                  <Text font="caption2" foregroundStyle="white">{v.images.length}</Text>
                                </HStack>
                              ) : null}
                            </HStack>
                            <HStack>
                              <HStack spacing={2}>
                                <Image systemName="heart.fill" font="caption2" foregroundStyle="systemPink" />
                                <Text font="caption2" foregroundStyle="white">{formatCount(v.digg_count)}</Text>
                              </HStack>
                            </HStack>
                          </VStack>
                        )}} />
                      : <VStack frame={{ maxWidth: "infinity", height: 200 }} alignment="center"><Image systemName="play.rectangle" font="largeTitle" foregroundStyle="tertiaryLabel" /></VStack>}
                      </VStack>
                    <Text font="caption2" lineLimit={2} padding={{ horizontal: 2 }}>{v.desc}</Text>
                  </VStack>
                ))}
              </LazyVGrid>
              {hasMore ? (
                <VStack padding={{ vertical: 16 }} frame={{ maxWidth: "infinity" }} alignment="center">
                  {loadingMore ? (
                    <HStack spacing={8}><ProgressView /><Text font="caption" foregroundStyle="secondaryLabel">加载更多...</Text></HStack>
                  ) : (
                    <Button action={() => doLoadVideos(false)}>
                      <HStack padding={{ horizontal: 20, vertical: 10 }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 8 }} spacing={6}>
                        <Image systemName="arrow.down.circle" font="caption" />
                        <Text font="subheadline">加载更多</Text>
                      </HStack>
                    </Button>
                  )}
                </VStack>
              ) : videos.length > 0 ? (
                <VStack padding={{ vertical: 16 }} frame={{ maxWidth: "infinity" }} alignment="center">
                  <Text font="caption" foregroundStyle="tertiaryLabel">已加载全部作品</Text>
                </VStack>
              ) : null}
            </VStack>
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}

function HistoryItemCard({ item, idx, history, setHistory }: { item: HistoryItem; idx: number; history: HistoryItem[]; setHistory: (h: HistoryItem[]) => void }) {
  const onPlay = () => openVideo(history, idx)
  const onDelete = () => { const u = history.filter((h) => h.aweme_id !== item.aweme_id); saveHistory(u); setHistory(u) }
  return (
    <VStack spacing={3}>
      <VStack frame={{ maxWidth: "infinity", height: 200 }} background="systemGray5" clipShape={{ type: "rect", cornerRadius: 8 }}>
        {item.cover ? (
          <Image imageUrl={item.cover} resizable aspectRatio={{ value: 9/16, contentMode: 'fit' }} frame={{ maxWidth: "infinity", height: 200 }} overlay={{ alignment: "bottomTrailing", content: (
            <VStack onTapGesture={onDelete} padding={4}>
              <Image systemName="xmark.circle.fill" font="title3" foregroundStyle="white" />
            </VStack>
          )}} onTapGesture={onPlay} />
        ) : (
          <VStack frame={{ maxWidth: "infinity", height: 200 }} alignment="center" onTapGesture={onPlay}><Image systemName="play.rectangle" font="largeTitle" foregroundStyle="tertiaryLabel" /></VStack>
        )}
      </VStack>
      <Text font="caption2" lineLimit={2} padding={{ horizontal: 2 }}>{item.desc}</Text>
      <Text font="caption2" foregroundStyle="tertiaryLabel" padding={{ horizontal: 2 }}>{new Date(item.viewed_at).toLocaleDateString("zh-CN")}</Text>
    </VStack>
  )
}

// ─── 历史 ───
function HistoryView({ dismissApp, isActive }: { dismissApp: () => void; isActive: boolean }) {
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  useEffect(() => {
    if (!isActive) return
    setHistory(loadHistory())
  }, [isActive])

  return (
    <NavigationStack>
      <List
        navigationTitle="观看历史"
        toolbar={{
          topBarLeading: <Button title="关闭" action={() => dismissApp()} />,
          topBarTrailing: history.length > 0 ? (
            <Button title="清空" action={() => { saveHistory([]); setHistory([]) }} />
          ) : undefined,
        }}
      >
        {history.length === 0 ? (
          <Section>
            <VStack frame={{ maxWidth: "infinity", height: 300 }} alignment="center" spacing={12}>
              <Image systemName="clock.badge.questionmark" font="largeTitle" foregroundStyle="tertiaryLabel" />
              <Text font="title3" bold foregroundStyle="secondaryLabel">暂无观看历史</Text>
              <Text font="callout" foregroundStyle="tertiaryLabel">在主页点击任意作品后自动记录</Text>
            </VStack>
          </Section>
        ) : (
          <Section>
            <VStack padding={{ horizontal: 8 }}>
              <LazyVGrid columns={[
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
                { size: { type: "flexible", min: 100, max: 200 }, spacing: 6 },
              ]} spacing={6}>
                {history.map((item, idx) => (
                  <HistoryItemCard item={item} idx={idx} history={history} setHistory={setHistory} />
                ))}
              </LazyVGrid>
            </VStack>
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}

// ─── 设置 ───
function SettingsView({ isActive }: { isActive: boolean }) {
  const [inputValue, setInputValue] = useState("")
  const [cookieValue, setCookieValue] = useState(() => {
    const saved = Storage.get<string>(KEY_COOKIE) || ""
    return saved.length >= 50 ? "" : saved
  })
  const [isCookieSaved, setIsCookieSaved] = useState(() => {
    const saved = (Storage.get<string>(KEY_COOKIE) || "").trim()
    return hasLoginSession(saved)
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: string; text: string }>({ type: "", text: "" })
  const [cookieStatus, setCookieStatus] = useState<{ checking: boolean; valid: boolean; detail: string }>({ checking: true, valid: false, detail: "检查中..." })
  const [refreshing, setRefreshing] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [syncingLogin, setSyncingLogin] = useState(false)
  const [showManualCookie, setShowManualCookie] = useState(false)
  const [savedInfo, setSavedInfo] = useState<SavedUser | null>(() => loadCurrentSavedUser())
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>(() => loadSavedUsers())
  const [currentUid, setCurrentUid] = useState(() => loadSecUid())

  function refreshSavedUsers() {
    const users = loadSavedUsers()
    setSavedUsers(users)
    const uid = loadSecUid()
    setCurrentUid(uid)
    if (uid) {
      const users = loadSavedUsers(); const found = users.find((u) => u.id === uid)
      if (found) {
        setSavedInfo(found)
        // 缺资料时异步获取
        if (!found.totalFavorited || !found.shortId || !found.signature || !found.ipLocation) {
          fetchUserProfile(uid).then((profile) => {
            if (profile) {
              const all = loadSavedUsers().map((u) => u.id === uid ? {
                ...u,
                ...(profile.nickname ? { nickname: profile.nickname } : {}),
                ...(profile.avatar ? { avatar: profile.avatar } : {}),
                ...(profile.shortId ? { shortId: profile.shortId } : {}),
                ...(profile.totalFavorited ? { totalFavorited: profile.totalFavorited } : {}),
                ...(profile.followingCount ? { followingCount: profile.followingCount } : {}),
                ...(profile.followerCount ? { followerCount: profile.followerCount } : {}),
                ...(profile.signature ? { signature: profile.signature } : {}),
                ...(profile.ipLocation ? { ipLocation: profile.ipLocation } : {}),
                ...(profile.gender ? { gender: profile.gender } : {}),
                id: u.id, savedAt: u.savedAt,
              } : u)
              Storage.set(KEY_SAVED_USERS, JSON.stringify(all))
          const newUsers = loadSavedUsers()
              setSavedUsers(newUsers)
              const updated = newUsers.find((u) => u.id === uid)
              if (updated && loadSecUid() === uid) setSavedInfo(updated)
            }
          }).catch(() => {})
        }
      }
      else {
        const placeholder: SavedUser = { id: uid, nickname: "", avatar: "", savedAt: Date.now() }
        setSavedInfo(placeholder)
        fetchUserProfile(uid).then((profile) => {
          if (!profile || loadSecUid() !== uid) return
          const user: SavedUser = {
            ...placeholder,
            ...profile,
            id: uid,
            savedAt: placeholder.savedAt,
            nickname: profile.nickname || "",
            avatar: profile.avatar || "",
          }
          saveUser(user)
          const newUsers = loadSavedUsers()
          setSavedUsers(newUsers)
          if (loadSecUid() === uid) setSavedInfo(newUsers.find((u) => u.id === uid) || user)
        }).catch(() => {})
      }
    } else { setSavedInfo(null) }
  }

  useEffect(() => {
    if (isActive) refreshSavedUsers()
  }, [isActive])

  // 检查 Cookie 状态
  useEffect(() => {
    ;(async () => {
      const result = await checkCookieValidity()
      setCookieStatus({ checking: false, valid: result.valid, detail: result.detail })
      setIsCookieSaved(result.valid)
    })()
  }, [])

  async function refreshCookieStatus(message?: string) {
    setCookieStatus({ checking: true, valid: false, detail: message || "检查中..." })
    const result = await checkCookieValidity()
    setCookieStatus({ checking: false, valid: result.valid, detail: result.detail })
    setIsCookieSaved(result.valid)
    if (result.valid) refreshSavedUsers()
    return result
  }

  async function handleLogin() {
    if (loginBusy) return
    setLoginBusy(true)
    setCookieStatus({ checking: true, valid: false, detail: "正在打开完整登录页..." })
    const result = await presentDouyinLogin(true)
    setLoginBusy(false)
    if (!result.ok) {
      setCookieStatus({ checking: false, valid: false, detail: result.message })
      setIsCookieSaved(false)
      return
    }
    await refreshCookieStatus("正在验证新会话...")
  }

  async function handleSyncLogin() {
    if (syncingLogin) return
    setSyncingLogin(true)
    setCookieStatus({ checking: true, valid: false, detail: "正在同步 WebView 会话..." })
    const result = await syncDouyinWebLogin()
    setSyncingLogin(false)
    if (!result.ok) {
      setCookieStatus({ checking: false, valid: false, detail: result.message })
      setIsCookieSaved(false)
      return
    }
    await refreshCookieStatus("正在验证同步结果...")
  }

  async function handleRefresh() {
    setRefreshing(true)
    const result = await silentRefreshCookie()
    setRefreshing(false)
    if (result.ok) {
      setTimeout(async () => {
        const check = await checkCookieValidity()
        setCookieStatus({ checking: false, valid: check.valid, detail: check.detail })
        setIsCookieSaved(check.valid)
      }, 500)
    } else {
      setCookieStatus({ checking: false, valid: false, detail: result.message })
    }
  }

  async function handleSave() {
    const t = inputValue.trim()
    if (!t) { setStatus({ type: "error", text: "请输入抖音号" }); return }
    setSaving(true); setStatus({ type: "", text: "" })
    try {
      const r = await resolveSecUid(t)
      if (r.error) { setStatus({ type: "error", text: r.error }); setSaving(false); return }
      saveSecUid(r.secUid)
      let nn = r.nickname || ""; let av = r.avatar || ""
      let fullUser: SavedUser = {
        id: r.secUid, nickname: nn, avatar: av, savedAt: Date.now(),
        shortId: r.shortId || "", totalFavorited: r.totalFavorited || 0,
        followingCount: r.followingCount || 0, followerCount: r.followerCount || 0,
        signature: r.signature || "", ipLocation: r.ipLocation || "", gender: r.gender ?? 0,
      }
      if (!nn) {
        try { const posts = await fetchUserPosts(r.secUid, 0); if (posts.videos.length > 0) { const p = posts.videos[0]; nn = p.author_nickname; av = p.author_avatar; fullUser.nickname = nn; fullUser.avatar = av } } catch { /* ignore */ }
      }
      // 异步补充资料：不阻塞保存
      fetchUserProfile(r.secUid).then((profile) => {
        if (profile) {
          const all = loadSavedUsers().map((u) => u.id === r.secUid ? {
            ...u,
            ...(profile.nickname ? { nickname: profile.nickname } : {}),
            ...(profile.avatar ? { avatar: profile.avatar } : {}),
            ...(profile.shortId ? { shortId: profile.shortId } : {}),
            ...(profile.totalFavorited ? { totalFavorited: profile.totalFavorited } : {}),
            ...(profile.followingCount ? { followingCount: profile.followingCount } : {}),
            ...(profile.followerCount ? { followerCount: profile.followerCount } : {}),
            ...(profile.signature ? { signature: profile.signature } : {}),
            ...(profile.ipLocation ? { ipLocation: profile.ipLocation } : {}),
            ...(profile.gender ? { gender: profile.gender } : {}),
            id: u.id, savedAt: u.savedAt,
          } : u)
          Storage.set(KEY_SAVED_USERS, JSON.stringify(all))
          setSavedUsers(loadSavedUsers())
          const updated = loadSavedUsers().find((x) => x.id === r.secUid)
          if (updated) setSavedInfo(updated)
        }
      }).catch(() => {})
      saveUser(fullUser)
      setSavedInfo(fullUser); setInputValue("")
      refreshSavedUsers()
    } catch (e) { setStatus({ type: "error", text: (e as Error).message }) }
    setSaving(false)
  }

  return (
    <NavigationStack>
      <List navigationTitle="设置">
        <Section>
          <VStack padding={16} spacing={12} frame={{ maxWidth: "infinity" }}>
            <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
              <Text font="headline" bold>当前用户</Text>
              <Spacer />
              {savedInfo ? (
                <Image systemName="arrow.clockwise" font="headline" foregroundStyle="systemBlue" onTapGesture={() => {
                  const uid = loadSecUid()
                  if (uid) {
                    fetchUserProfile(uid).then((profile) => {
                      if (profile) {
                        const all = loadSavedUsers().map((u) => u.id === uid ? {
                          ...u,
                          ...(profile.nickname ? { nickname: profile.nickname } : {}),
                          ...(profile.avatar ? { avatar: profile.avatar } : {}),
                          ...(profile.shortId ? { shortId: profile.shortId } : {}),
                          ...(profile.totalFavorited ? { totalFavorited: profile.totalFavorited } : {}),
                          ...(profile.followingCount ? { followingCount: profile.followingCount } : {}),
                          ...(profile.followerCount ? { followerCount: profile.followerCount } : {}),
                          ...(profile.signature ? { signature: profile.signature } : {}),
                          ...(profile.ipLocation ? { ipLocation: profile.ipLocation } : {}),
                          ...(profile.gender ? { gender: profile.gender } : {}),
                          id: u.id, savedAt: u.savedAt,
                        } : u)
                        Storage.set(KEY_SAVED_USERS, JSON.stringify(all))
                        const newUsers = loadSavedUsers()
                        setSavedUsers(newUsers)
                        const updated = newUsers.find((x) => x.id === uid)
                        if (updated) setSavedInfo(updated)
                      }
                    }).catch(() => {})
                  }
                }} />
              ) : null}
            </HStack>
            {savedInfo ? (
              <VStack spacing={12} frame={{ maxWidth: "infinity" }}>
                <HStack spacing={12}>
                  {savedInfo.avatar ? <Image imageUrl={savedInfo.avatar} resizable scaleToFill frame={{ width: 56, height: 56 }} clipShape={{ type: "rect", cornerRadius: 28 }} /> : <VStack frame={{ width: 56, height: 56 }} background="systemGray4" clipShape={{ type: "rect", cornerRadius: 28 }} alignment="center"><Image systemName="person.fill" font="title2" foregroundStyle="tertiaryLabel" /></VStack>}
                  <VStack spacing={2} alignment="leading">
                    <Text font="title3" bold>{savedInfo.nickname || "抖音用户"}</Text>
                    {savedInfo.shortId ? <Text font="subheadline" foregroundStyle="secondaryLabel">抖音号: {savedInfo.shortId}</Text> : null}
                  </VStack>
                </HStack>
                {(savedInfo.totalFavorited || savedInfo.followingCount || savedInfo.followerCount) ? (
                  <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
                    <VStack frame={{ maxWidth: "infinity" }} alignment="center" spacing={2}>
                      <Text font="headline" bold>{formatCount(savedInfo.totalFavorited || 0)}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel">获赞</Text>
                    </VStack>
                    <VStack frame={{ maxWidth: "infinity" }} alignment="center" spacing={2}>
                      <Text font="headline" bold>{formatCount(savedInfo.followingCount || 0)}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel">关注</Text>
                    </VStack>
                    <VStack frame={{ maxWidth: "infinity" }} alignment="center" spacing={2}>
                      <Text font="headline" bold>{formatCount(savedInfo.followerCount || 0)}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel">粉丝</Text>
                    </VStack>
                  </HStack>
                ) : null}
                {savedInfo.signature ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={3}>{savedInfo.signature}</Text> : null}
                {(savedInfo.ipLocation || savedInfo.gender) ? (
                  <HStack spacing={16}>
                    {savedInfo.ipLocation ? <HStack spacing={4}><Image systemName="location.fill" font="caption" foregroundStyle="tertiaryLabel" /><Text font="caption" foregroundStyle="tertiaryLabel">{savedInfo.ipLocation}</Text></HStack> : null}
                    {savedInfo.gender === 1 ? <Text font="caption" foregroundStyle="tertiaryLabel">♂ 男</Text> : savedInfo.gender === 2 ? <Text font="caption" foregroundStyle="tertiaryLabel">♀ 女</Text> : null}
                  </HStack>
                ) : null}
              </VStack>
            ) : (
              <Text foregroundStyle="secondaryLabel">尚未设置</Text>
            )}
          </VStack>
        </Section>

        <Section title="添加/修改抖音号">
          <TextField
            title="抖音号"
            prompt="粘贴抖音号 / 链接 / sec_uid"
            value={inputValue}
            onChanged={(val: string) => setInputValue(val)}
          />
          <Button
            title={saving ? "解析中..." : "保存"}
            action={handleSave}
            disabled={saving || !inputValue.trim()}
          />
          {status.text ? (
            <Text font="caption" foregroundStyle={status.type === "error" ? "systemRed" : "systemGreen"}>
              {status.text}
            </Text>
          ) : null}
        </Section>

        <Section title="抖音登录">
          <VStack padding={12} spacing={12} frame={{ maxWidth: "infinity" }}>
            {/* Cookie 状态指示器 */}
            <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
              {cookieStatus.checking ? (
                <ProgressView foregroundStyle="systemBlue" />
              ) : (
                <Image 
                  systemName={cookieStatus.valid ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"} 
                  foregroundStyle={cookieStatus.valid ? "systemGreen" : "systemOrange"} 
                  font="body" 
                />
              )}
              <VStack spacing={0}>
                <Text font="body" bold>{cookieStatus.checking ? "正在检查..." : (cookieStatus.valid ? "已登录" : "未登录")}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">{cookieStatus.checking ? "" : cookieStatus.detail}</Text>
              </VStack>
              <Spacer />
            </HStack>
            
            {/* 登录操作 */}
            <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
              <Button
                title={loginBusy ? "登录页已打开" : (cookieStatus.valid ? "清除会话并重新登录" : "打开抖音登录")}
                action={handleLogin}
                disabled={loginBusy || syncingLogin}
                frame={{ maxWidth: "infinity" }}
              />
              <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
                <Button
                  title={syncingLogin ? "同步中..." : "同步网页登录"}
                  action={handleSyncLogin}
                  disabled={loginBusy || syncingLogin}
                  frame={{ maxWidth: "infinity" }}
                />
                {cookieStatus.valid && (
                  <Button
                    title={refreshing ? "刷新中..." : "刷新 Cookie"}
                    action={handleRefresh}
                    disabled={refreshing || loginBusy}
                    frame={{ maxWidth: "infinity" }}
                  />
                )}
              </HStack>
            </VStack>
            
            {/* 手动 Cookie 编辑（高级） */}
            <HStack spacing={4}>
              <Text font="caption" foregroundStyle="tertiaryLabel" onTapGesture={() => setShowManualCookie(!showManualCookie)}>
                {showManualCookie ? "收起手动输入" : "手动配置 Cookie（高级）"}
              </Text>
            </HStack>
            
            {showManualCookie && (
              <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
                {isCookieSaved ? (
                  <HStack spacing={8} padding={{ vertical: 8 }}>
                    <Image systemName="checkmark.circle.fill" foregroundStyle="systemGreen" font="body" />
                    <Text font="body" foregroundStyle="systemGreen">Cookie 已保存 ✓</Text>
                    <Spacer />
                    <Button title="清除 Cookie" action={() => {
                      Storage.set(KEY_COOKIE, "")
                      setIsCookieSaved(false)
                      setCookieValue("")
                      setCookieStatus({ checking: false, valid: false, detail: "已清除" })
                    }} />
                  </HStack>
                ) : (
                  <>
                    <TextField
                      title="Cookie"
                      prompt="粘贴 douyin.com Cookie"
                      value={cookieValue}
                      onChanged={(val: string) => setCookieValue(val)}
                    />
                    <HStack spacing={8} padding={{ top: 4 }}>
                      <Spacer />
                      <Button title="保存 Cookie" action={() => {
                        Storage.set(KEY_COOKIE, cookieValue.trim())
                        setCookieValue("")
                        setIsCookieSaved(true)
                        setCookieStatus({ checking: true, valid: false, detail: "检查中..." })
                        setTimeout(async () => {
                          const result = await checkCookieValidity()
                          setCookieStatus({ checking: false, valid: result.valid, detail: result.detail })
                          setIsCookieSaved(result.valid)
                        }, 1000)
                      }} disabled={!cookieValue.trim()} />
                    </HStack>
                  </>
                )}
              </VStack>
            )}
          </VStack>
        </Section>

        <Section title={`已保存用户（${savedUsers.length}）`}>
          {savedUsers.length === 0 ? (
            <Text font="caption" foregroundStyle="secondaryLabel">暂无已保存的用户</Text>
          ) : (
            savedUsers.map((u) => (
              <HStack key={u.id} spacing={12} padding={{ vertical: 8, leading: 0, trailing: 0 }}>
                <HStack spacing={12} frame={{ maxWidth: "infinity" }} onTapGesture={() => {
                  if (u.id !== currentUid) { saveSecUid(u.id); refreshSavedUsers() }
                }}>
                  {u.avatar ? <Image imageUrl={u.avatar} resizable scaleToFill frame={{ width: 36, height: 36 }} clipShape={{ type: "rect", cornerRadius: 18 }} /> : <VStack frame={{ width: 36, height: 36 }} background="systemGray4" clipShape={{ type: "rect", cornerRadius: 18 }} alignment="center"><Image systemName="person.fill" font="caption" foregroundStyle="tertiaryLabel" /></VStack>}
                  <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
                    <Text font="subheadline">{u.nickname || "未命名"}</Text>
                  </VStack>
                  {u.id === currentUid ? (
                    <Text font="caption" foregroundStyle="systemBlue">当前</Text>
                  ) : null}
                </HStack>
                <Text font="caption" foregroundStyle="systemRed" padding={{ leading: 8, trailing: 4 }} onTapGesture={() => {
                  const users = loadSavedUsers().filter((x) => x.id !== u.id)
                  Storage.set(KEY_SAVED_USERS, JSON.stringify(users))
                  refreshSavedUsers()
                }}>删除</Text>
              </HStack>
            ))
          )}
        </Section>
      </List>
    </NavigationStack>
  )
}

// ─── 主入口 ───
function App() {
  const dismiss = Navigation.useDismiss()
  const [tabIndex, setTabIndex] = useState(0)

  return (
    <TabView tabIndex={tabIndex} onTabIndexChanged={setTabIndex}>
      <Tab title="作品" systemImage="rectangle.grid.2x2" value={0}>
        <HomeView dismissApp={() => dismiss()} isActive={tabIndex === 0} />
      </Tab>
      <Tab title="历史" systemImage="clock" value={1}>
        <HistoryView dismissApp={() => dismiss()} isActive={tabIndex === 1} />
      </Tab>
      <Tab title="设置" systemImage="gear" value={2}>
        <SettingsView isActive={tabIndex === 2} />
      </Tab>
    </TabView>
  )
}

async function run() {
  try {
    await Navigation.present({
      element: <App />,
      modalPresentationStyle: 'overFullScreen',
    })
  } finally {
    Script.exit()
  }
}

run()
