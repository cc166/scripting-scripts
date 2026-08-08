import { VStack, HStack, ZStack, Text, Spacer, RoundedRectangle, Widget, SVG } from "scripting"
import { getAllActivitys } from "./components/storage"
import { getSetting } from "./components/setting"
import { CategoryInfo, categoryIconMap } from "./components/category"

type ActivityItem = {
  timestamp: number
  content: {
    code?: string
    seller?: string
    items?: string[] | string
    category?: string
  }
}

function getLatestActivity(): ActivityItem | undefined {
  const data = getAllActivitys() as ActivityItem[] | undefined
  if (!data || data.length === 0) return
  return [...data].sort((a, b) => b.timestamp - a.timestamp)[0]
}

function formatItems(items: ActivityItem["content"]["items"]) {
  if (items == null) return ""
  return Array.isArray(items) ? items.join(" | ") : String(items)
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 小号组件视图 - 垂直布局
 */
function SmallWidgetView({
  code,
  seller,
  items,
  category,
  timestamp
}: {
  code: string
  seller?: string
  items?: string[] | string
  category: CategoryInfo
  timestamp: number
}) {
  const accent = category.color || getSetting("systemColor")
  const timeText = formatTimestamp(timestamp)

  return (
    <VStack
      padding={16}
      spacing={0}
      alignment="center"
    >
      {/* 顶部图标 */}
      <ZStack frame={{ width: 58, height: 58 }}>
        <RoundedRectangle
          fill={accent}
          cornerRadius={12}
          opacity={0.14}
        />
        <SVG
          code={categoryIconMap[category.key] || categoryIconMap["pickup"]}
          resizable={true}
          frame={{ width: 44, height: 44 }}
          antialiased={true}
        />
      </ZStack>
      
      <Spacer frame={{ height: 10 }} />
      
      {/* 取餐码信息 */}
      <VStack alignment="center" spacing={3}>
        <Text
          font={28}
          fontWeight={"bold"}
          foregroundStyle={accent}
          lineLimit={1}
        >
          {code}
        </Text>
        {seller ? (
          <Text
            font={"caption"}
            foregroundStyle={"secondaryLabel"}
            lineLimit={1}
          >
            {seller}
          </Text>
        ) : null}
      </VStack>
      
      <Spacer />
      
      {/* 底部信息 */}
      <VStack alignment="center" spacing={2}>
        {items ? (
          <Text
            font={"caption2"}
            foregroundStyle={"tertiaryLabel"}
            lineLimit={1}
            multilineTextAlignment="center"
          >
            {formatItems(items)}
          </Text>
        ) : null}
        <Text
          font={"caption2"}
          foregroundStyle={"quaternaryLabel"}
        >
          {timeText}
        </Text>
      </VStack>
    </VStack>
  )
}

/**
 * 中号组件视图
 */
function MediumWidgetView({
  code,
  seller,
  items,
  category,
  timestamp
}: {
  code: string
  seller?: string
  items?: string[] | string
  category: CategoryInfo
  timestamp: number
}) {
  const accent = category.color || getSetting("systemColor")
  const timeText = formatTimestamp(timestamp)

  return (
    <VStack
      padding={16}
      spacing={0}
    >
      {/* 顶部区域 */}
      <HStack alignment="top" spacing={0}>
        {/* 左侧图标 */}
        <ZStack frame={{ width: 68, height: 68 }}>
          <RoundedRectangle
            fill={accent}
            cornerRadius={14}
            opacity={0.14}
          />
          <SVG
            code={categoryIconMap[category.key] || categoryIconMap["pickup"]}
            resizable={true}
            frame={{ width: 52, height: 52 }}
            antialiased={true}
          />
        </ZStack>
        
        <Spacer frame={{ width: 16 }} />
        
        {/* 中间信息 */}
        <VStack alignment="leading" spacing={4}>
          <Text
            font={32}
            fontWeight={"bold"}
            foregroundStyle={accent}
            lineLimit={1}
          >
            {code}
          </Text>
          {seller ? (
            <Text
              font={"body"}
              foregroundStyle={"label"}
              lineLimit={1}
            >
              {seller}
            </Text>
          ) : null}
          {items ? (
            <Text
              font={"footnote"}
              foregroundStyle={"secondaryLabel"}
              lineLimit={2}
            >
              {formatItems(items)}
            </Text>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
      
      <Spacer />
      
      {/* 底部信息栏 */}
      <HStack alignment="center" spacing={8}>
        <Text
          font={"caption"}
          foregroundStyle={"tertiaryLabel"}
        >
          {category.label}
        </Text>
        <Text
          font={"caption"}
          foregroundStyle={"quaternaryLabel"}
        >
          •
        </Text>
        <Text
          font={"caption"}
          foregroundStyle={"tertiaryLabel"}
        >
          {timeText}
        </Text>
        <Spacer />
        <Text
          font={"caption2"}
          foregroundStyle={"quaternaryLabel"}
        >
          最新记录
        </Text>
      </HStack>
    </VStack>
  )
}

/**
 * 小组件空状态 - 小号
 */
function SmallEmptyView() {
  const accent = getSetting("systemColor")
  return (
    <VStack
      padding={14}
      spacing={0}
      alignment="center"
    >
      <Spacer />
      <ZStack alignment="center">
        <RoundedRectangle
          fill={accent}
          cornerRadius={12}
          frame={{ width: 56, height: 56 }}
          opacity={0.12}
        />
        <SVG
          code={categoryIconMap["pickup"]}
          resizable={true}
          frame={{ width: 42, height: 42 }}
          antialiased={true}
          opacity={0.5}
        />
      </ZStack>
      <Spacer frame={{ height: 10 }} />
      <Text
        font={"subheadline"}
        fontWeight={"semibold"}
        foregroundStyle={"secondaryLabel"}
      >
        暂无取餐码
      </Text>
      <Spacer />
      <Text font={"caption2"} foregroundStyle={"quaternaryLabel"}>
        取餐码小组件
      </Text>
    </VStack>
  )
}

/**
 * 大号组件视图
 */
function LargeWidgetView({
  code,
  seller,
  items,
  category,
  timestamp
}: {
  code: string
  seller?: string
  items?: string[] | string
  category: CategoryInfo
  timestamp: number
}) {
  const accent = category.color || getSetting("systemColor")
  const timeText = formatTimestamp(timestamp)
  const date = new Date(timestamp)
  const dateStr = `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  return (
    <VStack
      padding={20}
      spacing={0}
    >
      {/* 顶部区域 */}
      <HStack alignment="center" spacing={16}>
        <ZStack frame={{ width: 88, height: 88 }}>
          <RoundedRectangle
            fill={accent}
            cornerRadius={18}
            opacity={0.14}
          />
          <SVG
            code={categoryIconMap[category.key] || categoryIconMap["pickup"]}
            resizable={true}
            frame={{ width: 68, height: 68 }}
            antialiased={true}
          />
        </ZStack>
        
        <VStack alignment="leading" spacing={6}>
          <Text
            font={48}
            fontWeight={"bold"}
            foregroundStyle={accent}
            lineLimit={1}
          >
            {code}
          </Text>
          {seller ? (
            <Text
              font={"title3"}
              foregroundStyle={"label"}
              lineLimit={1}
            >
              {seller}
            </Text>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
      
      <Spacer frame={{ height: 20 }} />
      
      {/* 商品信息卡片 */}
      {items ? (
        <ZStack alignment="topLeading">
          <RoundedRectangle
            fill={"secondarySystemGroupedBackground"}
            cornerRadius={12}
          />
          <VStack alignment="leading" spacing={8} padding={16}>
            <Text
              font={"caption"}
              fontWeight={"semibold"}
              foregroundStyle={"tertiaryLabel"}
            >
              商品信息
            </Text>
            <Text
              font={"body"}
              foregroundStyle={"label"}
              lineLimit={3}
            >
              {formatItems(items)}
            </Text>
          </VStack>
        </ZStack>
      ) : null}
      
      <Spacer />
      
      {/* 底部信息栏 */}
      <HStack alignment="center" spacing={12}>
        <VStack alignment="leading" spacing={4}>
          <Text
            font={"caption2"}
            foregroundStyle={"tertiaryLabel"}
          >
            分类
          </Text>
          <Text
            font={"subheadline"}
            fontWeight={"semibold"}
            foregroundStyle={accent}
          >
            {category.label}
          </Text>
        </VStack>
        
        <Spacer />
        
        <VStack alignment="trailing" spacing={4}>
          <Text
            font={"caption2"}
            foregroundStyle={"tertiaryLabel"}
          >
            添加时间
          </Text>
          <Text
            font={"subheadline"}
            fontWeight={"medium"}
            foregroundStyle={"secondaryLabel"}
          >
            {dateStr}
          </Text>
        </VStack>
      </HStack>
    </VStack>
  )
}

/**
 * 小组件空状态 - 中号
 */
function MediumEmptyView() {
  const accent = getSetting("systemColor")
  return (
    <VStack
      padding={16}
      spacing={0}
      alignment="center"
    >
      <Spacer />
      <ZStack alignment="center">
        <RoundedRectangle
          fill={accent}
          cornerRadius={16}
          frame={{ width: 72, height: 72 }}
          opacity={0.12}
        />
        <SVG
          code={categoryIconMap["pickup"]}
          resizable={true}
          frame={{ width: 56, height: 56 }}
          antialiased={true}
          opacity={0.5}
        />
      </ZStack>
      <Spacer frame={{ height: 14 }} />
      <Text
        font={"title3"}
        fontWeight={"semibold"}
        foregroundStyle={"label"}
      >
        暂无取餐码
      </Text>
      <Spacer frame={{ height: 4 }} />
      <Text
        font={"caption"}
        foregroundStyle={"tertiaryLabel"}
      >
        添加新的取餐码后会在这里显示
      </Text>
      <Spacer />
      <Text font={"caption2"} foregroundStyle={"quaternaryLabel"}>
        取餐码小组件
      </Text>
    </VStack>
  )
}

/**
 * 小组件空状态 - 大号
 */
function LargeEmptyView() {
  const accent = getSetting("systemColor")
  return (
    <VStack
      padding={20}
      spacing={0}
      alignment="center"
    >
      <Spacer />
      <ZStack alignment="center">
        <RoundedRectangle
          fill={accent}
          cornerRadius={20}
          frame={{ width: 96, height: 96 }}
          opacity={0.12}
        />
        <SVG
          code={categoryIconMap["pickup"]}
          resizable={true}
          frame={{ width: 72, height: 72 }}
          antialiased={true}
          opacity={0.5}
        />
      </ZStack>
      <Spacer frame={{ height: 20 }} />
      <Text
        font={"title2"}
        fontWeight={"bold"}
        foregroundStyle={"label"}
      >
        暂无取餐码
      </Text>
      <Spacer frame={{ height: 8 }} />
      <Text
        font={"body"}
        foregroundStyle={"secondaryLabel"}
        multilineTextAlignment="center"
      >
        添加新的取餐码后会在这里显示
      </Text>
      <Spacer frame={{ height: 4 }} />
      <Text
        font={"caption"}
        foregroundStyle={"tertiaryLabel"}
      >
        支持外卖、快递等多种类型
      </Text>
      <Spacer />
      <Text font={"caption2"} foregroundStyle={"quaternaryLabel"}>
        取餐码小组件
      </Text>
    </VStack>
  )
}

/**
 * 根据组件大小返回对应的视图
 */
function WidgetView() {
  const latest = getLatestActivity()
  
  // 空状态
  if (!latest || !latest.content?.code) {
    switch (Widget.family) {
      case "systemSmall":
        return <SmallEmptyView />
      case "systemMedium":
        return <MediumEmptyView />
      case "systemLarge":
        return <LargeEmptyView />
      default:
        return <SmallEmptyView />
    }
  }

  const category = (latest as any).categoryInfo
  const props = {
    code: String(latest.content.code),
    seller: latest.content.seller,
    items: latest.content.items,
    category: category,
    timestamp: latest.timestamp
  }

  // 根据组件大小返回不同视图
  switch (Widget.family) {
    case "systemSmall":
      return <SmallWidgetView {...props} />
    case "systemMedium":
      return <MediumWidgetView {...props} />
    case "systemLarge":
      return <LargeWidgetView {...props} />
    default:
      return <SmallWidgetView {...props} />
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 渲染组件
    Widget.present(<WidgetView />)
  } catch (error) {
    console.error('小组件渲染失败:', error)

    // 显示错误信息
    Widget.present(
      <VStack
        spacing={8} 
        padding={16}
        alignment="center"
      >
        <Spacer />
        <Text font="body" fontWeight="semibold" foregroundStyle="#FF3B30">
          加载失败
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
          {error?.toString() || '未知错误'}
        </Text>
        <Spacer />
        <Text font="caption2" foregroundStyle="tertiaryLabel">
          取餐码小组件
        </Text>
      </VStack>
    )
  }
}

// 执行主函数
main()
