import {
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Text,
  Picker,
  ForEach,
  HStack,
  VStack,
  Spacer,
  Image,
  EditButton,
  Editor,
  ProgressView,
  useObservable,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Navigation,
  Script,
  Widget,
  fetch,
} from 'scripting'
import { loadIntentTarget, saveIntentTarget } from './services/rule_append'

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
  remove(key: string): void
}
declare const Data: {
  fromBase64String(base64: string): { toRawString(): string | null } | null
  fromRawString(str: string, encoding: string): { toBase64String(): string } | null
}
declare const Dialog: {
  alert(options: { title: string; message: string }): Promise<void>
}
declare const Pasteboard: {
  setString(string: string | null): Promise<void>
}

// =============== 类型与常量 ===============

type RuleStatus = 'unchanged' | 'added' | 'modified'
const RAW_TYPE = '__RAW__'   // 占位类型：注释/空行/无法解析的行
const ALL_TYPES = '__ALL__'

interface Rule {
  id: string
  prefix: string     // 行首前缀；YAML 列表项会保留 "  - " 之类的缩进
  type: string       // 如 DOMAIN-SUFFIX；RAW_TYPE 表示原样保留行
  value: string      // 如 github.io；RAW_TYPE 时即整行原文
  trailing: string   // 紧跟值的剩余部分，如 ',Proxy,no-resolve'（含前导逗号）
  comment: string    // 行尾注释，如 '# github 域名'
  status: RuleStatus
}

interface ParsedFile {
  preamble: string[]   // 首条规则之前的注释/空行（保留原样）
  rules: Rule[]
  defaultRulePrefix: string
  trailingNewline: boolean
}

interface FileItem {
  id: string
  name: string
  path: string
  sha: string
  rawUrl?: string
}

interface BrowserItem {
  id: string                      // 用于 ForEach key（即 path）
  name: string
  path: string                    // 完整路径
  type: 'file' | 'dir'
  sha: string
  size: number                    // 字节，仅 file 有意义
  rawUrl?: string                  // GitHub Contents API 返回的 download_url
}

interface Config {
  token: string
  owner: string
  repo: string
  path: string                    // 起始路径（可选），下次进入默认到此
  branch: string
}

const CONFIG_KEY = 'github_config'
const LAST_PATH_KEY = 'github_last_path'   // 记忆上次浏览到的目录
const DEFAULT_BRANCH_CACHE_KEY = 'github_default_branch_cache'

// =============== Path 工具 ===============

/** 路径每段单独 encode（保留 `/` 分隔） */
function encodeURIPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

/** 取上级目录路径（根目录返回 ''） */
function parentPath(p: string): string {
  const segs = p.split('/').filter(Boolean)
  segs.pop()
  return segs.join('/')
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1) : 'txt'
}

function rawFileUrl(cfg: Config, path: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner.trim())}/${encodeURIComponent(cfg.repo.trim())}/${encodeURIPath(preferredBranch(cfg))}/${encodeURIPath(path)}`
}

/** 把 GitHub 错误状态码转成更友好的 Error */
function friendlyError(status: number, fallback?: string): Error {
  const suffix = fallback ? `：${fallback}` : ''
  let message: string
  if (status === 401) message = `鉴权失败：token 无效、已过期，或 Authorization 格式不被接受${suffix}`
  else if (status === 403) message = `权限不足或被 GitHub 拒绝：私有仓库需要 token 包含 repo scope；fine-grained token 需要该仓库 Contents: Read/Write 权限${suffix}`
  else if (status === 404) message = `找不到路径、仓库或分支；私有仓库也可能是 token 没有被授权访问该仓库${suffix}`
  else if (status === 409) message = `远端已变更，请刷新后重试${suffix}`
  else if (status === 422) message = `提交参数有误${suffix}`
  else message = fallback ? `请求失败 (${status})：${fallback}` : `请求失败 (${status})`

  const err = new Error(message) as Error & { status?: number; githubMessage?: string }
  err.status = status
  err.githubMessage = fallback
  return err
}

function githubHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    // GitHub REST API accepts PAT as Bearer; trim 避免复制 token 时混入空白/换行。
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // Scripting 的 fetch 是 native 实现；显式 UA 可避免 GitHub 拒绝无 UA 请求。
    'User-Agent': 'Scripting-Github-Rules-Updater',
    ...extra,
  }
}

type GitHubResponse = Awaited<ReturnType<typeof fetch>>

async function githubError(res: GitHubResponse): Promise<Error> {
  const body = await res.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message : res.statusText
  return friendlyError(res.status, message)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: any
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function repoKey(cfg: Config): string {
  return `${cfg.owner.trim()}/${cfg.repo.trim()}`.toLowerCase()
}

function repoApiBase(cfg: Config): string {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner.trim())}/${encodeURIComponent(cfg.repo.trim())}`
}

function getCachedDefaultBranch(cfg: Config): string {
  const cache = Storage.get<Record<string, string>>(DEFAULT_BRANCH_CACHE_KEY) ?? {}
  return cache[repoKey(cfg)] ?? ''
}

function setCachedDefaultBranch(cfg: Config, branch: string) {
  if (!branch) return
  const cache = Storage.get<Record<string, string>>(DEFAULT_BRANCH_CACHE_KEY) ?? {}
  cache[repoKey(cfg)] = branch
  Storage.set(DEFAULT_BRANCH_CACHE_KEY, cache)
}

function preferredBranch(cfg: Config): string {
  return cfg.branch.trim() || getCachedDefaultBranch(cfg) || 'main'
}

function isMissingBranchError(e: any): boolean {
  const msg = String(e?.githubMessage ?? e?.message ?? e)
  return msg.includes('No commit found for the ref')
}

async function fetchDefaultBranch(cfg: Config): Promise<string> {
  const res = await ghGet(repoApiBase(cfg), cfg.token)
  if (!res.ok) throw await githubError(res)
  const data = await res.json()
  const branch = String(data.default_branch || '').trim()
  if (!branch) throw new Error('仓库没有默认分支，可能是空仓库')
  setCachedDefaultBranch(cfg, branch)
  return branch
}

async function useDefaultBranch(cfg: Config): Promise<string> {
  const branch = await fetchDefaultBranch(cfg)
  // 旧版脚本默认写死 main；遇到 main 不存在时自动修正为仓库默认分支。
  if (cfg.branch !== branch) saveConfig({ ...cfg, branch })
  return branch
}

/** 文件大小友好显示 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// =============== 解析与序列化 ===============

let _idCounter = 0
const newId = () => `r${Date.now().toString(36)}_${++_idCounter}`

function isCommentOrBlank(line: string): boolean {
  const t = line.trim()
  return t === '' || t.startsWith('#') || t.startsWith(';') || t.startsWith('//')
}

/**
 * 解析单行规则；非规则（注释/空行/不规范）返回 null。
 * 兼容 Surge / Clash / QuanX 通用 `TYPE,VALUE[,REST]  # comment` 格式。
 */
function parseRuleLine(raw: string): { prefix: string; type: string; value: string; trailing: string; comment: string } | null {
  const tryParse = (prefix: string, body: string): { prefix: string; type: string; value: string; trailing: string; comment: string } | null => {
    let content = body
    let comment = ''
    const hashIdx = body.indexOf('#')
    if (hashIdx > 0 && /\S/.test(body.slice(0, hashIdx))) {
      content = body.slice(0, hashIdx).trimEnd()
      comment = body.slice(hashIdx)
    }

    const parts = content.split(',')
    if (parts.length < 2) return null

    const type = parts[0].trim()
    const value = parts[1].trim()
    if (!type || !value) return null
    // 类型要像 UPPER-CASE 标识符（适配 DOMAIN / DOMAIN-SUFFIX / IP-CIDR / USER-AGENT 等）
    if (!/^[A-Z][A-Z0-9-]*$/.test(type)) return null

    const trailing = parts.length > 2 ? ',' + parts.slice(2).join(',') : ''
    return { prefix, type, value, trailing, comment }
  }

  const plain = tryParse('', raw)
  if (plain) return plain

  const yamlMatch = raw.match(/^(\s*-\s+)(.*)$/)
  if (!yamlMatch) return null
  return tryParse(yamlMatch[1], yamlMatch[2])
}

function parseFile(content: string): ParsedFile {
  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) lines.pop()

  const preamble: string[] = []
  const rules: Rule[] = []
  let foundFirstRule = false
  let defaultRulePrefix = ''

  for (const line of lines) {
    if (!foundFirstRule) {
      const tryParse = parseRuleLine(line)
      if (!tryParse) {
        preamble.push(line)
        continue
      }
      foundFirstRule = true
      defaultRulePrefix = tryParse.prefix
      rules.push({ id: newId(), ...tryParse, status: 'unchanged' })
      continue
    }

    if (isCommentOrBlank(line)) {
      // 中间的注释/空行用 RAW 占位，保留位置
      rules.push({
        id: newId(), prefix: '', type: RAW_TYPE, value: line,
        trailing: '', comment: '', status: 'unchanged',
      })
      continue
    }

    const parsed = parseRuleLine(line)
    if (parsed) {
      rules.push({ id: newId(), ...parsed, status: 'unchanged' })
    } else {
      // 无法识别的行原样保留
      rules.push({
        id: newId(), prefix: '', type: RAW_TYPE, value: line,
        trailing: '', comment: '', status: 'unchanged',
      })
    }
  }

  return { preamble, rules, defaultRulePrefix, trailingNewline }
}

function formatRule(r: Rule): string {
  if (r.type === RAW_TYPE) return r.value
  const cmt = r.comment ? '  ' + r.comment.trim() : ''
  return `${r.prefix}${r.type},${r.value}${r.trailing}${cmt}`
}

function serializeFile(file: ParsedFile, currentRules: Rule[]): string {
  const out: string[] = [...file.preamble]
  for (const r of currentRules) out.push(formatRule(r))
  return out.join('\n') + (file.trailingNewline ? '\n' : '')
}

// =============== GitHub 接口 ===============

async function ghGet(url: string, token: string): Promise<GitHubResponse> {
  return fetch(url, { headers: githubHeaders(token) })
}

async function fetchFolderContentsAtBranch(cfg: Config, path: string, branch: string): Promise<BrowserItem[]> {
  const ref = encodeURIComponent(branch)
  const url = path
    ? `${repoApiBase(cfg)}/contents/${encodeURIPath(path)}?ref=${ref}`
    : `${repoApiBase(cfg)}/contents?ref=${ref}`
  const res = await ghGet(url, cfg.token)
  if (!res.ok) throw await githubError(res)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('该路径不是文件夹')
  return data
    .map((it: any) => ({
      id: it.path,
      name: it.name,
      path: it.path,
      type: it.type === 'dir' ? 'dir' : 'file',
      sha: it.sha,
      size: it.size ?? 0,
      rawUrl: it.download_url ?? '',
    } as BrowserItem))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/** 列目录：返回文件夹 + 文件，文件夹优先，按名字升序；分支不存在时自动切默认分支 */
async function fetchFolderContents(cfg: Config, path: string): Promise<BrowserItem[]> {
  let branch = preferredBranch(cfg)
  try {
    return await fetchFolderContentsAtBranch(cfg, path, branch)
  } catch (e: any) {
    if (!isMissingBranchError(e)) throw e
    branch = await useDefaultBranch(cfg)
    return await fetchFolderContentsAtBranch({ ...cfg, branch }, path, branch)
  }
}

async function fetchFileContentAtBranch(
  cfg: Config, path: string, branch: string,
): Promise<{ content: string; sha: string }> {
  const url = `${repoApiBase(cfg)}/contents/${encodeURIPath(path)}?ref=${encodeURIComponent(branch)}`
  const res = await ghGet(url, cfg.token)
  if (!res.ok) throw await githubError(res)
  const data = await res.json()
  if (!data.content) throw new Error(data.message || '读取文件失败')
  const decoded = Data.fromBase64String(data.content.replace(/\n/g, ''))
  return { content: decoded?.toRawString() ?? '', sha: data.sha }
}

async function fetchFileContent(
  cfg: Config, path: string,
): Promise<{ content: string; sha: string }> {
  let branch = preferredBranch(cfg)
  try {
    return await fetchFileContentAtBranch(cfg, path, branch)
  } catch (e: any) {
    if (!isMissingBranchError(e)) throw e
    branch = await useDefaultBranch(cfg)
    return await fetchFileContentAtBranch({ ...cfg, branch }, path, branch)
  }
}

interface CommitResult {
  ok: boolean
  error?: string
  newSha?: string
  status?: number
  githubMessage?: string
}

async function commitFileContentAtBranch(
  cfg: Config, path: string, content: string, sha: string, message: string, branch: string,
): Promise<CommitResult> {
  const data = Data.fromRawString(content, 'utf-8')
  const res = await fetch(
    `${repoApiBase(cfg)}/contents/${encodeURIPath(path)}`,
    {
      method: 'PUT',
      headers: githubHeaders(cfg.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        message,
        content: data?.toBase64String() ?? '',
        sha,
        branch,
      }),
    },
  )
  if (res.ok) {
    const body = await res.json()
    return { ok: true, newSha: body.content?.sha }
  }
  const err = await githubError(res) as Error & { status?: number; githubMessage?: string }
  return { ok: false, error: err.message, status: err.status, githubMessage: err.githubMessage }
}

async function commitFileContent(
  cfg: Config, path: string, content: string, sha: string, message: string,
): Promise<CommitResult> {
  let branch = preferredBranch(cfg)
  const first = await commitFileContentAtBranch(cfg, path, content, sha, message, branch)
  if (first.ok || !isMissingBranchError(first)) return first

  branch = await useDefaultBranch(cfg)
  return await commitFileContentAtBranch({ ...cfg, branch }, path, content, sha, message, branch)
}

// =============== 配置存储 ===============

function getConfig(): Config {
  const c = Storage.get<Config>(CONFIG_KEY) ?? { token: '', owner: '', repo: '', path: '', branch: '' }
  // branch 留空表示自动识别仓库默认分支；兼容旧版缺字段配置。
  if (c.branch === undefined || c.branch === null) c.branch = ''
  return c
}
function saveConfig(c: Config) { Storage.set(CONFIG_KEY, c) }

// =============== 配置页 ===============

function ConfigView({ onBack }: { onBack: () => void }) {
  const config = getConfig()
  const token = useObservable(config.token)
  const owner = useObservable(config.owner)
  const repo = useObservable(config.repo)
  const path = useObservable(config.path)
  const branch = useObservable(config.branch)
  const testing = useObservable(false)
  const testMsg = useObservable('')
  const intentTarget = loadIntentTarget()
  const intentFilePath = useObservable(intentTarget.filePath)
  const intentRuleType = useObservable(intentTarget.ruleType)

  const currentDraft = (): Config => ({
    token: token.value.trim(),
    owner: owner.value.trim(),
    repo: repo.value.trim(),
    path: path.value.trim(),
    branch: branch.value.trim(),
  })

  const saveDraft = () => {
    saveConfig(currentDraft())
  }

  const testConnection = async () => {
    const draft = currentDraft()
    if (!draft.token || !draft.owner || !draft.repo) {
      testMsg.setValue('请先填写 Token、用户名、仓库名')
      return
    }
    testing.setValue(true)
    testMsg.setValue('检测中…')
    try {
      const defaultBranch = await fetchDefaultBranch(draft)
      const requestedBranch = draft.branch || defaultBranch
      await fetchFolderContents({ ...draft, branch: requestedBranch }, draft.path)
      const saved = getConfig()
      const finalBranch = repoKey(saved) === repoKey(draft)
        ? (saved.branch || requestedBranch)
        : requestedBranch
      branch.setValue(finalBranch)
      saveConfig({ ...draft, branch: finalBranch })
      testMsg.setValue(`连接成功，当前分支：${finalBranch}；默认分支：${defaultBranch}`)
    } catch (e: any) {
      testMsg.setValue(e.message ?? '检测失败')
    }
    testing.setValue(false)
  }

  return (
    <List
      navigationTitle="配置"
      toolbar={{ topBarLeading: <Button title="返回" action={onBack} /> }}
    >
      <Section
        header={<Text>GitHub 配置</Text>}
        footer={<Text>私有仓库需要 token 包含 repo scope（classic）或对该仓库的 Contents Read/Write 权限（fine-grained）。分支留空会自动识别仓库默认分支。</Text>}
      >
        <TextField title="Token" value={token} prompt="GitHub Token" />
        <TextField title="用户名" value={owner} prompt="GitHub 用户名" />
        <TextField title="仓库名" value={repo} prompt="仓库名称" />
        <TextField title="起始路径" value={path} prompt="留空则从仓库根目录开始" />
        <TextField title="分支" value={branch} prompt="留空自动识别，例如 main/master" />
      </Section>

      <Section
        header={<Text>后台追加</Text>}
        footer={<Text>从分享菜单或快捷指令传入文本或链接时，会自动追加到这里指定的文件。链接会自动提取主机名，重复规则会跳过。</Text>}
      >
        <TextField title="目标文件" value={intentFilePath} prompt="如 Surge/reject.list" />
        <TextField title="规则类型" value={intentRuleType} prompt="默认 DOMAIN-SUFFIX" />
      </Section>

      {testMsg.value ? (
        <Section header={<Text>连接检测</Text>}>
          <Text foregroundStyle={testMsg.value.includes('成功') ? 'systemGreen' : 'secondaryLabel'}>
            {testMsg.value}
          </Text>
        </Section>
      ) : null}

      <Section>
        <Button
          title={testing.value ? '检测中…' : '检测连接并自动分支'}
          disabled={testing.value}
          action={testConnection}
        />
        <Button
          title="保存配置"
          action={() => {
            saveDraft()
            saveIntentTarget({
              filePath: intentFilePath.value.trim(),
              ruleType: intentRuleType.value.trim(),
            })
            Widget.reloadUserWidgets()
            onBack()
          }}
        />
      </Section>
    </List>
  )
}

// =============== 仓库浏览器 ===============

const FILE_SIZE_LIMIT = 1024 * 1024  // 1MB，超过则不让进编辑器

function BrowserView({
  currentPath, onNavigate, onPickFile, onRawEdit, onConfig,
}: {
  currentPath: string
  onNavigate: (newPath: string) => void
  onPickFile: (f: FileItem, sha: string, parsed: ParsedFile) => void
  onRawEdit: (f: FileItem, content: string, sha: string) => void
  onConfig: () => void
}) {
  const items = useObservable<BrowserItem[]>([])
  const loading = useObservable(false)
  const errorMsg = useObservable('')
  const showToast = useObservable(false)
  const toastMsg = useObservable('')

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  const refresh = async () => {
    const cfg = getConfig()
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      errorMsg.setValue('请先配置 GitHub 信息')
      items.setValue([])
      return
    }
    loading.setValue(true)
    errorMsg.setValue('')
    try {
      items.setValue(await fetchFolderContents(cfg, currentPath))
    } catch (e: any) {
      errorMsg.setValue(e.message ?? '获取失败')
      items.setValue([])
    }
    loading.setValue(false)
  }

  // currentPath 变化时重新拉
  useEffect(() => { refresh() }, [currentPath])

  const openFile = async (f: BrowserItem) => {
    if (f.size > FILE_SIZE_LIMIT) {
      showMsg(`文件过大（${formatSize(f.size)}），暂不支持编辑`)
      return
    }
    const cfg = getConfig()
    loading.setValue(true)
    try {
      const { content, sha } = await fetchFileContent(cfg, f.path)
      const parsed = parseFile(content)
      onPickFile({ id: f.id, name: f.name, path: f.path, sha, rawUrl: f.rawUrl }, sha, parsed)
    } catch (e: any) {
      showMsg(e.message ?? '读取失败')
    }
    loading.setValue(false)
  }

  const openRawFile = async (f: BrowserItem) => {
    if (f.size > FILE_SIZE_LIMIT) {
      showMsg(`文件过大（${formatSize(f.size)}），暂不支持编辑`)
      return
    }
    const cfg = getConfig()
    loading.setValue(true)
    try {
      const { content, sha } = await fetchFileContent(cfg, f.path)
      onRawEdit({ id: f.id, name: f.name, path: f.path, sha, rawUrl: f.rawUrl }, content, sha)
    } catch (e: any) {
      showMsg(e.message ?? '读取失败')
    }
    loading.setValue(false)
  }

  const copyRawLink = async (f: BrowserItem) => {
    try {
      const cfg = getConfig()
      const link = f.rawUrl || rawFileUrl(cfg, f.path)
      await Pasteboard.setString(link)
      showMsg('已复制原始链接')
    } catch (e: any) {
      showMsg(e.message ?? '复制失败')
    }
  }

  // 派生：分组后的目录与文件
  const dirs = useMemo(
    () => items.value.filter(it => it.type === 'dir'),
    [items.value],
  )
  const files = useMemo(
    () => items.value.filter(it => it.type === 'file'),
    [items.value],
  )

  const isRoot = !currentPath
  const segs = currentPath.split('/').filter(Boolean)
  const lastSeg = segs[segs.length - 1] ?? ''
  const cfg = getConfig()
  const navTitle = isRoot ? (cfg.repo || '仓库') : lastSeg

  const goUp = () => onNavigate(parentPath(currentPath))

  return (
    <List
      navigationTitle={navTitle}
      refreshable={async () => {
        await Promise.all([refresh(), delay(500)])
      }}
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: !isRoot
          ? <Button title="上级" systemImage="chevron.up" action={goUp} />
          : undefined,
        topBarTrailing: <Button title="配置" systemImage="gearshape" action={onConfig} />,
      }}
    >
      {/* 当前路径 + 操作 */}
      <Section
        header={<Text>当前位置</Text>}
        footer={<Text>{isRoot ? `${cfg.owner}/${cfg.repo || '?'} · ${preferredBranch(cfg)}` : `${currentPath} · ${preferredBranch(cfg)}`}</Text>}
      >
        <Button
          title={loading.value ? '加载中…' : '刷新'}
          disabled={loading.value}
          action={refresh}
        />
        {!isRoot ? (
          <Button title="返回根目录" action={() => onNavigate('')} />
        ) : null}
      </Section>

      {/* 错误 */}
      {errorMsg.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{errorMsg.value}</Text>
        </Section>
      ) : null}

      {/* 文件夹分组 */}
      {dirs.length > 0 ? (
        <Section header={<Text>文件夹 ({dirs.length})</Text>}>
          {dirs.map(d => (
            <Button
              key={d.id}
              title={d.name}
              systemImage="folder.fill"
              action={() => onNavigate(d.path)}
            />
          ))}
        </Section>
      ) : null}

      {/* 文件分组 */}
      {files.length > 0 ? (
        <Section
          header={<Text>文件 ({files.length})</Text>}
          footer={<Text>点击文件进入规则编辑；长按可复制 raw 链接或原始编辑</Text>}
        >
          {files.map(f => (
            <Button
              key={f.id}
              action={() => openFile(f)}
              contextMenu={{
                menuItems: (
                  <>
                    <Section>
                      <Button title="规则编辑" systemImage="list.bullet.rectangle" action={() => openFile(f)} />
                      <Button title="原始编辑" systemImage="pencil" action={() => openRawFile(f)} />
                      <Button title="复制 raw 链接" systemImage="doc.on.doc" action={() => copyRawLink(f)} />
                    </Section>
                  </>
                ),
              }}
            >
              <HStack spacing={8}>
                <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                <Text lineLimit={1}>{f.name}</Text>
                <Spacer />
                <Text font="caption" foregroundStyle="secondaryLabel">
                  {formatSize(f.size)}
                </Text>
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}

      {/* 空目录 */}
      {!loading.value && !errorMsg.value && items.value.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">空文件夹</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 单条规则的行视图 ===============

function statusBadge(status: RuleStatus): { text: string; color: 'green' | 'orange' } | null {
  if (status === 'added') return { text: '+', color: 'green' }
  if (status === 'modified') return { text: '~', color: 'orange' }
  return null
}

function RuleRow({
  rule, onTap,
}: {
  rule: Rule
  onTap: () => void
}) {
  if (rule.type === RAW_TYPE) {
    return (
      <Text key={rule.id} foregroundStyle="secondaryLabel" font="caption">
        {rule.value || '(空行)'}
      </Text>
    )
  }
  const badge = statusBadge(rule.status)
  return (
    <Button key={rule.id} action={onTap}>
      <HStack spacing={8}>
        {badge ? (
          <Text foregroundStyle={badge.color} font="caption" bold>
            {badge.text}
          </Text>
        ) : null}
        <Text font="caption" foregroundStyle="secondaryLabel">{rule.type}</Text>
        <Text>{rule.value}</Text>
        {rule.trailing ? (
          <Text font="caption" foregroundStyle="secondaryLabel">{rule.trailing}</Text>
        ) : null}
        <Spacer />
      </HStack>
    </Button>
  )
}

// =============== 单条规则编辑/新增 Sheet ===============

function RuleEditorView({
  rule, title, knownTypes, onSave, onCancel, onDelete,
}: {
  rule: Rule
  title: string
  knownTypes: string[]
  onSave: (next: Rule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const type = useObservable(rule.type === RAW_TYPE ? '' : rule.type)
  const value = useObservable(rule.value)
  const trailing = useObservable(rule.trailing)
  const comment = useObservable(rule.comment)
  const error = useObservable('')

  useEffect(() => {
    type.setValue(rule.type === RAW_TYPE ? '' : rule.type)
    value.setValue(rule.value)
    trailing.setValue(rule.trailing)
    comment.setValue(rule.comment)
    error.setValue('')
  }, [rule.id])

  const save = () => {
    const t = type.value.trim().toUpperCase()
    const v = value.value.trim()
    if (!t || !/^[A-Z][A-Z0-9-]*$/.test(t)) {
      error.setValue('类型不合法（示例：DOMAIN-SUFFIX）')
      return
    }
    if (!v) {
      error.setValue('值不能为空')
      return
    }
    let tr = trailing.value.trim()
    if (tr && !tr.startsWith(',')) tr = ',' + tr
    let cm = comment.value.trim()
    if (cm && !cm.startsWith('#')) cm = '# ' + cm
    onSave({ ...rule, type: t, value: v, trailing: tr, comment: cm })
  }

  return (
    <List
      navigationTitle={title}
      toolbar={{
        topBarLeading: <Button title="取消" action={onCancel} />,
        topBarTrailing: <Button title="完成" action={save} />,
      }}
    >
      {error.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{error.value}</Text>
        </Section>
      ) : null}

      <Section header={<Text>类型</Text>} footer={<Text>大写字母 + 短横线，如 DOMAIN-SUFFIX</Text>}>
        <TextField
          title="类型"
          value={type}
          prompt="如 DOMAIN-SUFFIX"
          autocorrectionDisabled
          textInputAutocapitalization="characters"
        />
        {knownTypes.length > 0 ? (
          <Picker
            title="从已有类型选择"
            value={type.value}
            onChanged={(v: string) => { if (v) type.setValue(v) }}
            pickerStyle="menu"
          >
            <Text tag="">— 选择 —</Text>
            {knownTypes.map(t => (
              <Text key={t} tag={t}>{t}</Text>
            ))}
          </Picker>
        ) : null}
      </Section>

      <Section header={<Text>值</Text>} footer={<Text>例如 github.io、1.2.3.4/24</Text>}>
        <TextField
          title="值"
          value={value}
          prompt="规则值"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          autofocus={!rule.value}
        />
      </Section>

      <Section
        header={<Text>额外参数（可选）</Text>}
        footer={<Text>逗号分隔，例如 ,Proxy,no-resolve（保存时自动补上前导逗号）</Text>}
      >
        <TextField title="trailing" value={trailing} prompt=",Proxy" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      <Section header={<Text>注释（可选）</Text>}>
        <TextField title="注释" value={comment} prompt="# 备注" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      {onDelete ? (
        <Section>
          <Button title="删除此规则" role="destructive" action={onDelete} />
        </Section>
      ) : null}
    </List>
  )
}

// =============== Diff & 提交 Sheet ===============

interface ModifiedPair { before: Rule; after: Rule }

function DiffView({
  fileName, added, modified, deleted, reorder, moved, message, busy, onCancel, onConfirm,
}: {
  fileName: string
  added: Rule[]
  modified: ModifiedPair[]
  deleted: Rule[]
  reorder: boolean
  moved: { rule: Rule; oldIndex: number; newIndex: number }[]
  message: { value: string; setValue: (s: string) => void; readonly setValue2?: never } & { value: string }
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // 注意：上面 message 类型用宽松形式，因为它是 Observable<string>
  const total = added.length + modified.length + deleted.length + (reorder ? 1 : 0)
  const movedPreview = moved.slice(0, 30)
  const movedRest = Math.max(0, moved.length - movedPreview.length)

  return (
    <List
      navigationTitle="确认提交"
      toolbar={{
        topBarLeading: <Button title="取消" disabled={busy} action={onCancel} />,
        topBarTrailing: (
          <Button
            title={busy ? '提交中…' : `确认提交 (${total})`}
            disabled={busy || total === 0}
            action={onConfirm}
          />
        ),
      }}
    >
      <Section header={<Text>{fileName}</Text>} footer={<Text>提交后将直接写入当前配置分支</Text>}>
        <TextField title="commit message" value={message as any} prompt="提交说明" axis="vertical" />
      </Section>

      {added.length > 0 ? (
        <Section header={<Text foregroundStyle="systemGreen">+ 新增 {added.length}</Text>}>
          {added.map(r => (
            <Text key={r.id} foregroundStyle="systemGreen" font="caption">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {modified.length > 0 ? (
        <Section header={<Text foregroundStyle="systemOrange">~ 修改 {modified.length}</Text>}>
          {modified.map(({ before, after }) => (
            <VStack key={after.id} alignment="leading" spacing={2}>
              <Text foregroundStyle="systemRed" font="caption">- {formatRule(before)}</Text>
              <Text foregroundStyle="systemGreen" font="caption">+ {formatRule(after)}</Text>
            </VStack>
          ))}
        </Section>
      ) : null}

      {deleted.length > 0 ? (
        <Section header={<Text foregroundStyle="systemRed">- 删除 {deleted.length}</Text>}>
          {deleted.map(r => (
            <Text key={r.id} foregroundStyle="systemRed" font="caption" strikethrough="systemRed">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {reorder ? (
        <Section
          header={<Text foregroundStyle="systemBlue">↕ 顺序变化 {moved.length > 0 ? `(${moved.length})` : ''}</Text>}
          footer={
            movedRest > 0
              ? <Text>已省略其余 {movedRest} 项 · 提交时按当前列表顺序写入</Text>
              : <Text>提交后按当前列表顺序写入文件</Text>
          }
        >
          {movedPreview.length > 0 ? (
            movedPreview.map(m => (
              <Text key={m.rule.id} foregroundStyle="systemBlue" font="caption">
                {`第 ${m.oldIndex + 1} → ${m.newIndex + 1} 行  ${formatRule(m.rule)}`}
              </Text>
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel" font="caption">
              规则的相对顺序已被调整
            </Text>
          )}
        </Section>
      ) : null}

      {total === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">没有任何变更</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 编辑器主页 ===============

function EditorView({
  file, sha, parsed, onBack,
}: {
  file: FileItem
  sha: string
  parsed: ParsedFile
  onBack: () => void
}) {
  // === 状态 ===
  const rules = useObservable<Rule[]>(parsed.rules)
  // 已删除的「原本就在文件里」的规则快照（用于 diff 展示）
  const deletedSnapshots = useObservable<Rule[]>([])
  // 当前编辑/新增 Sheet
  const editingId = useObservable<string | null>(null)
  const draftRule = useObservable<Rule | null>(null)
  const showDiff = useObservable(false)
  const showToast = useObservable(false)
  const toastMsg = useObservable('')
  const submitting = useObservable(false)
  // 筛选
  const typeFilter = useObservable(ALL_TYPES)
  const searchText = useObservable('')
  // 提交 sha & 提交信息
  const currentSha = useObservable(sha)
  const commitMessage = useObservable('')
  // 新增规则时默认的类型
  const lastUsedType = useObservable(
    parsed.rules.find(r => r.type !== RAW_TYPE)?.type ?? 'DOMAIN-SUFFIX',
  )
  const defaultRulePrefix = parsed.defaultRulePrefix

  // 原始快照 Map（用于检测「修改」&「删除原项」）。useRef 不触发重渲。
  const originalRef = useRef<Map<string, Rule> | null>(null)
  if (!originalRef.current) {
    originalRef.current = new Map(parsed.rules.map(r => [r.id, r]))
  }
  // 原始位置序列（用于检测「拖拽排序」）
  const originalOrderRef = useRef<string[] | null>(null)
  if (!originalOrderRef.current) {
    originalOrderRef.current = parsed.rules.map(r => r.id)
  }
  const getOriginal = (id: string) => originalRef.current!.get(id)

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  // === 派生数据 ===
  const distinctTypes = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      if (!seen.has(r.type)) {
        seen.add(r.type)
        out.push(r.type)
      }
    }
    return out
  }, [rules.value])

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      m[r.type] = (m[r.type] ?? 0) + 1
    }
    return m
  }, [rules.value])

  const filteredRules = useMemo(() => {
    const q = searchText.value.trim().toLowerCase()
    const ft = typeFilter.value
    return rules.value.filter(r => {
      if (r.type === RAW_TYPE) {
        // 仅在「全部 + 无搜索」时显示原样行
        return ft === ALL_TYPES && !q
      }
      if (ft !== ALL_TYPES && r.type !== ft) return false
      if (q && !r.value.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q)) return false
      return true
    })
  }, [rules.value, typeFilter.value, searchText.value])

  const stats = useMemo(() => {
    let added = 0, modified = 0
    for (const r of rules.value) {
      if (r.status === 'added') added++
      else if (r.status === 'modified') modified++
    }
    const deleted = deletedSnapshots.value.length
    // 检测拖拽排序：仅看「原本就在文件里」的规则的相对顺序
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const actual = rules.value
      .filter(r => originalRef.current!.has(r.id))
      .map(r => r.id)
    let reorder = false
    if (actual.length === expected.length) {
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) { reorder = true; break }
      }
    }
    const total = added + modified + deleted + (reorder ? 1 : 0)
    return { added, modified, deleted, reorder, total }
  }, [rules.value, deletedSnapshots.value])

  // === 操作 ===
  const onMove = useCallback((indices: number[], newOffset: number) => {
    // indices/newOffset 都是相对于当前 filteredRules 的下标
    const fr = filteredRules
    const moving = indices.map(i => fr[i])
    const reduced = fr.filter((_, i) => !indices.includes(i))
    reduced.splice(newOffset, 0, ...moving)

    // 把过滤后的新顺序合并回 master 数组（保持非可见项位置不变）
    const ids = new Set(fr.map(r => r.id))
    let f = 0
    const newMaster = rules.value.map(r => (ids.has(r.id) ? reduced[f++] : r))
    rules.setValue(newMaster)
  }, [filteredRules])

  const onDelete = useCallback((indices: number[]) => {
    const fr = filteredRules
    const idsToDelete = new Set(indices.map(i => fr[i].id))
    const removed: Rule[] = []
    const newMaster = rules.value.filter(r => {
      if (!idsToDelete.has(r.id)) return true
      const orig = getOriginal(r.id)
      if (orig && orig.type !== RAW_TYPE) removed.push(orig)
      return false
    })
    rules.setValue(newMaster)
    if (removed.length > 0) {
      deletedSnapshots.setValue([...deletedSnapshots.value, ...removed])
    }
  }, [filteredRules])

  const startAdd = () => {
    draftRule.setValue({
      id: newId(),
      prefix: defaultRulePrefix,
      type: lastUsedType.value || 'DOMAIN-SUFFIX',
      value: '',
      trailing: '',
      comment: '',
      status: 'added',
    })
  }

  const saveDraft = (next: Rule) => {
    rules.setValue([...rules.value, { ...next, prefix: next.prefix || defaultRulePrefix }])
    if (next.type !== RAW_TYPE) lastUsedType.setValue(next.type)
    draftRule.setValue(null)
  }

  const editRule = useMemo(
    () => (editingId.value ? rules.value.find(r => r.id === editingId.value) ?? null : null),
    [editingId.value, rules.value],
  )

  const saveEdit = (next: Rule) => {
    const orig = getOriginal(next.id)
    let final = next
    if (orig) {
      const changed = (
        next.type !== orig.type ||
        next.value !== orig.value ||
        next.trailing !== orig.trailing ||
        next.comment !== orig.comment
      )
      final = { ...next, status: changed ? 'modified' : 'unchanged' }
    } else {
      // 新增项保持 'added'
      final = { ...next, status: 'added' }
    }
    rules.setValue(rules.value.map(r => (r.id === next.id ? final : r)))
    if (next.type !== RAW_TYPE) lastUsedType.setValue(next.type)
    editingId.setValue(null)
  }

  const deleteEditing = () => {
    if (!editRule) return
    const id = editRule.id
    const orig = getOriginal(id)
    rules.setValue(rules.value.filter(r => r.id !== id))
    if (orig && orig.type !== RAW_TYPE) {
      deletedSnapshots.setValue([...deletedSnapshots.value, orig])
    }
    editingId.setValue(null)
  }

  // === 提交流程 ===
  const startCommit = () => {
    if (stats.total === 0) {
      showMsg('暂无更改')
      return
    }
    const parts: string[] = []
    if (stats.added) parts.push(`+${stats.added}`)
    if (stats.modified) parts.push(`~${stats.modified}`)
    if (stats.deleted) parts.push(`-${stats.deleted}`)
    if (stats.reorder) parts.push('reorder')
    commitMessage.setValue(`Update ${file.name}: ${parts.join(' ')}`)
    showDiff.setValue(true)
  }

  const commit = async () => {
    submitting.setValue(true)
    try {
      const cfg = getConfig()
      const newContent = serializeFile(parsed, rules.value)
      const result = await commitFileContent(
        cfg, file.path, newContent, currentSha.value, commitMessage.value || `Update ${file.name}`,
      )
      if (result.ok) {
        showMsg('提交成功')
        // 重置基线：所有未删除项变成 unchanged，已删除快照清空
        const reset: Rule[] = rules.value.map(r => ({ ...r, status: 'unchanged' as RuleStatus }))
        rules.setValue(reset)
        deletedSnapshots.setValue([])
        if (result.newSha) currentSha.setValue(result.newSha)
        // 把当前状态作为新基线，避免下次再次提示「已修改」
        originalRef.current = new Map(reset.map(r => [r.id, r]))
        originalOrderRef.current = reset.map(r => r.id)
        showDiff.setValue(false)
        Widget.reloadUserWidgets()
      } else {
        showMsg(`提交失败: ${result.error}`)
      }
    } catch (e: any) {
      showMsg(`提交失败: ${e.message ?? '网络错误'}`)
    }
    submitting.setValue(false)
  }

  // === 派生：filtered 中可见项数（用于 header 显示） ===
  const visibleRuleCount = useMemo(
    () => rules.value.filter(r => r.type !== RAW_TYPE).length,
    [rules.value],
  )

  // === 修改对（用于 Diff） ===
  const modifiedPairs = useMemo<ModifiedPair[]>(() => {
    const pairs: ModifiedPair[] = []
    for (const r of rules.value) {
      if (r.status !== 'modified') continue
      const before = getOriginal(r.id)
      if (before) pairs.push({ before, after: r })
    }
    return pairs
  }, [rules.value])

  const addedItems = useMemo(
    () => rules.value.filter(r => r.status === 'added'),
    [rules.value],
  )

  // === 拖拽细节：哪些规则从「原第几行」移到了「现第几行」 ===
  const movedItems = useMemo(() => {
    if (!stats.reorder) return []
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const moved: { rule: Rule; oldIndex: number; newIndex: number }[] = []
    let actualIdx = 0
    for (const r of rules.value) {
      if (!originalRef.current!.has(r.id)) continue
      if (expected[actualIdx] !== r.id) {
        const oldIdx = expected.indexOf(r.id)
        if (oldIdx >= 0) {
          moved.push({ rule: r, oldIndex: oldIdx, newIndex: actualIdx })
        }
      }
      actualIdx++
    }
    return moved
  }, [rules.value, stats.reorder])

  // === 渲染 ===
  return (
    <List
      navigationTitle={file.name}
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: <Button title="返回" action={onBack} />,
        topBarTrailing: [
          <EditButton key="edit" />,
          <Button
            key="save"
            title={stats.total > 0 ? `保存(${stats.total})` : '保存'}
            disabled={stats.total === 0 || submitting.value}
            action={startCommit}
          />,
        ],
      }}
      sheet={[
        // —— 编辑已有规则 ——
        {
          isPresented: editingId.value !== null && editRule !== null,
          onChanged: (v: boolean) => { if (!v) editingId.setValue(null) },
          content: editRule ? (
            <NavigationStack>
              <RuleEditorView
                rule={editRule}
                title="编辑规则"
                knownTypes={distinctTypes}
                onSave={saveEdit}
                onCancel={() => editingId.setValue(null)}
                onDelete={deleteEditing}
              />
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— 新增规则 ——
        {
          isPresented: draftRule.value !== null,
          onChanged: (v: boolean) => { if (!v) draftRule.setValue(null) },
          content: draftRule.value ? (
            <NavigationStack>
              <RuleEditorView
                rule={draftRule.value}
                title="新增规则"
                knownTypes={distinctTypes}
                onSave={saveDraft}
                onCancel={() => draftRule.setValue(null)}
              />
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— Diff 预览 & 提交 ——
        {
          isPresented: showDiff,
          content: (
            <NavigationStack>
              <DiffView
                fileName={file.name}
                added={addedItems}
                modified={modifiedPairs}
                deleted={deletedSnapshots.value}
                reorder={stats.reorder}
                moved={movedItems}
                message={commitMessage as any}
                busy={submitting.value}
                onCancel={() => showDiff.setValue(false)}
                onConfirm={commit}
              />
            </NavigationStack>
          ),
        },
      ]}
    >
      {/* 顶部：筛选 */}
      <Section header={<Text>筛选与搜索</Text>}>
        <Picker
          title="类型分组"
          value={typeFilter.value}
          onChanged={(v: string) => typeFilter.setValue(v)}
          pickerStyle="menu"
        >
          <Text tag={ALL_TYPES}>全部 ({visibleRuleCount})</Text>
          {distinctTypes.map(t => (
            <Text key={t} tag={t}>{t} ({typeCounts[t] ?? 0})</Text>
          ))}
        </Picker>
        <TextField
          title="搜索"
          value={searchText}
          prompt="按值或类型搜索"
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
      </Section>

      {/* 变更条 */}
      {stats.total > 0 ? (
        <Section>
          <HStack spacing={12}>
            <Text foregroundStyle="systemGreen">+{stats.added}</Text>
            <Text foregroundStyle="systemOrange">~{stats.modified}</Text>
            <Text foregroundStyle="systemRed">-{stats.deleted}</Text>
            {stats.reorder ? (
              <Text foregroundStyle="systemBlue">↕ 顺序变化</Text>
            ) : null}
            <Spacer />
            <Text font="caption" foregroundStyle="secondaryLabel">未保存</Text>
          </HStack>
        </Section>
      ) : null}

      {/* 新增按钮 */}
      <Section>
        <Button title="+ 新增规则" action={startAdd} />
      </Section>

      {/* 规则列表 */}
      <Section
        header={<Text>规则 ({filteredRules.length})</Text>}
        footer={
          (searchText.value || typeFilter.value !== ALL_TYPES)
            ? <Text>筛选生效中 · 拖拽排序仅作用于可见项</Text>
            : <Text>左滑删除 · 点击右上角进入编辑模式可拖拽排序</Text>
        }
      >
        <ForEach
          count={filteredRules.length}
          itemBuilder={(i: number) => {
            const r = filteredRules[i]
            return (
              <RuleRow
                key={r.id}
                rule={r}
                onTap={() => {
                  if (r.type === RAW_TYPE) return
                  editingId.setValue(r.id)
                }}
              />
            )
          }}
          onDelete={onDelete}
          onMove={onMove}
        />
      </Section>
    </List>
  )
}

// =============== 原始文件编辑器 ===============

function RawEditorView({
  file, content, sha, onBack,
}: {
  file: FileItem
  content: string
  sha: string
  onBack: () => void
}) {
  const currentSha = useObservable(sha)
  const saving = useObservable(false)
  const showToast = useObservable(false)
  const toastMsg = useObservable('')
  const savedContentRef = useRef(content)
  const controller = useMemo(() => new EditorController({
    content,
    ext: fileExt(file.name) as any,
    readOnly: false,
  }), [file.path])

  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  const saveRaw = async () => {
    if (saving.value) return
    saving.setValue(true)
    try {
      // EditorController.content 有轻微防抖，点保存后等一帧，避免刚输入的内容没同步。
      await delay(180)
      const nextContent = controller.content
      if (nextContent === savedContentRef.current) {
        showMsg('没有更改')
        return
      }

      const cfg = getConfig()
      const latest = await withTimeout(
        fetchFileContent(cfg, file.path),
        10000,
        '刷新远端文件超时，请检查网络后重试',
      )
      currentSha.setValue(latest.sha)

      if (latest.content === nextContent) {
        savedContentRef.current = nextContent
        showMsg('远端已是最新内容')
        return
      }

      const result = await withTimeout(
        commitFileContent(cfg, file.path, nextContent, latest.sha, `Update ${file.name}`),
        20000,
        '保存到 GitHub 超时，请稍后重试',
      )
      if (result.ok) {
        if (result.newSha) currentSha.setValue(result.newSha)
        savedContentRef.current = nextContent
        Widget.reloadUserWidgets()
        showMsg('原始文件已保存')
      } else {
        showMsg(`保存失败: ${result.error}`)
      }
    } catch (e: any) {
      showMsg(`保存失败: ${e.message ?? '网络错误'}`)
    } finally {
      saving.setValue(false)
    }
  }

  return (
    <Editor
      controller={controller}
      scriptName={file.name}
      navigationTitle={file.name}
      showAccessoryView={true}
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: (
          <Button action={onBack}>
            <Image systemName="chevron.left" />
          </Button>
        ),
        topBarTrailing: (
          <Button disabled={saving.value} action={saveRaw}>
            {saving.value ? <ProgressView /> : <Image systemName="checkmark" />}
          </Button>
        ),
      }}
    />
  )
}

// =============== 顶层路由 ===============

type AppMode =
  | { kind: 'browser' }
  | { kind: 'config' }
  | { kind: 'editor'; file: FileItem; sha: string; parsed: ParsedFile }
  | { kind: 'rawEditor'; file: FileItem; content: string; sha: string }

function App() {
  const [mode, setMode] = useState<AppMode>({ kind: 'browser' })
  // 浏览路径，跨 mode 切换保持不变；启动时取上次记忆，回退到 config.path，再回退到根
  const [currentPath, setCurrentPath] = useState<string>(() =>
    Storage.get<string>(LAST_PATH_KEY) ?? getConfig().path ?? '',
  )

  const handleNavigate = (newPath: string) => {
    setCurrentPath(newPath)
    if (newPath) Storage.set(LAST_PATH_KEY, newPath)
    else Storage.remove(LAST_PATH_KEY)
  }

  if (mode.kind === 'config') {
    return <ConfigView onBack={() => setMode({ kind: 'browser' })} />
  }
  if (mode.kind === 'editor') {
    return (
      <EditorView
        file={mode.file}
        sha={mode.sha}
        parsed={mode.parsed}
        onBack={() => setMode({ kind: 'browser' })}
      />
    )
  }
  if (mode.kind === 'rawEditor') {
    return (
      <RawEditorView
        file={mode.file}
        content={mode.content}
        sha={mode.sha}
        onBack={() => setMode({ kind: 'browser' })}
      />
    )
  }
  return (
    <BrowserView
      currentPath={currentPath}
      onNavigate={handleNavigate}
      onPickFile={(file, sha, parsed) => setMode({ kind: 'editor', file, sha, parsed })}
      onRawEdit={(file, content, sha) => setMode({ kind: 'rawEditor', file, content, sha })}
      onConfig={() => setMode({ kind: 'config' })}
    />
  )
}

function View() {
  return (
    <NavigationStack>
      <App />
    </NavigationStack>
  )
}

Navigation.present({ element: <View /> })
  .catch(async (e: any) => {
    await Dialog.alert({ title: '错误', message: String(e?.message ?? e) })
  })
  .finally(() => Script.exit())
