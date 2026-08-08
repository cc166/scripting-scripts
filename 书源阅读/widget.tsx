import { Widget } from "scripting"
import { LargeReadingWidget } from "./widgets/large"
import { MediumReadingWidget } from "./widgets/medium"
import { SmallReadingWidget } from "./widgets/small"

function WidgetView() {
  switch (Widget.family) {
    case "systemLarge":
    case "systemExtraLarge":
      return <LargeReadingWidget />
    case "systemMedium":
      return <MediumReadingWidget />
    case "systemSmall":
    default:
      return <SmallReadingWidget />
  }
}

Widget.present(<WidgetView />)
