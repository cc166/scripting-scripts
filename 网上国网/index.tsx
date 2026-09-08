import {
  Widget,
  Navigation,
  NavigationStack,
  List,
  Section,
  Text,
  TextField,
  Picker,
  Button,
  HStack,
  Spacer,
  Stepper,
  ColorPicker,
  Toggle,
  useState,
  Script
} from "scripting"
import {
  clearDataCache,
  DEFAULT_SETTINGS,
  getCacheInfo,
  getElectricityData,
  getSettings,
  resetSettings,
  saveSettings,
  SGCCSettings,
  MetricKey,
  RowDisplayMode
} from "./api"

/** 行显示模式选项 */
const ROW_MODES: { value: RowDisplayMode; label: string }[] = [
  { value: 'group1', label: '组合一' },
  { value: 'group2', label: '组合二' },
  { value: 'group3', label: '组合三' },
  { value: 'step', label: '阶梯电量' }
]

/** 指标项选项 */
const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: 'monthFee', label: '上期电费' },
  { value: 'monthUsage', label: '上月电量' },
  { value: 'yearFee', label: '年度电费' },
  { value: 'yearUsage', label: '年度电量' },
  { value: 'currentMonthEle', label: '本月电量' },
  { value: 'dayFee', label: '近日用电' },
  { value: 'remainFee', label: '电费余额' },
  { value: 'dayChart', label: '日用电图表' },
  { value: 'none', label: '不显示' }
]

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const initial = getSettings()
  const cacheInfo = getCacheInfo()

  const [settings, setSettings] = useState<SGCCSettings>(initial)
  const [oneLevelPq, setOneLevelPq] = useState(String(initial.oneLevelPq))
  const [twoLevelPq, setTwoLevelPq] = useState(String(initial.twoLevelPq))
  const [cacheStatus, setCacheStatus] = useState(
    cacheInfo.hasCache
      ? `已获取 ${cacheInfo.accountCount} 个账户`
      : "暂无账户缓存"
  )

  const applySettings = (patch: Partial<SGCCSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }

  const saveThresholds = () => {
    const first = Math.max(1, Number(oneLevelPq) || DEFAULT_SETTINGS.oneLevelPq)
    const second = Math.max(first + 1, Number(twoLevelPq) || DEFAULT_SETTINGS.twoLevelPq)
    setOneLevelPq(String(first))
    setTwoLevelPq(String(second))
    applySettings({ oneLevelPq: first, twoLevelPq: second })
  }

  const close = () => {
    saveThresholds()
    Widget.reloadAll()
    dismiss()
  }

  const preview = async () => {
    saveThresholds()
    const options: Record<string, string> = {
      "真实数据": JSON.stringify({ accountIndex: 0, demo: false }),
      "演示数据": JSON.stringify({ accountIndex: 0, demo: true })
    }
    await Widget.preview({
      family: "systemMedium",
      parameters: {
        options,
        default: "真实数据"
      }
    })
  }

  const refreshAccounts = async () => {
    setCacheStatus("正在获取账户列表…")
    const result = await getElectricityData(true)
    const count = Array.isArray(result.data) ? result.data.length : 0
    setCacheStatus(count > 0 ? `已获取 ${count} 个账户` : "未获取到账户，请检查重写与网络")
    Widget.reloadAll()
  }

  const clearCache = async () => {
    clearDataCache()
    setCacheStatus("缓存已清除，下次组件刷新会重新获取")
    Widget.reloadAll()
    await Dialog.alert({
      title: "缓存已清除",
      message: "账户设置仍然保留，下次刷新会重新请求网上国网数据。",
      buttonLabel: "好"
    })
  }

  const restoreDefaults = async () => {
    const defaults = resetSettings()
    setSettings(defaults)
    setOneLevelPq(String(defaults.oneLevelPq))
    setTwoLevelPq(String(defaults.twoLevelPq))
    Widget.reloadAll()
    await Dialog.alert({
      title: "已恢复默认设置",
      message: "缓存数据未删除。",
      buttonLabel: "好"
    })
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="国家电网"
        navigationBarTitleDisplayMode="inline"
        preferredColorScheme={settings.themeMode === "system" ? undefined : settings.themeMode}
        toolbar={{
          cancellationAction: <Button title="关闭" action={close} />
        }}
      >
        <Section footer={<Text>多户时在小组件参数中填写 0、1、2……选择账户。</Text>}>
          <HStack>
            <Text>{cacheStatus}</Text>
            <Spacer />
            <Button title="获取账户列表" action={refreshAccounts} />
          </HStack>
        </Section>

        <Section
          header={<Text>显示</Text>}
          footer={<Text>柱状图展示最近若干天的用电量；按月计算时，阶梯进度以本月累计用电量为基准。</Text>}
        >
          <Toggle
            title="显示户名"
            value={settings.showAccountName}
            onChanged={(value) => applySettings({ showAccountName: value })}
          />

          <Stepper
            onIncrement={() => applySettings({ barCount: Math.min(30, settings.barCount + 1) })}
            onDecrement={() => applySettings({ barCount: Math.max(3, settings.barCount - 1) })}
          >
            <HStack>
              <Text>柱状图天数</Text>
              <Spacer />
              <Text foregroundStyle={settings.themeColor as any}>{settings.barCount} 天</Text>
            </HStack>
          </Stepper>

          <Picker
            title="阶梯累计方式"
            value={settings.stepCalculation}
            onChanged={(value: string) => applySettings({ stepCalculation: value as SGCCSettings["stepCalculation"] })}
            pickerStyle="segmented"
          >
            <Text tag="year">按年累计</Text>
            <Text tag="month">按月计算</Text>
          </Picker>

          <ColorPicker
            title="柱状图颜色"
            value={settings.chartColor as any}
            onChanged={(value) => applySettings({ chartColor: value as string })}
            supportsOpacity={false}
          />

          <ColorPicker
            title="主题色"
            value={settings.themeColor as any}
            onChanged={(value) => applySettings({ themeColor: value as string })}
            supportsOpacity={false}
          />

          <Picker
            title="组件主题"
            value={settings.themeMode}
            onChanged={(value: string) => applySettings({ themeMode: value as SGCCSettings["themeMode"] })}
            pickerStyle="menu"
          >
            <Text tag="system">跟随系统</Text>
            <Text tag="light">浅色</Text>
            <Text tag="dark">深色</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>三栏模式</Text>}
          footer={<Text>中号组件右侧三栏：每栏可选「组合一/二/三」或「阶梯电量」。组合内容在下方配置。</Text>}
        >
          {([1, 2, 3] as const).map((rowNum) => {
            const key = rowNum === 1 ? 'row1Display' : rowNum === 2 ? 'row2Display' : 'row3Display'
            return (
              <Picker
                key={key}
                title={rowNum === 1 ? '第一栏' : rowNum === 2 ? '第二栏' : '第三栏'}
                value={settings[key]}
                onChanged={(value: string) => applySettings({ [key]: value as RowDisplayMode } as Partial<SGCCSettings>)}
                pickerStyle="menu"
              >
                {ROW_MODES.map((m) => (
                  <Text key={m.value} tag={m.value}>{m.label}</Text>
                ))}
              </Picker>
            )
          })}
        </Section>

        <Section
          header={<Text>组合内容</Text>}
          footer={<Text>为组合一/二/三配置左右栏内容，可选 9 种指标。</Text>}
        >
          {([1, 2, 3] as const).flatMap((gn) => {
            const leftKey = `group${gn}Left` as 'group1Left'
            const rightKey = `group${gn}Right` as 'group1Right'
            return [
              <Picker
                key={`g${gn}l`}
                title={`组合${['一','二','三'][gn-1]} · 左栏`}
                value={settings[leftKey as keyof SGCCSettings] as string}
                onChanged={(value: string) => applySettings({ [leftKey]: value as MetricKey } as Partial<SGCCSettings>)}
                pickerStyle="menu"
              >
                {METRIC_OPTIONS.map((o) => (
                  <Text key={o.value} tag={o.value}>{o.label}</Text>
                ))}
              </Picker>,
              <Picker
                key={`g${gn}r`}
                title={`组合${['一','二','三'][gn-1]} · 右栏`}
                value={settings[rightKey as keyof SGCCSettings] as string}
                onChanged={(value: string) => applySettings({ [rightKey]: value as MetricKey } as Partial<SGCCSettings>)}
                pickerStyle="menu"
              >
                {METRIC_OPTIONS.map((o) => (
                  <Text key={o.value} tag={o.value}>{o.label}</Text>
                ))}
              </Picker>
            ]
          })}
        </Section>

        <Section
          header={<Text>阶梯阈值</Text>}
          footer={<Text>用于估算居民阶梯电量进度，请按当地电价规则调整。</Text>}
        >
          <TextField
            title="一阶电量上限"
            value={oneLevelPq}
            keyboardType="numberPad"
            onChanged={setOneLevelPq}
            onSubmit={saveThresholds}
          />
          <TextField
            title="二阶电量上限"
            value={twoLevelPq}
            keyboardType="numberPad"
            onChanged={setTwoLevelPq}
            onSubmit={saveThresholds}
          />
        </Section>

        <Section
          header={<Text>数据</Text>}
          footer={<Text>刷新间隔越短越耗流量；数据依赖 wsgw 重写抓取的接口。</Text>}
        >
          <Picker
            title="刷新间隔"
            value={settings.refreshInterval}
            onChanged={(value: number) => applySettings({ refreshInterval: value })}
            pickerStyle="menu"
          >
            <Text tag={60}>1 小时</Text>
            <Text tag={180}>3 小时</Text>
            <Text tag={360}>6 小时</Text>
            <Text tag={720}>12 小时</Text>
            <Text tag={1440}>24 小时</Text>
          </Picker>
          <Button title="清除缓存" role="destructive" action={clearCache} />
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={<Text>预览页顶部可在真实数据与演示数据之间切换，用于离线校对布局。</Text>}
        >
          <Button title="预览中号小组件" action={preview} />
        </Section>

        <Section>
          <Button title="恢复默认设置" role="destructive" action={restoreDefaults} />
        </Section>
      </List>
    </NavigationStack>
  )
}

if (Script.env === "index") {
  Navigation.present({ element: <SettingsView /> }).finally(() => Script.exit())
}
