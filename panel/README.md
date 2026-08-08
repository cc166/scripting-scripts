# Panel · 仪表面板小组件

一个基于 [Scripting App](https://scriptingapp.github.io/) 的 iOS 桌面小组件，把
**纪念日 / 倒计时**、**App 快捷入口**、**系统状态**、**天气**集成到一张卡片上，
并提供完整的 App 内编辑界面。

> 入口脚本：`index.tsx`（App 内 UI）  
> 组件脚本：`widget.tsx`（桌面小组件渲染）  
> 交互意图：`app_intents.tsx`（支持组件内按钮触发刷新）

---

## ✨ 功能总览

### 1. 纪念日 / 倒计时
- 两种模式：
  - `past`：**已经在一起 X 天**（显示从某日至今）
  - `future`：**距离 X 还有 X 天**（生日 / 高考 / 旅行 …，可设置每年重复）
- 自定义图标（SF Symbol）、主题色
- 在大尺寸 widget 顶部展示

### 2. App 快捷入口
- 最多 **3 行 × 5 个** 圆形入口
- 支持：
  - SF Symbol 图标
  - **从 App Store 抓真实 App 图标**（通过 iTunes Search API）
  - 自定义跳转 URL（`https` / `xxx://` scheme / `shortcuts://run-shortcut?name=…`）
- 单项可隐藏 / 排序 / 重置为预设

### 3. 系统状态行
仅展示 iOS 允许第三方读取的真实状态：
| 状态 | 显示 | 默认跳转 |
|---|---|---|
| Wi-Fi | 开 / 关图标 | `App-Prefs:root=WIFI` |
| 蜂窝 | 开 / 关图标 | `App-Prefs:root=MOBILE_DATA_SETTINGS_ID` |

> 蓝牙 / 隔空投送 / 专注 / 电量已主动移除：iOS 不开放查询，或系统已自带。

每项状态可：
- 单独开关 / 排序
- 自定义点击跳转 URL（推荐用 `shortcuts://run-shortcut?name=…` 跳到自建快捷指令，最稳）

### 4. 天气卡片
- 自动定位（需在系统中授予 widget 定位权限）或手动指定经纬度 / 城市名
- 数据源：[Open-Meteo](https://open-meteo.com/)（免 key、免账号）
- 缓存到 `Storage`，组件刷新优先读缓存，避免频繁定位
- 在中 / 大尺寸 widget 中显示当前温度、天气状况、详细信息

### 5. 外观
- 主题：`auto` / `light` / `dark`
- 强调色（系统色 / HEX / rgba）
- 背景渐变：内置 6 套预设（晨曦 / 海洋 / 极光 / 夜空 / 薰衣草 / 石墨）
- 透明背景：直接透出系统壁纸

### 6. 组件刷新
- 主页右上角 **「↻」** 按钮：强制重拉天气 + `Widget.reloadAll()`
- 注册了 `RefreshIntent`（`panel.refresh`）App Intent，可在交互式 widget 按钮里触发

---

## 📐 尺寸支持

| 尺寸 | 内容 |
|---|---|
| `systemSmall` | 单卡片（常驻一项关键内容） |
| `systemMedium` | 快捷入口 + 天气 / 状态精简版 |
| `systemLarge` | 纪念日 + 天气 + 快捷入口 + 状态完整版 |

实现位于 `widget/family/{small,medium,large}.tsx`，公共组件位于 `widget/comp/`。

---

## 🗂️ 目录结构

```
panel/
├── index.tsx                  # App 内入口（NavigationStack -> Home）
├── widget.tsx                 # 桌面 widget 渲染入口
├── app_intents.tsx            # AppIntent: panel.refresh
├── script.json                # Scripting 脚本元信息
│
├── pages/                     # App 内编辑页
│   ├── Home.tsx               #   主菜单
│   ├── AnniversaryList.tsx    #   纪念日列表
│   ├── AnniversaryEdit.tsx    #   纪念日编辑
│   ├── ShortcutList.tsx       #   快捷入口列表
│   ├── ShortcutEdit.tsx       #   快捷入口编辑（支持抓 App 图标）
│   ├── StatusSettings.tsx     #   状态项开关 / 排序 / 自定义 URL
│   ├── WeatherSettings.tsx    #   天气配置
│   └── Appearance.tsx         #   主题 / 强调色 / 背景
│
├── widget/
│   ├── family/                # 三种尺寸的根布局
│   │   ├── small.tsx
│   │   ├── medium.tsx
│   │   └── large.tsx
│   └── comp/                  # 复用组件
│       ├── anniv-card.tsx
│       ├── shortcut-circle.tsx
│       ├── status-row.tsx
│       ├── weather-card.tsx
│       ├── weather-detail-bar.tsx
│       └── bg.tsx
│
└── util/
    ├── const.ts               # 数据模型 / Storage Key / 预设常量
    ├── preset.ts              # 默认快捷入口 / 纪念日 / 设置
    ├── store.ts               # Storage 读写 (CRUD + 排序 + 重置)
    ├── status.ts              # 系统状态读取（Wi-Fi / 蜂窝 …）
    ├── weather.ts             # Open-Meteo 拉取 + 缓存
    ├── time.ts                # 日期工具（已经 X 天 / 还有 X 天）
    └── appicon.ts             # iTunes Search API 抓 App 图标
```

---

## 💾 数据存储

所有数据通过 Scripting 的 `Storage` API 持久化在脚本沙盒内：

| Key | 内容 |
|---|---|
| `panel.shortcuts.v2` | 快捷入口列表 |
| `panel.anniversaries.v1` | 纪念日列表 |
| `panel.settings.v2` | 全局设置（主题 / 模块开关 / 状态项 / 天气 / 背景） |
| `panel.weather.cache.v1` | 天气缓存 |

首次启动会写入 `util/preset.ts` 中的默认数据，可在 App 内 **重置为预设**。

---