import { Button, HStack, Spacer, Text, VStack, ZStack, RoundedRectangle, Circle, ShapeStyle, LiveActivityState, Capsule, Color, SVG, Image } from "scripting"
import { ActivityFinishIntent } from "../app_intents"
import { getSetting } from "../components/setting"
import { CategoryInfo, categoryIconMap } from "../components/category"

const timestamp2time = (
  timestamp: number,
  style: "time" | "date" | "dateTime" | "dateYear" | "all"
) => {
  const date = new Date(timestamp)
  if (style === "time") return date.toLocaleTimeString()
  if (style === "date") return date.toLocaleDateString().match(/\d+\/\d+$/)
  if (style === "dateTime") return date.toLocaleString().match(/\d+\/\d+ \d+:\d+/)
  if (style === "dateYear") return date.toLocaleDateString()
  return date.toLocaleString()
}

const heightView = 88
const heightViewMax = 110
const stylePrimary: ShapeStyle = "label"
const styleSecondary: ShapeStyle = "secondaryLabel"
const styleBackground: Color | { light: Color, dark: Color } = Device.systemVersion.match("26") ? "clear" : {
  light: "rgba(255,255,255,0.5)",
  dark: "rgba(0,0,0,0.5)"
}
const styleInactive = "systemGray"

export function LargeActivityView({
  content,
  timestamp,
  state = "active",
  isPadding = true,
  isShowInApp = false,
  category
}: {
  content: Record<string, any>,
  timestamp: number,
  state?: LiveActivityState | null,
  isPadding?: boolean,
  isShowInApp?: boolean,
  category: CategoryInfo
}) {
  const { code, seller, items } = content
  const accentColor = category.color || getSetting("systemColor")
  const height = Object.keys(content).length <= 2 ? heightView : heightViewMax
  return <HStack
    padding={isPadding ? {
      horizontal: 15,
      vertical: 10
    } : {
      horizontal: 0,
      vertical: 10
    }}
    frame={{ height: height }}
    alignment="center"
    activityBackgroundTint={styleBackground}
  >
    <ZStack
      frame={{ width: 64, height: 64 }}
    >
      <RoundedRectangle
        fill={accentColor}
        cornerRadius={18}
        opacity={0.12}
        style={"continuous"}
      />
      <RoundedRectangle
        cornerRadius={18}
        stroke={{
          shapeStyle: accentColor,
          strokeStyle: {
            lineWidth: 1,
          }
        }}
        opacity={0.25}
        style={"continuous"}
      />
      <ZStack
        frame={{ width: 64, height: 64 }}
      >
        <SVG
          code={categoryIconMap[category.key]}
          resizable={true}
          frame={{ width: 48, height: 48 }}
          antialiased={true}
        />
      </ZStack>
    </ZStack>
    <VStack
      alignment="leading"
      spacing={4}
    >
      <Text
        font={"title2"}
        fontDesign={"rounded"}
        fontWeight={"semibold"}
        foregroundStyle={stylePrimary}
      >
        {code}
      </Text>
      {seller != null &&
        <Text
          font={"body"}
          foregroundStyle={stylePrimary}
          lineLimit={1}
        >
          {seller}
        </Text>
      }
      {items != null &&
        <Text
          font={"footnote"}
          foregroundStyle={styleSecondary}
          lineLimit={1}
        >
          {Array.isArray(items) ? items.join(" | ") : String(items)}
        </Text>
      }
    </VStack>
    <Spacer />
    <VStack
      alignment="trailing"
      padding={{ vertical: 5 }}
      spacing={6}
    >
      <Text
        font={"footnote"}
        foregroundStyle={styleSecondary}
      >
        {timestamp2time(timestamp, "dateTime")}
      </Text>
      <Spacer />
      {!isShowInApp ? (
        <Button
          intent={ActivityFinishIntent(timestamp)}
          controlSize={"mini"}
          buttonBorderShape={"capsule"}
          foregroundStyle={accentColor}
          tint={accentColor}
        >
          <Text
            font={"footnote"}
            fontWeight={"bold"}
          >
            确认取餐
          </Text>
        </Button>
      ) : (
        <ZStack
          frame={{ width: 50, height: 30 }}
        >
          <Capsule
            fill={state === "active" ? getSetting("systemColor") : styleInactive}
            opacity={0.2}
          />
          <Image
            systemName={"flag.fill"}
            foregroundStyle={state === "active" ? getSetting("systemColor") : styleInactive}
          />
        </ZStack>
      )}
    </VStack>
  </HStack>
}

export function MiniActivityViewLeading({
  category
}: {
  category: CategoryInfo
}) {
  return <ZStack
    frame={{ width: 24, height: 24 }}
  >
    <SVG
      code={categoryIconMap[category.key]}
      resizable={true}
      frame={{ width: 18, height: 18 }}
      antialiased={true}
    />
  </ZStack>
}

export function MiniActivityViewTrailing({
  code,
  category
}: {
  code: string,
  category: CategoryInfo
}) {
  const accentColor = category.color || getSetting("systemColor")
  return <HStack
    spacing={8}
    alignment="center"
  >
    <Text
      foregroundStyle={accentColor}
      fontWeight={"semibold"}
    >
      {code}
    </Text>
  </HStack>
}