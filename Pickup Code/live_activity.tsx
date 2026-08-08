import { LiveActivity, LiveActivityUIBuilder, LiveActivityUI, LiveActivityUIExpandedCenter } from "scripting"
import { saveActivity, getActivityWithTs, removeActivityWithTs, removeThumbnailWithTs } from "./components/storage"
import { LargeActivityView, MiniActivityViewLeading, MiniActivityViewTrailing } from "./views/activity_view"
import { CategoryInfo } from "./components/category"
import { debugWithStorage } from "./helper/debug"

const activityName = "PickupCodeAssistantActivity"
export type State = {
  content: Record<string, any>,
  timestamp: number,
  categoryInfo: CategoryInfo
}

function buildActivity() {
  const builder: LiveActivityUIBuilder<State> = (state: State) => {
    const category = state.categoryInfo
    return <LiveActivityUI
      content={
        <LargeActivityView
          content={state.content}
          timestamp={state.timestamp}
          category={category}
        />
      }
      compactLeading={
        <MiniActivityViewLeading category={category} />
      }
      compactTrailing={
        <MiniActivityViewTrailing
          code={state.content.code}
          category={category}
        />
      }
      minimal={
        <MiniActivityViewLeading category={category} />
      }
    >
      <LiveActivityUIExpandedCenter>
        <LargeActivityView
          content={state.content}
          timestamp={state.timestamp}
          category={category}
          isPadding={false}
        />
      </LiveActivityUIExpandedCenter>
    </LiveActivityUI>
  }
  return builder
}

const PickupCodeActivity = LiveActivity.register(activityName, buildActivity())

export class ActivityBuilder {
  /* 静态方法 */
  static async endActivityWithTs(timestamp: number) {
    const data = getActivityWithTs(timestamp)
    if (data == null) return

    const activity = await LiveActivity.from(
      data.activityId,
      activityName
    )

    if (activity == null) {
      removeActivityWithTs(timestamp)
      removeThumbnailWithTs(timestamp)
      return
    }
    try {
      activity.end(
        {},
        { dismissTimeInterval: 0 }
      )
      removeActivityWithTs(timestamp)
      removeThumbnailWithTs(timestamp)
    }
    catch (e) {
      debugWithStorage("endActivityWithTs: " + String(e))
    }
  }

  /* 实例方法 */
  // 生成时间戳传递intent
  timestamp: number
  activity: LiveActivity<State>

  constructor(
    timestamp?: number
  ) {
    this.timestamp = timestamp || Date.now()
    this.activity = PickupCodeActivity()
  }

  async startActivity(content: Record<string, any>, categoryInfo: CategoryInfo) {
    let status = false
    if (this.activity == null) return status
    
    const category: CategoryInfo = categoryInfo
    
    status = await this.activity.start({
      content,
      timestamp: this.timestamp,
      categoryInfo: category
    }, {
      relevanceScore: Date.now()
    })
    if (status === false) {
      throw("startActivity: status false")
    }
    // save activity
    const timestamp = this.timestamp
    const activityId = this.activity.activityId
    if (activityId) {
      saveActivity({
        activityId,
        timestamp,
        content,
        categoryInfo: category
      })
    }
    return timestamp
  }
}