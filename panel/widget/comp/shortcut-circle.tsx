import { Link, ZStack, Circle, Image, Text, VStack, Spacer, HStack, EnvironmentValuesReader } from "scripting"
import { Shortcut } from "../../util/const"
import { getExistingIconCachePath } from "../../util/icon-cache"

/**
 * 圆形快捷入口（图标 + 名称）
 * - 优先使用 iconUrl（来自 App Store 真实图标）
 * - 否则使用 SF Symbol 配色块
 */
export function ShortcutCircle({
  item, size = 44, transparent = false,
}: {
  item: Shortcut
  size?: number
  transparent?: boolean
}) {
  const cachedIconPath = getExistingIconCachePath(item.iconUrl)

  return (
    <Link url={item.url}>
      <VStack spacing={4}>
        <ZStack
          frame={{ width: size, height: size }}
        >
          {transparent ? (
            <Image
              systemName={item.icon}
              font={Math.round(size * 0.56)}
              fontWeight="semibold"
              foregroundStyle="white"
              opacity={0.82}
              widgetAccentable
            />
          ) : cachedIconPath ? (
            <Image
              filePath={cachedIconPath}
              resizable
              renderingMode="original"
              widgetAccentedRenderingMode="fullColor"
              scaleToFill
              frame={{ width: size, height: size }}
              clipShape="circle"
            />
          ) : item.iconUrl ? (
            <Image
              imageUrl={item.iconUrl}
              resizable
              renderingMode="original"
              widgetAccentedRenderingMode="fullColor"
              scaleToFill
              frame={{ width: size, height: size }}
              clipShape="circle"
            />
          ) : (
            <>
              <EnvironmentValuesReader keys={["widgetRenderingMode"]}>
                {({ widgetRenderingMode }) => (
                  <Circle
                    fill={item.color}
                    frame={{ width: size, height: size }}
                    opacity={widgetRenderingMode === "accented" ? 0.2 : 1}
                  />
                )}
              </EnvironmentValuesReader>
              <Image
                systemName={item.icon}
                font={Math.round(size * 0.42)}
                fontWeight="semibold"
                foregroundStyle="white"
                widgetAccentable
                widgetAccentedRenderingMode="fullColor"
              />
            </>
          )}
        </ZStack>
        <Text font={10} foregroundStyle="label" lineLimit={1}>
          {item.name}
        </Text>
      </VStack>
    </Link>
  )
}

/** 一行 N 个圆形入口；不足时用 Spacer 补齐居中 */
export function ShortcutRow({
  items, perRow = 5, size = 44, transparent = false,
}: {
  items: Shortcut[]
  perRow?: number
  size?: number
  transparent?: boolean
}) {
  const slots: (Shortcut | null)[] = []
  for (let i = 0; i < perRow; i++) slots.push(items[i] ?? null)
  return (
    <HStack frame={{ maxWidth: "infinity" }} spacing={0}>
      {slots.map((it, i) => (
        <HStack key={String(i)} frame={{ maxWidth: "infinity" }}>
          {it ? <ShortcutCircle item={it} size={size} transparent={transparent} /> : <Spacer />}
        </HStack>
      ))}
    </HStack>
  )
}
