import { Navigation, Script } from "scripting"
import { App } from "./components/App"

async function run() {
  await Navigation.present({
    element: <App />,
  })

  // 脚本退出前强制停止残留的 Speech，避免脚本关闭后系统仍在朗读，
  // 也避免下次冷启动时 Speech 队列有残留
  try {
    await Speech.stop("immediate")
  } catch (err) {
    // ignore
  }

  Script.exit()
}

run()
