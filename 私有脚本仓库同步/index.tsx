import { Script } from "scripting"

const OWNER = "cc166"
const REPO = "scripting-scripts"
const BRANCH = "main"
const SOURCE_ROOT = `${FileManager.iCloudDocumentsDirectory}/scripting-repos/scripting-scripts`

const RELEASES_ROOT = `${SOURCE_ROOT}/releases`

const PROJECTS = new Set([
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
])

const ROOT_FILES = new Set([".gitignore", "README.md", "THIRD_PARTY_NOTICES.md"])
const RELEASE_DIRECTORY = "releases"

type SyncResult = {
  packaged: number
  scanned: number
  created: number
  updated: number
  unchanged: number
  verified: number
  failures: string[]
}

function shouldExclude(relativePath: string): boolean {
  const segments = relativePath.split("/")
  const name = segments[segments.length - 1]

  if (segments.some(segment => ["node_modules", "dist", "build", "coverage"].includes(segment))) {
    return true
  }

  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".log") ||
    name.endsWith(".bak") ||
    name.endsWith("~") ||
    name.endsWith(".tmp") ||
    name.includes(".tmp.")
  )
}

function isTrackedPath(relativePath: string): boolean {
  if (!relativePath.includes("/")) {
    return ROOT_FILES.has(relativePath)
  }

  const root = relativePath.split("/", 1)[0]
  return root === RELEASE_DIRECTORY || PROJECTS.has(root)
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function isNotFound(error: unknown): boolean {
  const text = errorText(error).toLowerCase()
  return text.includes("404") || text.includes("not found")
}

function digest(data: Data): string {
  return Crypto.sha256(data).toHexString()
}

async function readLocalData(path: string): Promise<Data> {
  if (FileManager.isFileStoredIniCloud(path) && !FileManager.isiCloudFileDownloaded(path)) {
    const downloaded = await FileManager.downloadFileFromiCloud(path)
    if (!downloaded) {
      throw new Error("iCloud file download failed")
    }
  }

  return FileManager.readAsData(path)
}

async function prepareReleasePackages(): Promise<number> {
  FileManager.createDirectorySync(RELEASES_ROOT, true)

  for (const project of PROJECTS) {
    const projectPath = `${SOURCE_ROOT}/${project}`
    if (!FileManager.isDirectorySync(projectPath)) {
      throw new Error(`tracked project missing locally: ${project}`)
    }

    const projectFiles = (await FileManager.readDirectory(projectPath, true))
      .map(path => (path.startsWith("/") ? path : `${projectPath}/${path.replace(/^\.\//, "")}`))
      .filter(path => FileManager.isFileSync(path))

    for (const path of projectFiles) {
      if (FileManager.isFileStoredIniCloud(path) && !FileManager.isiCloudFileDownloaded(path)) {
        const downloaded = await FileManager.downloadFileFromiCloud(path)
        if (!downloaded) throw new Error(`iCloud file download failed: ${path}`)
      }
    }

    const outputPath = `${RELEASES_ROOT}/${project}.scripting`
    if (FileManager.existsSync(outputPath)) FileManager.removeSync(outputPath)
    await FileManager.zip(projectPath, outputPath, false)

    const verifyPath = `${FileManager.temporaryDirectory}/scripting-release-verify-${encodeURIComponent(project)}`
    if (FileManager.existsSync(verifyPath)) FileManager.removeSync(verifyPath)
    await FileManager.createDirectory(verifyPath, true)
    await FileManager.unzip(outputPath, verifyPath)
    if (!FileManager.isFileSync(`${verifyPath}/script.json`)) {
      throw new Error(`release archive root missing script.json: ${project}`)
    }
    FileManager.removeSync(verifyPath)
    console.log(`[packaged] releases/${project}.scripting`)
  }

  return PROJECTS.size
}

async function getRemoteFile(path: string): Promise<Record<string, any> | null> {
  try {
    const result = await GitHub.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH })
    if (Array.isArray(result)) {
      throw new Error("remote path is a directory")
    }
    return result
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function syncFile(relativePath: string, localData: Data): Promise<"created" | "updated" | "unchanged"> {
  const remote = await getRemoteFile(relativePath)

  if (remote) {
    const remoteData = await GitHub.getBlob({ owner: OWNER, repo: REPO, sha: String(remote.sha) })
    if (digest(remoteData) === digest(localData)) {
      return "unchanged"
    }
  }

  const upload = await GitHub.putContent({
    owner: OWNER,
    repo: REPO,
    path: relativePath,
    branch: BRANCH,
    message: `${remote ? "sync" : "import"}: ${relativePath}`,
    content: localData,
    sha: remote ? String(remote.sha) : undefined,
    committer: {
      name: "cc166",
      email: "85510810+cc166@users.noreply.github.com",
    },
  })

  const uploadedSha = String(upload.content?.sha ?? "")
  if (!uploadedSha) {
    throw new Error("GitHub upload response missing content SHA")
  }
  const uploaded = await GitHub.getBlob({ owner: OWNER, repo: REPO, sha: uploadedSha })
  if (digest(uploaded) !== digest(localData)) {
    throw new Error("uploaded blob verification hash mismatch")
  }

  return remote ? "updated" : "created"
}

async function run(): Promise<void> {
  const result: SyncResult = {
    packaged: 0,
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    verified: 0,
    failures: [],
  }

  try {
    if (!FileManager.isiCloudEnabled) {
      throw new Error("iCloud is unavailable")
    }
    if (!FileManager.existsSync(SOURCE_ROOT)) {
      throw new Error(`controlled repository not found: ${SOURCE_ROOT}`)
    }

    result.packaged = await prepareReleasePackages()

    const availability = GitHub.getAvailability()
    if (!availability.available) {
      throw new Error(
        availability.tokenConfigured
          ? "GitHub API is unavailable in the current Scripting plan"
          : "GitHub token is not configured in Scripting Settings",
      )
    }

    const granted = await GitHub.requestPermissions(["read_contents", "write_contents"])
    if (!granted.includes("read_contents") || !granted.includes("write_contents")) {
      throw new Error("read_contents and write_contents permissions are required")
    }

    const paths = (await FileManager.readDirectory(SOURCE_ROOT, true))
      .map(path => {
        const relativePath = path.startsWith(`${SOURCE_ROOT}/`)
          ? path.slice(SOURCE_ROOT.length + 1)
          : path.replace(/^\.\//, "")
        const absolutePath = path.startsWith("/") ? path : `${SOURCE_ROOT}/${relativePath}`
        return { absolutePath, relativePath }
      })
      .filter(item => FileManager.isFileSync(item.absolutePath))
      .filter(item => isTrackedPath(item.relativePath) && !shouldExclude(item.relativePath))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    const discoveredProjects = new Set(
      paths
        .map(item => item.relativePath.split("/")[0])
        .filter(name => PROJECTS.has(name)),
    )
    const missingProjects = [...PROJECTS].filter(name => !discoveredProjects.has(name))
    if (missingProjects.length > 0) {
      throw new Error(`tracked projects missing locally: ${missingProjects.join(", ")}`)
    }

    result.scanned = paths.length
    console.log(`Syncing ${paths.length} controlled files to ${OWNER}/${REPO}...`)

    for (const item of paths) {
      try {
        const localData = await readLocalData(item.absolutePath)
        const status = await syncFile(item.relativePath, localData)
        result[status] += 1
        if (status !== "unchanged") result.verified += 1
        console.log(`[${status}] ${item.relativePath}`)
      } catch (error) {
        const failure = `${item.relativePath}: ${errorText(error)}`
        result.failures.push(failure)
        console.error(`[failed] ${failure}`)
      }
    }
  } catch (error) {
    result.failures.push(errorText(error))
  }

  console.log(JSON.stringify(result, null, 2))
  Script.exit()
}

run()
