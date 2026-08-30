import { AppConfig } from "../types"
import { configPath, defaultBackupRoot, defaultProjectRoot } from "../constants"
import { isDirectory, pathExists } from "../utils/fs"

// 补齐缺失字段，保证配置结构完整
export function normalizeConfig(config: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    backupRoot: config?.backupRoot || defaultBackupRoot,
    projectRoot: config?.projectRoot || defaultProjectRoot,
    backupBookmarkName: config?.backupBookmarkName || null,
    projectBookmarkName: config?.projectBookmarkName || null,
  }
}

export function resolveConfig(): AppConfig {
  if (!pathExists(configPath)) {
    return normalizeConfig(null)
  }

  try {
    const saved = JSON.parse(FileManager.readAsStringSync(configPath)) as Partial<AppConfig>
    return normalizeConfig(saved)
  } catch {
    return normalizeConfig(null)
  }
}

export function saveConfig(config: AppConfig) {
  const nextConfig = normalizeConfig(config)
  FileManager.writeAsStringSync(configPath, JSON.stringify(nextConfig, null, 2))
}

export function validateDirectory(path: string, setStatus: (status: string) => void) {
  if (!path.trim()) {
    setStatus("路径不能为空")
    return false
  }

  if (!pathExists(path) || !isDirectory(path)) {
    setStatus("路径不存在或不是文件夹")
    return false
  }

  return true
}

export async function pickDirectory(initialDirectory: string) {
  return DocumentPicker.pickDirectory(
    pathExists(initialDirectory) ? initialDirectory : FileManager.iCloudDocumentsDirectory,
  )
}
