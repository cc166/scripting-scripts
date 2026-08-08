export function makeBookKey(sourceId: string, bookId: string, detailUrl?: string): string {
  return `${sourceId}:${detailUrl || bookId}`
}
