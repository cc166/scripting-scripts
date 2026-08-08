import { ShapeStyle, DynamicShapeStyle } from "scripting"

const storageKey = "activity.settings"

const isDebug: boolean = false
const isRunWhenStarted: boolean = false
const runType: "latest" | "pick" = "latest"
const systemColor: ShapeStyle | DynamicShapeStyle = "systemBlue"
const modelProvider: string = "openai"
const modelCustomProvider: string = ""
const modelId: string = ""
const modelPrompt: string = `
# Role
你是一个智能订单解析引擎。你的任务是基于用户的文本输入，精准提取关键信息并填充到给定的 JSON Schema 中。

# Extraction Logic & Constraints (字段填充逻辑)

## 1. code (取餐/取件码) - 最关键字段
- **优先级**：取餐码/取件码 > 提货码 > 口令。
- **格式识别**：
  - 纯数字：通常为 3-5 位 (如 "9527", "002")。
  - 字母组合：字母开头 (如 "A102", "B-55")。
  - 柜机码：分段数字 (如 "1-2-9002")。
  - 短句口令：(如 "8.发财")。
- **负面约束 (非常重要)**：
  - 严禁提取 11 位手机号码。
  - 严禁提取 4-6 位短信登录验证码 (通常伴随 "验证码"、"校验码" 字样)。
  - 严禁提取订单流水号 (通常很长，如 20231012...)。
  - 如果文本中同时出现 "取餐码 8821" 和 "验证码 4490"，必须提取 8821。

## 2. seller (商家名称)
- 提取品牌主名 (如 "麦当劳", "顺丰速运")。
- 自动清洗：去除括号内的分店名 (如将 "喜茶(科技园店)" 清洗为 "喜茶")。
- 如果是快递，优先提取快递公司名；如果是外卖，提取餐厅名。

## 3. items (商品/地址)
- **数组拆分**：如果文本包含多个商品 (如 "汉堡+可乐")，请拆分为数组项 ["汉堡", "可乐"]。
- **内容过滤**：
  - 仅保留实际购买的商品名。
  - 过滤掉广告词 (如 "新品推荐", "加购优惠")。
  - 过滤掉餐具数量 (如 "1人份", "无需餐具")。
- **快递场景**：如果是取件短信，本字段请填入 **取件位置/地址** (如 "3号柜中格", "西门丰巢")。

## 4. category (品类)
- 请基于内容推理，从以下标准列表中选择最接近的一个：
  ['汉堡', '奶茶', '咖啡', '中式简餐', '甜品', '炸鸡', '快递', '超市', '生鲜', '其他']

# Task
分析用户输入的文本，根据上述逻辑填充 Schema。如果某字段完全无法从文本中获取，请保留 Schema 定义的默认值或留空。
`


const defaults = {
  isDebug,
  isRunWhenStarted,
  runType,
  systemColor,
  modelProvider,
  modelCustomProvider,
  modelId,
  modelPrompt,
}

export type SettingKey = keyof typeof defaults

export function getSetting(key: SettingKey) {
  const data = Storage.get<Record<string, any>>(storageKey) || {}
  // has storage
  if (data[key] != null) return data[key]
  // no storage then use default
  return defaults[key]
}

export function saveSetting(key: SettingKey, value: any) {
  let data = Storage.get<Record<string, any>>(storageKey) || {}
  data[key] = value
  Storage.set(storageKey, data)
}