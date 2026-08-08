// File: widget.tsx — 最终且完全符合要求的版本 (V14: 采用倒序遍历和提前退出优化性能)

// 确保这里的导入和声明与您当前可运行的版本一致，并添加了 Divider 和 ZStack 以提高代码健壮性
import { Button, VStack, HStack, Text, Image, Widget } from "scripting"
import { extractPickupFromText, type PickupInfo } from "./pickup_parser"

declare const Storage: { 
  get<T>(key: string): T | undefined; 
  set(key: string, value: any): void; 
};

// 确保这里的导入路径正确
import { TogglePickedIntent, MarkAllPickedIntent } from "./app_intents" 

const CONFIG_KEY = "smsPickup_widget_config_v1"

function loadData(): PickupInfo[] { 
  const cfg = Storage.get<any>(CONFIG_KEY) 
  if (!cfg || !cfg.importedMessages) return []

  const importedMessages = cfg.importedMessages as string[] // 明确类型
  const pickedItems: { code: string, timestamp: number }[] = cfg.pickedItems || [] 
  const pickedMap = new Map(pickedItems.map(item => [item.code, item.timestamp]))
  const HOUR = 60 * 60 * 1000 

  let arr: PickupInfo[] = []
  const seenCodes = new Set<string>()
  
  // importedMessages 始终按“最新到最旧”保存。
  const MAX_MESSAGES_TO_SCAN = 500
  const messagesToScan = importedMessages.slice(0, MAX_MESSAGES_TO_SCAN)

  for (const msg of messagesToScan) {
    const extracted = extractPickupFromText(msg)
    
    for (const item of extracted) {
      if (seenCodes.has(item.code)) continue
      seenCodes.add(item.code)

      const pickupTime = pickedMap.get(item.code)
      const isPickedInStorage = !!pickupTime 
      
      if (isPickedInStorage) {
        // 逻辑 1：如果 Item 是已取，并且在 1 小时内，将其标记为 picked: true (灰色状态)
        if (Date.now() - pickupTime < HOUR) {
          arr.push({ ...item, picked: true }) 
        } 
        // 逻辑 2：超过 1 小时的已取件，不推入 arr，实现“消失”效果。
      } else {
        // 逻辑 3：未取件 (彩色状态)
        arr.push({ ...item, picked: false })
      }
    }
    
    // 启发式提前退出：如果已经收集了 10 个包裹，并且其中至少有 2 个是待取件的，
    // 就可以假设已经找到了足够的信息，提前退出循环。
    if (arr.length >= 10 && arr.filter(i => !i.picked).length >= 2) {
        break; 
    }
  }
  
  const unpicked = arr.filter(item => !item.picked)
  const recentlyPicked = arr.filter(item => item.picked)
  return [...unpicked, ...recentlyPicked].slice(0, 10)
}

function overdueColor(dateStr: string | null | undefined) {
  if (!dateStr) return "#34C759" 
  
  const diff = (Date.now() - new Date(dateStr).getTime()) / 3600000 
  if (diff <= 24) return "#34C759" 
  if (diff <= 48) return "#FFD60A" 
  return "#FF3B30"                 
}

function getColor(item: PickupInfo) {
    // 核心逻辑：已取且在 1H 内显示灰色
    if (item.picked) {
        return "#8E8E93" 
    }
    return overdueColor(item.date) 
}

function getIcon(item: PickupInfo) {
    return item.picked ? "shippingbox" : "shippingbox.fill"
}


// ---------------- 视图构建 ----------------

const list = loadData() // 原始列表 (包含未取和 1H 内已取)
const unpickedList = list.filter(item => !item.picked) // 仅用于统计数量和检查 late
const family = Widget.family
let bodyContent

// ========== SMALL (小型组件) ==========
if (family === "systemSmall") {
  const item = list[0]

  bodyContent = !item ? (
    <Text font="headline" fontWeight="bold">暂无取件信息</Text>
  ) : (
    <Button buttonStyle="plain" intent={TogglePickedIntent(item.code)}>
      <VStack spacing={10}>
        <HStack spacing={12} alignment="center">
          <Image
            systemName={getIcon(item)}
            font={28}
            foregroundStyle={getColor(item)}
          />
          <VStack spacing={2} alignment="leading">
            <Text font="caption2" opacity={0.6}>{item.picked ? "已取件 (1H)" : "待取包裹"}</Text>
            <Text font="caption2" opacity={0.6}>{item.courier || "快递包裹"}</Text>
          </VStack>
        </HStack>
  
        <VStack 
          frame={{ height: 5 }} 
          background="#E5E5EA" 
          clipShape={{ type: "rect", cornerRadius: 3 }} 
        />
  
        <VStack alignment="center" spacing={4}>
          <Text font="caption2" opacity={0.5}>取件码</Text>
          <Text font={25} fontWeight="bold" foregroundStyle={getColor(item)} lineLimit={1} minScaleFactor={0.8}>
            {item.code}
          </Text>
        </VStack>
      </VStack>
    </Button>
  )
}

// ========== MEDIUM (中型组件) ==========
else if (family === "systemMedium") {
  const unpickedCount = unpickedList.length 
  // 保持原版逻辑：使用 list.slice(0, 2)，实现灰色短暂停留
  const displayItems = list.slice(0, 2) 

  const locations = [...new Set(unpickedList.filter(i => i.courier).map(i => i.courier))]
  const locationText = locations.length > 0 ? locations.join("\n") : "暂无"
  
  const hasVeryLate = unpickedList.some(i => {
      if(!i.date || i.picked) return false;
      return (Date.now() - new Date(i.date).getTime()) > 48 * 3600000;
  })
  const countColor = hasVeryLate ? "#FF3B30" : "#34C759"

  if (displayItems.length === 0) {
    bodyContent = <Text font="headline" fontWeight="bold">暂无取件信息</Text>
  } else {
    bodyContent = (
      <HStack spacing={15} alignment="center">
        {/* 左侧列表 */}
        <VStack spacing={10} frame={{ maxWidth: Infinity, alignment: "leading" }}>
          {displayItems.map((item, i) => (
            // 保持原版 Button 包裹
            <Button key={item.code} buttonStyle="plain" intent={TogglePickedIntent(item.code)}>
              <HStack spacing={10} alignment="center">
                <Image
                  systemName={getIcon(item)}
                  font={24}
                  foregroundStyle={getColor(item)} 
                />
                
                {/* 🚀 修正 Medium 快递码左对齐：将 VStack 设置为占据全部可用宽度并左对齐内容 */}
                <VStack spacing={2} alignment="leading" frame={{ maxWidth: Infinity, alignment: "leading" }}>
                  <Text 
                    font="title3" 
                    fontWeight="bold" 
                    lineLimit={1} 
                    foregroundStyle={getColor(item)}
                  >
                    {item.code} 
                  </Text>
                  <Text font="caption2" opacity={0.5} lineLimit={1}>
                    {item.courier || "快递包裹"} {item.picked ? "(已取)" : ""}
                  </Text>
                </VStack>
                {/* 修正结束 */}
                
              </HStack>
            </Button>
          ))}
        </VStack>

        {/* 保持原版分割线写法 */}
        <VStack frame={{ width: 1, height: 80 }} background="#E5E5EA" />

        {/* 右侧统计 */}
        <Button buttonStyle="plain" intent={MarkAllPickedIntent()} frame={{ width: 80 }}>
          <VStack spacing={5} alignment="leading" frame={{ width: 80 }}>
            <VStack spacing={0}>
               <Text font="caption2" opacity={0.5}>待取</Text>
               <Text font="title" fontWeight="bold" foregroundStyle={countColor}>
                 {unpickedCount}
               </Text>
            </VStack>
            <VStack spacing={2}>
               <Text font="caption2" opacity={0.5}>位置</Text>
               <Text font="caption2" fontWeight="medium" lineLimit={3}>
                 {locationText}
               </Text>
            </VStack>
          </VStack>
        </Button>
      </HStack>
    )
  }
}

// ========== LARGE (大型组件) ==========
else {
  // 保持原版逻辑：使用 list.slice(0, 4)，实现灰色短暂停留
  const displayList = list.slice(0, 4)

  bodyContent = (
    <VStack spacing={12}>
      <Text font="headline" fontWeight="bold">📦 最近取件码</Text>

      {displayList.length === 0 ? (
        <Text font="footnote" opacity={0.5}>暂无取件信息</Text>
      ) : displayList.map((item, i) => (
        // 保持原版 Button 包裹
        <Button key={item.code} buttonStyle="plain" intent={TogglePickedIntent(item.code)}>
          <HStack spacing={12} alignment="top">
            <Image
              systemName={getIcon(item)}
              font={22}
              foregroundStyle={getColor(item)}
            />
            
            {/* 🚀 修正 Large 快递码左对齐：将 VStack 设置为占据全部可用宽度并左对齐内容 */}
            <VStack alignment="leading" spacing={3} frame={{ maxWidth: Infinity, alignment: "leading" }}>
              <Text font="title2" fontWeight="bold" foregroundStyle={getColor(item)}>
                {item.code}
              </Text>
              <Text font="footnote" opacity={0.6}>
                {item.courier || "快递包裹"} {item.picked ? "(已取，1H内)" : ""}
              </Text>
              <Text font="footnote" opacity={0.4} lineLimit={2}>{item.snippet}</Text>
            </VStack>
            {/* 修正结束 */}
            
          </HStack>
        </Button>
      ))}
    </VStack>
  )
}

// ----------------- 输出 -----------------

Widget.present(
  <VStack
    padding={16}
    clipShape={{ type: "rect", cornerRadius: 26 }} 
    background={{
      gradient: {
        stops: [
            { color: "#FFFFFF", location: 0.0 },
            { color: "#F2F2F7", location: 1.0 }
        ],
        startPoint: "top",
        endPoint: "bottom"
      } as any
    }}
  >
    {bodyContent}
  </VStack>
)
