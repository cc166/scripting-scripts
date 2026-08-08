import { Navigation, NavigationStack, Script, Widget } from "scripting"
import Home from "./pages/Home"
import { loadShortcuts } from "./util/store"
import { cacheIcons } from "./util/icon-cache"

async function run() {
  const shortcuts = loadShortcuts()
  cacheIcons(shortcuts.map(s => s.iconUrl)).then(() => Widget.reloadAll()).catch(e => {
    console.error("cache shortcut icons failed", e)
  })

  await Navigation.present({
    element: (
      <NavigationStack>
        <Home />
      </NavigationStack>
    ),
  })
  Script.exit()
}

run()
