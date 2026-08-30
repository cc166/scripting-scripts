import { Path } from "scripting"

// 配置文件与默认路径
export const configPath = Path.join(
  FileManager.appGroupDocumentsDirectory,
  "project-history-manager-config.json",
)
export const defaultBackupRoot = Path.join(FileManager.iCloudDocumentsDirectory, "backup")
export const defaultProjectRoot = FileManager.scriptsDirectory
export const managerProjectName = "项目历史管理器"
export const managerProjectPath = Path.join(defaultProjectRoot, managerProjectName)

// 错误提示配色
export const errorColor = "#FF3B30"
