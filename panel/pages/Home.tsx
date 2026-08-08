import {
  List, Section, Text, HStack, VStack, Image, Spacer, NavigationLink,
  Button, Widget, useState, ZStack, Color,
} from "scripting"
import AnniversaryList from "./AnniversaryList"
import ShortcutList from "./ShortcutList"
import StatusSettings from "./StatusSettings"
import Appearance from "./Appearance"
import WeatherSettings from "./WeatherSettings"
import { fetchWeather } from "../util/weather"
import { loadSettings } from "../util/store"

export default function Home() {
  const [refreshing, setRefreshing] = useState(false)
  const [hint, setHint] = useState<string>("")

  async function refreshAll() {
    if (refreshing) return
    setRefreshing(true)
    setHint("正在刷新…")
    try {
      const settings = loadSettings()
      if (settings.showWeather && settings.weather.enabled) {
        await fetchWeather(true)
      }
      Widget.reloadAll()
      setHint("已刷新 ✓")
    } catch (e: any) {
      setHint(`刷新失败：${e?.message ?? e}`)
    } finally {
      setRefreshing(false)
      setTimeout(() => setHint(""), 2500)
    }
  }

  return (
    <List
      navigationTitle="仪表面板"
      navigationBarTitleDisplayMode="large"
      toolbar={{
        confirmationAction: (
          <Button action={refreshAll} disabled={refreshing}>
            <Image systemName={refreshing ? "hourglass" : "arrow.clockwise"} />
          </Button>
        ),
      }}
    >
      {!!hint && (
        <Section>
          <HStack spacing={8}>
            <Image systemName="info.circle" foregroundStyle="systemBlue" />
            <Text font={13}>{hint}</Text>
          </HStack>
        </Section>
      )}

      <Section
        header={<Text>组件内容</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            纪念日支持「已经在一起 X 天」/「距离 X 还有 X 天」两种模式；
            快捷入口最多 3 行 × 5 个，支持从 App Store 抓真实图标；
            状态项可显示并可点击跳转系统设置面板。
          </Text>
        }
      >
        <NavigationLink destination={<AnniversaryList />}>
          <Row icon="heart.fill" color="systemPink" title="纪念日 / 倒计时" subtitle="管理纪念日卡片" />
        </NavigationLink>
        <NavigationLink destination={<ShortcutList />}>
          <Row icon="square.grid.3x3.fill" color="systemBlue" title="快捷入口" subtitle="App 圆形入口与排序" />
        </NavigationLink>
        <NavigationLink destination={<StatusSettings />}>
          <Row icon="dot.radiowaves.left.and.right" color="systemGreen" title="状态项" subtitle="Wi-Fi / 蜂窝 / 电池" />
        </NavigationLink>
        <NavigationLink destination={<WeatherSettings />}>
          <Row icon="cloud.sun.fill" color="systemTeal" title="天气" subtitle="自动定位 / 手动指定城市" />
        </NavigationLink>
        <NavigationLink destination={<Appearance />}>
          <Row icon="paintpalette.fill" color="systemPurple" title="外观" subtitle="主题、强调色、背景渐变" />
        </NavigationLink>
      </Section>

      <Section header={<Text>使用说明</Text>}>
        <VStack alignment="leading" spacing={6} padding={{ top: 4, bottom: 4 }}>
          <Text font={13}>1. 添加桌面小组件，选择本脚本，支持 小/中/大 三种尺寸</Text>
          <Text font={13}>2. 在 App 内编辑内容后，组件会自动刷新</Text>
          <Text font={13}>3. 状态格点击会跳到系统对应设置（受系统限制）</Text>
          <Text font={13}>4. iOS 限制：仅展示 Wi-Fi / 蜂窝 / 电池等可读状态，蓝牙/隔空/专注无法读取已隐藏</Text>
          <Text font={13}>5. 右上角「↻」可强制刷新天气并重载所有 widget</Text>
        </VStack>
      </Section>
    </List>
  )
}

function Row({
  icon, color, title, subtitle,
}: { icon: string; color: Color; title: string; subtitle: string }) {
  return (
    <HStack spacing={12}>
      <ZStack
        frame={{ width: 32, height: 32 }}
        background={color}
        clipShape={{ type: "rect", cornerRadius: 8 }}
      >
        <Image
          systemName={icon}
          font={18}
          foregroundStyle="white"
        />
      </ZStack>
      <VStack alignment="leading" spacing={2}>
        <Text fontWeight="semibold">{title}</Text>
        <Text font={11} foregroundStyle="secondaryLabel">{subtitle}</Text>
      </VStack>
      <Spacer />
    </HStack>
  )
}
