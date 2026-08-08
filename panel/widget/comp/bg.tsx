import { RoundedRectangle, Color, EmptyView } from "scripting"

/**
 * Widget 背景。
 * - 透明：返回 EmptyView，外层 ZStack 不绘制底层 → 露出 widgetBackground 系统壁纸
 * - 渐变：保留 0.55 透明度软覆盖
 *
 * 注：新版 scripting 中 LinearGradient 是对象字面量类型（非组件），
 * 直接传给 RoundedRectangle.fill 即可。
 */
export function PanelBackground({
  colors,
  transparent,
}: {
  colors: [Color, Color]
  transparent?: boolean
}) {
  if (transparent) return <EmptyView />
  return (
    <RoundedRectangle
      cornerRadius={0}
      fill={{
        colors,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 1, y: 1 },
      }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      opacity={0.55}
    />
  )
}
