import {
  List, Section, Text, HStack, VStack, Image, Spacer,
  Toggle, Picker, Button, TextField, Widget, useState,
} from "scripting"
import { loadSettings, saveSettings } from "../util/store"
import {
  fetchWeather, loadWeatherCache, clearWeatherCache, WeatherCache,
} from "../util/weather"
import { WeatherSettings as WeatherCfg } from "../util/const"

declare const Dialog: {
  alert(opts: { message: string; title?: string }): Promise<void>
}
declare const Location: {
  geocodeAddress(opts: {
    address: string; locale?: string
  }): Promise<Array<{
    location?: { latitude: number; longitude: number }
    name?: string
    locality?: string
    administrativeArea?: string
    country?: string
  }> | null>
}

export default function WeatherSettings() {
  const init = loadSettings()
  const [enabled, setEnabled] = useState(init.weather.enabled)
  const [mode, setMode] = useState<WeatherCfg["mode"]>(init.weather.mode)
  const [manualName, setManualName] = useState(init.weather.manualName ?? "")
  const [manualLat, setManualLat] = useState<string>(
    init.weather.manualLat != null ? String(init.weather.manualLat) : "",
  )
  const [manualLon, setManualLon] = useState<string>(
    init.weather.manualLon != null ? String(init.weather.manualLon) : "",
  )
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cache, setCache] = useState<WeatherCache | null>(loadWeatherCache())

  const persist = (patch: Partial<WeatherCfg>) => {
    const s = loadSettings()
    s.weather = { ...s.weather, ...patch }
    saveSettings(s)
    Widget.reloadAll()
  }

  const onSearchCity = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const list = await Location.geocodeAddress({ address: search.trim(), locale: "zh-Hans-CN" })
      const r = list?.[0]
      if (!r?.location) {
        await Dialog.alert({ title: "未找到", message: `未找到 "${search}" 对应的位置` })
        return
      }
      const name = r.locality || r.name || r.administrativeArea || search.trim()
      setManualLat(String(r.location.latitude))
      setManualLon(String(r.location.longitude))
      setManualName(name)
      persist({
        manualLat: r.location.latitude,
        manualLon: r.location.longitude,
        manualName: name,
        mode: "manual",
      })
      setMode("manual")
    } catch (e: any) {
      await Dialog.alert({ title: "搜索失败", message: String(e?.message ?? e) })
    } finally {
      setSearching(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      const c = await fetchWeather(true)
      setCache(c)
      Widget.reloadAll()
    } catch (e: any) {
      await Dialog.alert({ title: "刷新失败", message: String(e?.message ?? e) })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <List
      navigationTitle="天气"
      navigationBarTitleDisplayMode="inline"
    >
      <Section header={<Text>开关</Text>}>
        <Toggle
          title="显示天气卡片"
          value={enabled}
          onChanged={(v: boolean) => { setEnabled(v); persist({ enabled: v }) }}
        />
      </Section>

      <Section
        header={<Text>位置来源</Text>}
        footer={
          <Text font={11} foregroundStyle="secondaryLabel">
            自动定位需在系统「设置 → 隐私 → 定位 → Scripting」中开启「使用期间允许」并启用「精确位置」。
            小组件如长时间未刷新，请在 App 内手动刷新一次。
          </Text>
        }
      >
        <Picker title="模式" value={mode} onChanged={(v: any) => { setMode(v); persist({ mode: v }) }}>
          <Text tag="auto">自动定位</Text>
          <Text tag="manual">手动指定</Text>
        </Picker>
      </Section>

      {mode === "manual" && (
        <>
          <Section header={<Text>城市搜索</Text>}>
            <HStack spacing={8}>
              <TextField
                title="城市"
                value={search}
                prompt="输入城市名，例如 上海"
                onChanged={setSearch}
              />
              <Button
                title={searching ? "搜索中…" : "搜索"}
                action={onSearchCity}
                disabled={searching || !search.trim()}
              />
            </HStack>
          </Section>

          <Section
            header={<Text>当前位置</Text>}
            footer={<Text font={11} foregroundStyle="secondaryLabel">也可手动输入经纬度（小数）</Text>}
          >
            <TextField title="名称" value={manualName} onChanged={setManualName} prompt="例如 北京" />
            <TextField title="纬度" value={manualLat} onChanged={setManualLat} prompt="例如 39.9042" />
            <TextField title="经度" value={manualLon} onChanged={setManualLon} prompt="例如 116.4074" />
            <Button
              title="保存手动位置"
              action={() => {
                const lat = parseFloat(manualLat), lon = parseFloat(manualLon)
                if (!isFinite(lat) || !isFinite(lon)) {
                  Dialog.alert({ title: "无效", message: "经纬度必须是数字" })
                  return
                }
                persist({ manualLat: lat, manualLon: lon, manualName: manualName.trim() || "自定义" })
              }}
            />
          </Section>
        </>
      )}

      <Section
        header={<Text>当前数据</Text>}
        footer={
          <Text font={11} foregroundStyle="secondaryLabel">
            数据来源：Open-Meteo（免费、无需 Key、国内可访问，自动主备域名 fallback）。
          </Text>
        }
      >
        {cache ? (
          <VStack alignment="leading" spacing={6} padding={{ top: 4, bottom: 4 }}>
            <HStack spacing={8}>
              <Image systemName={cache.symbol} font={28} foregroundStyle="systemBlue" />
              <VStack alignment="leading" spacing={2}>
                <HStack spacing={4}>
                  <Text font={22} fontWeight="bold">{cache.temp}°</Text>
                  <Text font={14} foregroundStyle="secondaryLabel">{cache.conditionText}</Text>
                  {cache.tempMin != null && cache.tempMax != null && (
                    <Text font={12} foregroundStyle="tertiaryLabel">
                      {cache.tempMin}°~{cache.tempMax}°
                    </Text>
                  )}
                </HStack>
                <Text font={12} foregroundStyle="secondaryLabel">
                  {cache.place} · 体感 {cache.feelsLike}° · 湿度 {cache.humidity}%
                </Text>
                {buildExtraLine(cache).length > 0 ? (
                  <Text font={12} foregroundStyle="secondaryLabel">
                    {buildExtraLine(cache)}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
            </HStack>
            <Text font={11} foregroundStyle="tertiaryLabel">
              更新于 {fmtTime(cache.fetchedAt)}
            </Text>
          </VStack>
        ) : (
          <Text foregroundStyle="secondaryLabel">暂无缓存，点击下方刷新</Text>
        )}
        <Button title={refreshing ? "刷新中…" : "立即刷新"} action={onRefresh} disabled={refreshing} />
        <Button
          title="清空缓存"
          action={() => { clearWeatherCache(); setCache(null); Widget.reloadAll() }}
          buttonStyle="bordered"
        />
      </Section>
    </List>
  )
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 拼接"日出/日落 · UV · 降水"补充行；任何字段都没有时返回空串。 */
function buildExtraLine(c: WeatherCache): string {
  const parts: string[] = []
  if (c.sunrise) parts.push(`日出 ${c.sunrise}`)
  if (c.sunset)  parts.push(`日落 ${c.sunset}`)
  if (c.uvIndex != null) {
    parts.push(`UV ${c.uvIndex}${c.uvLevel ? `(${c.uvLevel})` : ""}`)
  }
  if (c.precipProb != null) parts.push(`降水 ${c.precipProb}%`)
  return parts.join(" · ")
}
