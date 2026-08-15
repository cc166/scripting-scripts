import { Widget } from "scripting"

export type WidgetConfig = {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
}

type StoredConfig = Partial<WidgetConfig>

const CONFIG_KEY = "github_config"

export function loadStoredWidgetConfig(): WidgetConfig {
  const stored = Storage.get<StoredConfig>(CONFIG_KEY) ?? {}
  return {
    token: stored.token ?? "",
    owner: stored.owner ?? "",
    repo: stored.repo ?? "",
    path: stored.path ?? "",
    branch: stored.branch && stored.branch.trim() ? stored.branch : "main",
  }
}

export function getWidgetConfig(): WidgetConfig {
  const stored = loadStoredWidgetConfig()

  try {
    const params = JSON.parse(Widget.parameter || "{}") as StoredConfig
    return {
      token: params.token || stored.token,
      owner: params.owner || stored.owner,
      repo: params.repo || stored.repo,
      path: params.path ?? stored.path,
      branch: params.branch || stored.branch,
    }
  } catch {
    return stored
  }
}
