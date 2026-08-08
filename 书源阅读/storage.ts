import { DEFAULT_READER_PREFERENCES, DEFAULT_READING_GOAL, STORAGE_KEYS } from "./constants"
import { builtinSources } from "./sources/builtins"
import {
  BookChapter,
  BookshelfItem,
  CacheMetadata,
  DownloadedBook,
  ReaderPreferences,
  ReadingDayStat,
  ReadingGoal,
  ReadingHistoryEntry,
  ReadingProgress,
  ReadingSession,
  SourceProbeStatus,
  StoredBookSource,
  TtsChapterPosition,
} from "./types"
import { makeBookKey } from "./utils/book_identity"
import { lastNDates, localDateKey, shiftDateKey } from "./utils/date"

function defaultSourceId(sources: StoredBookSource[]): string | null {
  return sources.find((item) => item.id === "builtin-zwduxs")?.id
    ?? sources[0]?.id
    ?? null
}

function uniqueSources(sources: StoredBookSource[]): StoredBookSource[] {
  const map = new Map<string, StoredBookSource>()

  for (const source of sources) {
    map.set(source.id, source)
  }

  return Array.from(map.values())
}

function readRecordMap<T>(key: string): Record<string, T> {
  return Storage.get<Record<string, T>>(key) ?? {}
}

function saveRecordMap<T>(key: string, value: Record<string, T>): void {
  Storage.set(key, value)
}

export function listSources(): StoredBookSource[] {
  const saved = Storage.get<StoredBookSource[]>(STORAGE_KEYS.sources) ?? []
  if (saved.length === 0) {
    Storage.set(STORAGE_KEYS.sources, builtinSources)
    Storage.set(STORAGE_KEYS.activeSourceId, defaultSourceId(builtinSources))
    return builtinSources
  }

  return uniqueSources(saved)
}

export function saveSources(sources: StoredBookSource[]): void {
  Storage.set(STORAGE_KEYS.sources, uniqueSources(sources))
}

export function resetBuiltinSources(): StoredBookSource[] {
  saveSources(builtinSources)
  Storage.set(STORAGE_KEYS.activeSourceId, defaultSourceId(builtinSources))
  return builtinSources
}

export function upsertSources(nextSources: StoredBookSource[]): StoredBookSource[] {
  const merged = uniqueSources([...listSources(), ...nextSources])
  saveSources(merged)

  const currentActive = getActiveSourceId()
  if (!currentActive && merged[0]?.id) {
    Storage.set(STORAGE_KEYS.activeSourceId, merged[0].id)
  }

  return merged
}

export function updateSource(sourceId: string, patch: Partial<StoredBookSource>): void {
  saveSources(
    listSources().map((source) => source.id === sourceId ? { ...source, ...patch } : source),
  )
}

export function deleteSource(sourceId: string): void {
  const next = listSources().filter((source) => source.id !== sourceId)
  saveSources(next)

  const activeId = getActiveSourceId()
  if (activeId === sourceId) {
    Storage.set(STORAGE_KEYS.activeSourceId, defaultSourceId(next))
  }
}

export function getActiveSourceId(): string | null {
  return Storage.get<string>(STORAGE_KEYS.activeSourceId) ?? null
}

export function setActiveSourceId(sourceId: string): void {
  Storage.set(STORAGE_KEYS.activeSourceId, sourceId)
}

export function getActiveSource(): StoredBookSource | null {
  const activeId = getActiveSourceId()
  const sources = listSources()

  return sources.find((item) => item.id === activeId) ?? sources[0] ?? null
}

export function getSourceById(sourceId: string): StoredBookSource | null {
  return listSources().find((item) => item.id === sourceId) ?? null
}

export function saveLastReading(session: ReadingSession): void {
  Storage.set(STORAGE_KEYS.lastReading, session)
}

export function getLastReading(): ReadingSession | null {
  return Storage.get<ReadingSession>(STORAGE_KEYS.lastReading) ?? null
}

export function getReaderPreferences(): ReaderPreferences {
  const saved = Storage.get<Partial<ReaderPreferences>>(STORAGE_KEYS.readerPreferences) ?? {}
  return {
    ...DEFAULT_READER_PREFERENCES,
    ...saved,
    tts: {
      ...DEFAULT_READER_PREFERENCES.tts,
      ...(saved.tts ?? {}),
    },
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences): void {
  Storage.set(STORAGE_KEYS.readerPreferences, preferences)
}

function readTtsPositionMap(): Record<string, TtsChapterPosition> {
  return Storage.get<Record<string, TtsChapterPosition>>(STORAGE_KEYS.ttsPositions) ?? {}
}

/**
 * 读取指定章节的朗读中断位置。若表示的不是同一章节（chapterId 不匹配），返回 null。
 */
export function getTtsPosition(bookKey: string, chapterId: string): TtsChapterPosition | null {
  const map = readTtsPositionMap()
  const entry = map[bookKey]
  if (!entry || entry.chapterId !== chapterId) return null
  return entry
}

/**
 * 保存/更新指定书的朗读位置（每本书只记一条最新的）。
 */
export function saveTtsPosition(position: TtsChapterPosition): void {
  const map = readTtsPositionMap()
  map[position.bookKey] = position
  Storage.set(STORAGE_KEYS.ttsPositions, map)
}

/**
 * 清除指定书的朗读位置（朗读完本章 / 手动清除时用）。
 */
export function clearTtsPosition(bookKey: string): void {
  const map = readTtsPositionMap()
  if (!(bookKey in map)) return
  delete map[bookKey]
  Storage.set(STORAGE_KEYS.ttsPositions, map)
}

export function listSourceProbeStatuses(): Record<string, SourceProbeStatus> {
  return Storage.get<Record<string, SourceProbeStatus>>(STORAGE_KEYS.sourceProbeStatuses) ?? {}
}

export function saveSourceProbeStatus(status: SourceProbeStatus): void {
  const current = listSourceProbeStatuses()
  current[status.sourceId] = status
  Storage.set(STORAGE_KEYS.sourceProbeStatuses, current)
}

export function getSourceProbeStatus(sourceId: string): SourceProbeStatus | null {
  return listSourceProbeStatuses()[sourceId] ?? null
}

export function getChapterCache(): Record<string, string> {
  return Storage.get<Record<string, string>>(STORAGE_KEYS.chapterCache) ?? {}
}

export function readChapterCache(url: string): string | null {
  return getChapterCache()[url] ?? null
}

export function saveChapterCache(url: string, content: string): void {
  const current = getChapterCache()
  current[url] = content
  Storage.set(STORAGE_KEYS.chapterCache, current)
  saveCacheMetadata({
    key: url,
    kind: "chapter",
    size: content.length,
    updatedAt: new Date().toISOString(),
  })
}

export function removeChapterCache(url: string): void {
  const current = getChapterCache()
  delete current[url]
  Storage.set(STORAGE_KEYS.chapterCache, current)
  removeCacheMetadata(url)
}

export function clearChapterCaches(): void {
  Storage.set(STORAGE_KEYS.chapterCache, {})
  clearCacheMetadataByKind("chapter")
}

export function getTocCache(): Record<string, BookChapter[]> {
  return Storage.get<Record<string, BookChapter[]>>(STORAGE_KEYS.tocCache) ?? {}
}

export function readTocCache(key: string): BookChapter[] | null {
  return getTocCache()[key] ?? null
}

export function saveTocCache(key: string, chapters: BookChapter[]): void {
  const current = getTocCache()
  current[key] = chapters
  Storage.set(STORAGE_KEYS.tocCache, current)
  saveCacheMetadata({
    key,
    kind: "toc",
    size: JSON.stringify(chapters).length,
    updatedAt: new Date().toISOString(),
    title: chapters[0]?.title,
  })
}

export function clearTocCaches(): void {
  Storage.set(STORAGE_KEYS.tocCache, {})
  clearCacheMetadataByKind("toc")
}

export function listCacheMetadata(): CacheMetadata[] {
  return Object.values(readRecordMap<CacheMetadata>(STORAGE_KEYS.cacheMetadata))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveCacheMetadata(metadata: CacheMetadata): void {
  const current = readRecordMap<CacheMetadata>(STORAGE_KEYS.cacheMetadata)
  current[metadata.key] = metadata
  saveRecordMap(STORAGE_KEYS.cacheMetadata, current)
}

export function removeCacheMetadata(key: string): void {
  const current = readRecordMap<CacheMetadata>(STORAGE_KEYS.cacheMetadata)
  delete current[key]
  saveRecordMap(STORAGE_KEYS.cacheMetadata, current)
}

export function clearCacheMetadataByKind(kind: CacheMetadata["kind"]): void {
  const current = readRecordMap<CacheMetadata>(STORAGE_KEYS.cacheMetadata)
  for (const [key, metadata] of Object.entries(current)) {
    if (metadata.kind === kind) {
      delete current[key]
    }
  }
  saveRecordMap(STORAGE_KEYS.cacheMetadata, current)
}

export function clearAllCaches(): void {
  Storage.set(STORAGE_KEYS.chapterCache, {})
  Storage.set(STORAGE_KEYS.tocCache, {})
  saveRecordMap(STORAGE_KEYS.cacheMetadata, {})
  saveRecordMap(STORAGE_KEYS.downloads, {})
}

export function listBookshelf(): BookshelfItem[] {
  return Object.values(readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf))
    .sort((a, b) => (b.lastReadAt ?? b.addedAt).localeCompare(a.lastReadAt ?? a.addedAt))
}

export function isBookOnBookshelf(bookKey: string): boolean {
  return Boolean(readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf)[bookKey])
}

export function getBookshelfItem(bookKey: string): BookshelfItem | null {
  return readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf)[bookKey] ?? null
}

export function addToBookshelf(item: Omit<BookshelfItem, "addedAt"> & { addedAt?: string }): void {
  const current = readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf)
  current[item.key] = {
    ...current[item.key],
    ...item,
    addedAt: current[item.key]?.addedAt ?? item.addedAt ?? new Date().toISOString(),
  }
  saveRecordMap(STORAGE_KEYS.bookshelf, current)
}

export function removeFromBookshelf(bookKey: string): void {
  const current = readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf)
  delete current[bookKey]
  saveRecordMap(STORAGE_KEYS.bookshelf, current)
}

export function touchBookshelfItem(bookKey: string, updatedAt: string): void {
  const current = readRecordMap<BookshelfItem>(STORAGE_KEYS.bookshelf)
  const existing = current[bookKey]
  if (!existing) return
  current[bookKey] = {
    ...existing,
    lastReadAt: updatedAt,
  }
  saveRecordMap(STORAGE_KEYS.bookshelf, current)
}

export function listReadingHistory(): ReadingHistoryEntry[] {
  return Object.values(readRecordMap<ReadingHistoryEntry>(STORAGE_KEYS.readingHistory))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function pushReadingHistory(entry: ReadingHistoryEntry): void {
  const current = readRecordMap<ReadingHistoryEntry>(STORAGE_KEYS.readingHistory)
  current[entry.key] = entry
  const sorted = Object.values(current)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 100)
  saveRecordMap(
    STORAGE_KEYS.readingHistory,
    Object.fromEntries(sorted.map((item) => [item.key, item])),
  )
}

export function listReadingProgress(): ReadingProgress[] {
  return Object.values(readRecordMap<ReadingProgress>(STORAGE_KEYS.readingProgress))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getReadingProgress(bookKey: string): ReadingProgress | null {
  return readRecordMap<ReadingProgress>(STORAGE_KEYS.readingProgress)[bookKey] ?? null
}

export function saveReadingProgress(progress: ReadingProgress): void {
  const current = readRecordMap<ReadingProgress>(STORAGE_KEYS.readingProgress)
  current[progress.key] = progress
  saveRecordMap(STORAGE_KEYS.readingProgress, current)
}

export function listDownloadedBooks(): DownloadedBook[] {
  return Object.values(readRecordMap<DownloadedBook>(STORAGE_KEYS.downloads))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getDownloadedBook(bookKey: string): DownloadedBook | null {
  return readRecordMap<DownloadedBook>(STORAGE_KEYS.downloads)[bookKey] ?? null
}

export function saveDownloadedBook(download: DownloadedBook): void {
  const current = readRecordMap<DownloadedBook>(STORAGE_KEYS.downloads)
  current[download.key] = download
  saveRecordMap(STORAGE_KEYS.downloads, current)
  saveCacheMetadata({
    key: `download:${download.key}`,
    kind: "download",
    updatedAt: download.updatedAt,
    size: download.downloadedCount,
    title: download.bookTitle,
  })
}

export function clearDownloadRecords(): void {
  saveRecordMap(STORAGE_KEYS.downloads, {})
  clearCacheMetadataByKind("download")
}

export function makeStoredBookKey(sourceId: string, bookId: string, detailUrl?: string): string {
  return makeBookKey(sourceId, bookId, detailUrl)
}

export function getReadingGoal(): ReadingGoal {
  return {
    ...DEFAULT_READING_GOAL,
    ...(Storage.get<ReadingGoal>(STORAGE_KEYS.readingGoal) ?? {}),
  }
}

export function saveReadingGoal(goal: ReadingGoal): void {
  Storage.set(STORAGE_KEYS.readingGoal, goal)
}

export function listReadingStats(): ReadingDayStat[] {
  return Object.values(readRecordMap<ReadingDayStat>(STORAGE_KEYS.readingStats))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getReadingStat(dateKey: string): ReadingDayStat | null {
  return readRecordMap<ReadingDayStat>(STORAGE_KEYS.readingStats)[dateKey] ?? null
}

export function getTodayReadingStat(): ReadingDayStat {
  const today = localDateKey()
  return getReadingStat(today) ?? {
    date: today,
    totalSeconds: 0,
    sessions: 0,
    completedGoal: false,
    updatedAt: new Date().toISOString(),
    books: [],
  }
}

export function addReadingDuration({
  seconds,
  bookTitle,
  at = new Date(),
}: {
  seconds: number
  bookTitle?: string
  at?: Date
}): void {
  if (seconds <= 0) return

  const date = localDateKey(at)
  const current = readRecordMap<ReadingDayStat>(STORAGE_KEYS.readingStats)
  const previous = current[date]
  const goal = getReadingGoal()
  const nextSeconds = (previous?.totalSeconds ?? 0) + seconds

  current[date] = {
    date,
    totalSeconds: nextSeconds,
    sessions: (previous?.sessions ?? 0) + 1,
    completedGoal: goal.enabled ? nextSeconds >= goal.dailyMinutes * 60 : false,
    updatedAt: new Date().toISOString(),
    books: Array.from(new Set([...(previous?.books ?? []), ...(bookTitle ? [bookTitle] : [])])),
  }

  saveRecordMap(STORAGE_KEYS.readingStats, current)
}

export function getRecentReadingStats(days: number): ReadingDayStat[] {
  const current = readRecordMap<ReadingDayStat>(STORAGE_KEYS.readingStats)
  return lastNDates(days).map((date) => current[date] ?? {
    date,
    totalSeconds: 0,
    sessions: 0,
    completedGoal: false,
    updatedAt: "",
    books: [],
  })
}

export function getReadingStreak(): number {
  const current = readRecordMap<ReadingDayStat>(STORAGE_KEYS.readingStats)
  const goal = getReadingGoal()
  let streak = 0
  let cursor = localDateKey()

  while (true) {
    const day = current[cursor]
    if (!day) break

    const passed = goal.enabled
      ? day.totalSeconds >= goal.dailyMinutes * 60
      : day.totalSeconds > 0
    if (!passed) break

    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }

  return streak
}
