import { fetch } from "scripting"

const PROJECTS = [
  "镜花水月",
  "和风天气",
  "快递小助手",
  "Github规则更新",
  "panel",
  "CLS Telegraph",
  "Colorful Clouds",
  "书源阅读",
  "Pickup Code",
  "Launch",
  "中國聯通",
  "项目历史管理器",
  "私有脚本仓库同步",
] as const

const RELEASE_BASE = "https://raw.githubusercontent.com/cc166/scripting-scripts/main/releases"
const BACKUP_DIRECTORY = "backup/仓库覆盖更新"
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024
const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_ENTRIES = 2000

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "data",
  "cache",
  "caches",
  "tmp",
  "temp",
])

const EXCLUDED_FILES = new Set([".DS_Store"])

type ProjectName = (typeof PROJECTS)[number]

type ArchiveEntry = {
  relativePath: string
  isDirectory: boolean
  compressedSize: number
  uncompressedSize: number
}

type PreparedProject = {
  name: ProjectName
  archivePath: string
  extractedRoot: string
  remoteVersion: string
  archiveBytes: number
  remoteFiles: string[]
}

type PlannedChange = {
  project: ProjectName
  relativePath: string
  targetPath: string
  data: Data
  status: "updated" | "created"
  oldVersion?: string
  newVersion?: string
}

type JournalEntry = {
  change: PlannedChange
  rollbackPath?: string
  originalHash?: string
}

type UpdateSummary = {
  updated: string[]
  unchanged: string[]
  created: string[]
  versionChanges: Array<{ project: string; from: string; to: string }>
  backups: Array<{ project: string; path: string; sha256: string }>
  failures: string[]
  rolledBack: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function timestamp(): string {
  const date = new Date()
  const pad = (value: number, width = 2) => String(value).padStart(width, "0")
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`
  )
}

function join(root: string, relativePath: string): string {
  return relativePath ? `${root}/${relativePath}` : root
}

function hash(data: Data): string {
  return Crypto.sha256(data).toHexString()
}

function requiredData(data: Data | null, context: string): Data {
  if (data == null) throw new Error(`data conversion failed: ${context}`)
  return data
}

async function readData(path: string): Promise<Data> {
  if (FileManager.isFileStoredIniCloud(path) && !FileManager.isiCloudFileDownloaded(path)) {
    const downloaded = await FileManager.downloadFileFromiCloud(path)
    if (!downloaded) throw new Error(`iCloud download failed: ${path}`)
  }
  return FileManager.readAsData(path)
}

function relativeEntry(root: string, entry: string): { absolutePath: string; relativePath: string } {
  const relativePath = entry.startsWith(`${root}/`)
    ? entry.slice(root.length + 1)
    : entry.replace(/^\.\//, "")
  return {
    absolutePath: entry.startsWith("/") ? entry : join(root, relativePath),
    relativePath,
  }
}

function validateRelativePath(path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new Error(`dangerous archive path: ${JSON.stringify(path)}`)
  }

  const hasTrailingSlash = path.endsWith("/")
  const raw = hasTrailingSlash ? path.slice(0, -1) : path
  const segments = raw.split("/")
  if (
    !raw ||
    segments.some(segment => !segment || segment === "." || segment === ".." || /[\u0000-\u001f\u007f]/.test(segment)) ||
    /^[A-Za-z]:/.test(segments[0])
  ) {
    throw new Error(`dangerous archive path: ${JSON.stringify(path)}`)
  }

  const normalized = segments.join("/").normalize("NFC")
  return hasTrailingSlash ? `${normalized}/` : normalized
}

function isExcluded(relativePath: string): boolean {
  const path = relativePath.endsWith("/") ? relativePath.slice(0, -1) : relativePath
  const segments = path.split("/")
  const fileName = segments[segments.length - 1]
  return (
    segments.some(segment => EXCLUDED_DIRECTORIES.has(segment.toLocaleLowerCase())) ||
    EXCLUDED_FILES.has(fileName) ||
    fileName.toLocaleLowerCase() === ".env" ||
    fileName.toLocaleLowerCase().startsWith(".env.") ||
    fileName.toLocaleLowerCase().endsWith(".log") ||
    fileName.toLocaleLowerCase().endsWith(".bak") ||
    fileName.endsWith("~") ||
    fileName.toLocaleLowerCase().endsWith(".tmp") ||
    fileName.toLocaleLowerCase().includes(".tmp.")
  )
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("truncated ZIP structure")
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error("truncated ZIP structure")
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  )
}

function decodeUtf8(bytes: Uint8Array, offset: number, length: number): string {
  const end = offset + length
  if (offset < 0 || end > bytes.length) throw new Error("truncated ZIP filename")
  let result = ""

  for (let cursor = offset; cursor < end; ) {
    const first = bytes[cursor++]
    if (first < 0x80) {
      if (first === 0) throw new Error("ZIP filename contains NUL")
      result += String.fromCharCode(first)
      continue
    }

    let codePoint: number
    let continuationCount: number
    if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f
      continuationCount = 1
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f
      continuationCount = 2
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07
      continuationCount = 3
    } else {
      throw new Error("ZIP filename is not valid UTF-8")
    }

    if (cursor + continuationCount > end) throw new Error("truncated UTF-8 ZIP filename")
    for (let index = 0; index < continuationCount; index++) {
      const next = bytes[cursor++]
      if ((next & 0xc0) !== 0x80) throw new Error("ZIP filename is not valid UTF-8")
      codePoint = (codePoint << 6) | (next & 0x3f)
    }

    if (
      (continuationCount === 2 && codePoint < 0x800) ||
      (continuationCount === 3 && codePoint < 0x10000) ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      throw new Error("ZIP filename uses an invalid UTF-8 code point")
    }

    if (codePoint <= 0xffff) {
      result += String.fromCharCode(codePoint)
    } else {
      const adjusted = codePoint - 0x10000
      result += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff))
    }
  }

  return result
}

function validateExtraFields(bytes: Uint8Array, offset: number, length: number): void {
  const end = offset + length
  if (end > bytes.length) throw new Error("truncated ZIP extra field")
  let cursor = offset
  while (cursor < end) {
    if (cursor + 4 > end) throw new Error("malformed ZIP extra field")
    const identifier = readUInt16(bytes, cursor)
    const fieldLength = readUInt16(bytes, cursor + 2)
    cursor += 4
    if (cursor + fieldLength > end) throw new Error("malformed ZIP extra field")
    if (identifier === 0x0001) throw new Error("ZIP64 archives are not accepted")
    cursor += fieldLength
  }
}

function inspectArchive(bytes: Uint8Array): ArchiveEntry[] {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("archive exceeds compressed size limit")
  const minimumEocd = 22
  const searchStart = Math.max(0, bytes.length - 65557)
  let eocd = -1
  for (let cursor = bytes.length - minimumEocd; cursor >= searchStart; cursor--) {
    if (readUInt32(bytes, cursor) === 0x06054b50 && cursor + minimumEocd + readUInt16(bytes, cursor + 20) === bytes.length) {
      eocd = cursor
      break
    }
  }
  if (eocd < 0) throw new Error("ZIP end record not found")

  const disk = readUInt16(bytes, eocd + 4)
  const centralDisk = readUInt16(bytes, eocd + 6)
  const diskEntries = readUInt16(bytes, eocd + 8)
  const entryCount = readUInt16(bytes, eocd + 10)
  const centralSize = readUInt32(bytes, eocd + 12)
  const centralOffset = readUInt32(bytes, eocd + 16)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error("multi-disk ZIP is not accepted")
  if (entryCount === 0 || entryCount > MAX_ENTRIES) throw new Error("ZIP entry count is outside the allowed range")
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not accepted")
  }
  if (centralOffset + centralSize !== eocd) throw new Error("malformed ZIP central directory")

  const entries: ArchiveEntry[] = []
  const seen = new Set<string>()
  let expandedBytes = 0
  let cursor = centralOffset

  for (let index = 0; index < entryCount; index++) {
    if (readUInt32(bytes, cursor) !== 0x02014b50) throw new Error("malformed ZIP central directory entry")
    const versionMadeBy = readUInt16(bytes, cursor + 4)
    const flags = readUInt16(bytes, cursor + 8)
    const method = readUInt16(bytes, cursor + 10)
    const compressedSize = readUInt32(bytes, cursor + 20)
    const uncompressedSize = readUInt32(bytes, cursor + 24)
    const nameLength = readUInt16(bytes, cursor + 28)
    const extraLength = readUInt16(bytes, cursor + 30)
    const commentLength = readUInt16(bytes, cursor + 32)
    const diskStart = readUInt16(bytes, cursor + 34)
    const externalAttributes = readUInt32(bytes, cursor + 38)
    const localOffset = readUInt32(bytes, cursor + 42)
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength
    if (entryEnd > eocd) throw new Error("truncated ZIP central directory entry")
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) throw new Error("encrypted ZIP entries are not accepted")
    if (method !== 0 && method !== 8) throw new Error(`unsupported ZIP compression method: ${method}`)
    if (diskStart !== 0) throw new Error("multi-disk ZIP entry is not accepted")
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not accepted")
    }
    validateExtraFields(bytes, cursor + 46 + nameLength, extraLength)

    const rawNameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength)
    if ((flags & 0x0800) === 0 && rawNameBytes.some(value => value >= 0x80)) {
      throw new Error("non-ASCII ZIP filenames must declare UTF-8")
    }
    const relativePath = validateRelativePath(decodeUtf8(bytes, cursor + 46, nameLength))
    const collisionKey = relativePath.replace(/\/$/, "").toLocaleLowerCase()
    if (seen.has(collisionKey)) throw new Error(`duplicate or case-colliding ZIP path: ${relativePath}`)
    seen.add(collisionKey)
    if (isExcluded(relativePath)) throw new Error(`archive contains excluded path: ${relativePath}`)

    const isDirectory = relativePath.endsWith("/")
    const platform = versionMadeBy >> 8
    const mode = externalAttributes >>> 16
    if (platform === 3 && mode !== 0) {
      const fileType = mode & 0xf000
      if (fileType === 0xa000) throw new Error(`symbolic link is not accepted: ${relativePath}`)
      if (fileType !== 0x4000 && fileType !== 0x8000) throw new Error(`special file is not accepted: ${relativePath}`)
      if ((fileType === 0x4000) !== isDirectory) throw new Error(`ZIP file type mismatch: ${relativePath}`)
    }
    if (isDirectory && uncompressedSize !== 0) throw new Error(`directory entry has data: ${relativePath}`)
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`archive entry exceeds size limit: ${relativePath}`)
    if (compressedSize > 0 && uncompressedSize / compressedSize > 250) {
      throw new Error(`archive entry compression ratio is too high: ${relativePath}`)
    }
    expandedBytes += uncompressedSize
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error("archive exceeds expanded size limit")

    if (readUInt32(bytes, localOffset) !== 0x04034b50) throw new Error(`missing ZIP local header: ${relativePath}`)
    const localFlags = readUInt16(bytes, localOffset + 6)
    const localMethod = readUInt16(bytes, localOffset + 8)
    const localNameLength = readUInt16(bytes, localOffset + 26)
    const localExtraLength = readUInt16(bytes, localOffset + 28)
    const localName = validateRelativePath(decodeUtf8(bytes, localOffset + 30, localNameLength))
    if (localFlags !== flags || localMethod !== method || localName !== relativePath) {
      throw new Error(`ZIP local header mismatch: ${relativePath}`)
    }
    validateExtraFields(bytes, localOffset + 30 + localNameLength, localExtraLength)
    const payloadOffset = localOffset + 30 + localNameLength + localExtraLength
    if (payloadOffset + compressedSize > centralOffset) throw new Error(`ZIP payload is out of bounds: ${relativePath}`)

    entries.push({ relativePath, isDirectory, compressedSize, uncompressedSize })
    cursor = entryEnd
  }

  if (cursor !== eocd) throw new Error("ZIP central directory size mismatch")
  if (!entries.some(entry => entry.relativePath === "script.json" && !entry.isDirectory)) {
    throw new Error("archive root is missing script.json")
  }
  return entries
}

async function downloadArchive(project: ProjectName, destination: string): Promise<Uint8Array> {
  const url = `${RELEASE_BASE}/${encodeURIComponent(project)}.scripting`
  const response = await fetch(url, { timeout: 45, debugLabel: `Repository update: ${project}` })
  if (!response.ok) throw new Error(`download failed for ${project}: HTTP ${response.status}`)
  if (!response.url.startsWith(`${RELEASE_BASE}/`)) throw new Error(`unexpected download origin for ${project}`)
  if (response.expectedContentLength != null && response.expectedContentLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`archive is too large for ${project}`)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value == null) continue
      total += value.length
      if (total > MAX_ARCHIVE_BYTES) {
        await reader.cancel("archive size limit exceeded")
        throw new Error(`archive is too large for ${project}`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (total === 0) throw new Error(`empty archive for ${project}`)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  await FileManager.writeAsBytes(destination, bytes)
  const written = await FileManager.readAsData(destination)
  const expected = requiredData(Data.fromUint8Array(bytes), `download ${project}`)
  if (hash(written) !== hash(expected)) throw new Error(`download write verification failed for ${project}`)
  return bytes
}

function parseMetadata(path: string, expectedName: ProjectName, source: "live" | "remote"): Record<string, any> {
  let metadata: unknown
  try {
    metadata = JSON.parse(FileManager.readAsStringSync(path))
  } catch (error) {
    throw new Error(`${source} script.json is invalid for ${expectedName}: ${errorText(error)}`)
  }
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${source} script.json must be an object for ${expectedName}`)
  }
  const record = metadata as Record<string, any>
  if (record.name !== expectedName) throw new Error(`${source} script name mismatch for ${expectedName}`)
  if (source === "remote" && (typeof record.version !== "string" || record.version.trim() === "")) {
    throw new Error(`remote version is invalid for ${expectedName}`)
  }
  return record
}

async function prepareProject(project: ProjectName, workRoot: string): Promise<PreparedProject> {
  const archivePath = join(workRoot, `${encodeURIComponent(project)}.scripting`)
  const extractedRoot = join(workRoot, `extracted-${encodeURIComponent(project)}`)
  const bytes = await downloadArchive(project, archivePath)
  const entries = inspectArchive(bytes)
  await FileManager.createDirectory(extractedRoot, true)
  await FileManager.unzip(archivePath, extractedRoot)

  const extractedEntries = (await FileManager.readDirectory(extractedRoot, true)).map(entry =>
    relativeEntry(extractedRoot, entry),
  )
  const archiveFiles = new Set(entries.filter(entry => !entry.isDirectory).map(entry => entry.relativePath))
  const extractedFiles: string[] = []
  let expandedBytes = 0

  for (const item of extractedEntries) {
    const relativePath = validateRelativePath(item.relativePath)
    if (FileManager.isLinkSync(item.absolutePath)) throw new Error(`extracted symbolic link is not accepted: ${project}/${relativePath}`)
    if (FileManager.isFileSync(item.absolutePath)) {
      if (!archiveFiles.has(relativePath)) throw new Error(`unexpected extracted file: ${project}/${relativePath}`)
      const size = FileManager.statSync(item.absolutePath).size
      if (size > MAX_ENTRY_BYTES) throw new Error(`extracted file exceeds size limit: ${project}/${relativePath}`)
      expandedBytes += size
      extractedFiles.push(relativePath)
    } else if (!FileManager.isDirectorySync(item.absolutePath)) {
      throw new Error(`unsupported extracted item: ${project}/${relativePath}`)
    }
  }
  if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error(`extracted project exceeds size limit: ${project}`)
  if (extractedFiles.length !== archiveFiles.size) throw new Error(`extracted file set mismatch for ${project}`)

  const remoteMetadata = parseMetadata(join(extractedRoot, "script.json"), project, "remote")
  return {
    name: project,
    archivePath,
    extractedRoot,
    remoteVersion: remoteMetadata.version,
    archiveBytes: bytes.length,
    remoteFiles: extractedFiles.filter(path => path !== "script.json").sort(),
  }
}

function assertLiveProjects(): Map<ProjectName, Record<string, any>> {
  const metadata = new Map<ProjectName, Record<string, any>>()
  for (const project of PROJECTS) {
    const root = join(FileManager.scriptsDirectory, project)
    if (!FileManager.isDirectorySync(root) || FileManager.isLinkSync(root)) {
      throw new Error(`allowlisted live project directory is missing or unsafe: ${project}`)
    }
    const scriptJson = join(root, "script.json")
    if (!FileManager.isFileSync(scriptJson) || FileManager.isLinkSync(scriptJson)) {
      throw new Error(`live root script.json is missing or unsafe: ${project}`)
    }
    metadata.set(project, parseMetadata(scriptJson, project, "live"))
  }
  return metadata
}

function assertDestinationSafe(project: ProjectName, relativePath: string): string {
  const projectRoot = join(FileManager.scriptsDirectory, project)
  const safeRelativePath = validateRelativePath(relativePath)
  const segments = safeRelativePath.split("/")
  let current = projectRoot
  for (let index = 0; index < segments.length - 1; index++) {
    current = join(current, segments[index])
    if (FileManager.existsSync(current) && (!FileManager.isDirectorySync(current) || FileManager.isLinkSync(current))) {
      throw new Error(`unsafe live parent path: ${project}/${segments.slice(0, index + 1).join("/")}`)
    }
  }
  const target = join(projectRoot, safeRelativePath)
  if (FileManager.existsSync(target) && (!FileManager.isFileSync(target) || FileManager.isLinkSync(target))) {
    throw new Error(`unsafe live destination: ${project}/${safeRelativePath}`)
  }
  return target
}

async function planChanges(
  prepared: PreparedProject[],
  liveMetadata: Map<ProjectName, Record<string, any>>,
  summary: UpdateSummary,
): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = []
  for (const item of prepared) {
    for (const relativePath of item.remoteFiles) {
      const targetPath = assertDestinationSafe(item.name, relativePath)
      const data = await FileManager.readAsData(join(item.extractedRoot, relativePath))
      if (FileManager.existsSync(targetPath)) {
        const current = await readData(targetPath)
        if (hash(current) === hash(data)) {
          summary.unchanged.push(`${item.name}/${relativePath}`)
        } else {
          changes.push({ project: item.name, relativePath, targetPath, data, status: "updated" })
        }
      } else {
        changes.push({ project: item.name, relativePath, targetPath, data, status: "created" })
      }
    }

    const local = liveMetadata.get(item.name)
    if (!local) throw new Error(`missing preflight metadata for ${item.name}`)
    if (local.name !== item.name) throw new Error(`live script name changed during preflight: ${item.name}`)
    const oldVersion = typeof local.version === "string" ? local.version : ""
    if (oldVersion === item.remoteVersion) {
      summary.unchanged.push(`${item.name}/script.json`)
      continue
    }
    const targetPath = assertDestinationSafe(item.name, "script.json")
    const nextMetadata = { ...local, version: item.remoteVersion }
    changes.push({
      project: item.name,
      relativePath: "script.json",
      targetPath,
      data: requiredData(Data.fromString(`${JSON.stringify(nextMetadata, null, 2)}\n`), `${item.name}/script.json`),
      status: "updated",
      oldVersion,
      newVersion: item.remoteVersion,
    })
  }
  return changes
}

async function ensureTreeDownloaded(root: string): Promise<void> {
  const entries = await FileManager.readDirectory(root, true)
  for (const entry of entries) {
    const item = relativeEntry(root, entry)
    if (FileManager.isLinkSync(item.absolutePath)) throw new Error(`live backup contains symbolic link: ${item.relativePath}`)
    if (FileManager.isFileSync(item.absolutePath)) await readData(item.absolutePath)
  }
}

function collectFiles(root: string): Array<{ absolutePath: string; relativePath: string }> {
  return FileManager.readDirectorySync(root, true)
    .map(entry => relativeEntry(root, entry))
    .filter(item => FileManager.isFileSync(item.absolutePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function verifyBackup(project: ProjectName, liveRoot: string, backupPath: string, verifyRoot: string): Promise<void> {
  await FileManager.createDirectory(verifyRoot, true)
  await FileManager.unzip(backupPath, verifyRoot)
  const restoredRoot = join(verifyRoot, project)
  if (!FileManager.isDirectorySync(restoredRoot)) throw new Error(`backup root mismatch: ${project}`)

  const liveFiles = collectFiles(liveRoot)
  const restoredFiles = collectFiles(restoredRoot)
  if (
    liveFiles.length !== restoredFiles.length ||
    liveFiles.some((item, index) => item.relativePath !== restoredFiles[index].relativePath)
  ) {
    throw new Error(`backup file set mismatch: ${project}`)
  }
  for (let index = 0; index < liveFiles.length; index++) {
    const liveData = await readData(liveFiles[index].absolutePath)
    const restoredData = await FileManager.readAsData(restoredFiles[index].absolutePath)
    if (hash(liveData) !== hash(restoredData)) {
      throw new Error(`backup SHA-256 mismatch: ${project}/${liveFiles[index].relativePath}`)
    }
  }
  await FileManager.remove(verifyRoot)
}

async function prepareBackups(
  backupRoot: string,
  rollbackRoot: string,
  changes: PlannedChange[],
  summary: UpdateSummary,
): Promise<Map<string, JournalEntry>> {
  await FileManager.createDirectory(backupRoot, true)
  await FileManager.createDirectory(rollbackRoot, true)

  for (const project of PROJECTS) {
    const liveRoot = join(FileManager.scriptsDirectory, project)
    await ensureTreeDownloaded(liveRoot)
    const backupPath = join(backupRoot, `${project}.zip`)
    await FileManager.zip(liveRoot, backupPath, true)
    if (!FileManager.isFileSync(backupPath) || FileManager.statSync(backupPath).size <= 0) {
      throw new Error(`persistent backup verification failed: ${project}`)
    }
    const backupData = await readData(backupPath)
    await verifyBackup(project, liveRoot, backupPath, join(rollbackRoot, `backup-verify-${encodeURIComponent(project)}`))
    summary.backups.push({ project, path: backupPath, sha256: hash(backupData) })
  }

  const journal = new Map<string, JournalEntry>()
  for (const change of changes) {
    if (change.status === "created") {
      journal.set(change.targetPath, { change })
      continue
    }
    const rollbackPath = join(rollbackRoot, `${change.project}/${change.relativePath}`)
    const separator = rollbackPath.lastIndexOf("/")
    await FileManager.createDirectory(rollbackPath.slice(0, separator), true)
    const original = await readData(change.targetPath)
    await FileManager.copyFile(change.targetPath, rollbackPath)
    const rollbackData = await FileManager.readAsData(rollbackPath)
    const originalHash = hash(original)
    if (hash(rollbackData) !== originalHash) throw new Error(`rollback copy verification failed: ${change.project}/${change.relativePath}`)
    journal.set(change.targetPath, { change, rollbackPath, originalHash })
  }
  return journal
}

async function ensureParentDirectories(project: ProjectName, relativePath: string, createdDirectories: string[]): Promise<void> {
  const segments = relativePath.split("/")
  let current = join(FileManager.scriptsDirectory, project)
  for (let index = 0; index < segments.length - 1; index++) {
    current = join(current, segments[index])
    if (!FileManager.existsSync(current)) {
      await FileManager.createDirectory(current, false)
      createdDirectories.push(current)
    }
  }
}

async function writeVerified(change: PlannedChange): Promise<void> {
  await FileManager.writeAsData(change.targetPath, change.data)
  const written = await FileManager.readAsData(change.targetPath)
  if (hash(written) !== hash(change.data)) {
    throw new Error(`post-write SHA-256 mismatch: ${change.project}/${change.relativePath}`)
  }
}

async function rollback(
  applied: JournalEntry[],
  createdDirectories: string[],
  summary: UpdateSummary,
): Promise<void> {
  summary.rolledBack = true
  summary.updated = []
  summary.created = []
  summary.versionChanges = []
  for (const entry of [...applied].reverse()) {
    const label = `${entry.change.project}/${entry.change.relativePath}`
    try {
      if (entry.change.status === "created") {
        if (FileManager.existsSync(entry.change.targetPath)) await FileManager.remove(entry.change.targetPath)
      } else {
        if (!entry.rollbackPath || !entry.originalHash) throw new Error("rollback metadata is missing")
        if (FileManager.existsSync(entry.change.targetPath)) await FileManager.remove(entry.change.targetPath)
        await FileManager.copyFile(entry.rollbackPath, entry.change.targetPath)
        const restored = await FileManager.readAsData(entry.change.targetPath)
        if (hash(restored) !== entry.originalHash) throw new Error("restored SHA-256 mismatch")
      }
    } catch (error) {
      summary.failures.push(`rollback ${label}: ${errorText(error)}`)
    }
  }

  for (const directory of [...createdDirectories].reverse()) {
    try {
      if (FileManager.isDirectorySync(directory) && FileManager.readDirectorySync(directory, false).length === 0) {
        await FileManager.remove(directory)
      }
    } catch (error) {
      summary.failures.push(`rollback directory ${directory}: ${errorText(error)}`)
    }
  }
}

export async function updateRepository(): Promise<UpdateSummary> {
  const summary: UpdateSummary = {
    updated: [],
    unchanged: [],
    created: [],
    versionChanges: [],
    backups: [],
    failures: [],
    rolledBack: false,
  }
  const runId = timestamp()
  const workRoot = join(FileManager.temporaryDirectory, `repository-update-${runId}`)
  const rollbackRoot = join(workRoot, "rollback")
  let applied: JournalEntry[] = []
  const createdDirectories: string[] = []

  try {
    if (!FileManager.isiCloudEnabled) throw new Error("iCloud is unavailable; persistent backups cannot be created")
    const liveMetadata = assertLiveProjects()
    await FileManager.createDirectory(workRoot, true)

    const prepared: PreparedProject[] = []
    let totalArchiveBytes = 0
    for (const project of PROJECTS) {
      const item = await prepareProject(project, workRoot)
      totalArchiveBytes += item.archiveBytes
      if (totalArchiveBytes > MAX_TOTAL_ARCHIVE_BYTES) {
        throw new Error("combined archives exceed total size limit")
      }
      prepared.push(item)
    }
    const changes = await planChanges(prepared, liveMetadata, summary)

    const backupRoot = join(FileManager.iCloudDocumentsDirectory, `${BACKUP_DIRECTORY}/${runId}`)
    const journal = await prepareBackups(backupRoot, rollbackRoot, changes, summary)

    for (const change of changes) {
      const entry = journal.get(change.targetPath)
      if (!entry) throw new Error(`rollback journal is missing: ${change.project}/${change.relativePath}`)
      if (change.status === "created") {
        if (FileManager.existsSync(change.targetPath)) {
          throw new Error(`live destination appeared after preflight: ${change.project}/${change.relativePath}`)
        }
      } else {
        if (!entry.originalHash || !FileManager.isFileSync(change.targetPath)) {
          throw new Error(`live destination changed after preflight: ${change.project}/${change.relativePath}`)
        }
        const current = await readData(change.targetPath)
        if (hash(current) !== entry.originalHash) {
          throw new Error(`live file changed after preflight: ${change.project}/${change.relativePath}`)
        }
      }
      applied.push(entry)
      await ensureParentDirectories(change.project, change.relativePath, createdDirectories)
      await writeVerified(change)
      const label = `${change.project}/${change.relativePath}`
      summary[change.status].push(label)
      if (change.oldVersion !== undefined && change.newVersion !== undefined) {
        summary.versionChanges.push({ project: change.project, from: change.oldVersion, to: change.newVersion })
      }
    }
  } catch (error) {
    summary.failures.push(errorText(error))
    if (applied.length > 0 || createdDirectories.length > 0) {
      await rollback(applied, createdDirectories, summary)
    }
  } finally {
    try {
      if (FileManager.existsSync(workRoot)) await FileManager.remove(workRoot)
    } catch (error) {
      summary.failures.push(`temporary cleanup: ${errorText(error)}`)
    }
  }

  return summary
}
