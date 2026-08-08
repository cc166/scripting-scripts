export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const base = new Date(`${dateKey}T00:00:00`)
  base.setDate(base.getDate() + deltaDays)
  return localDateKey(base)
}

export function lastNDates(days: number, endDate = new Date()): string[] {
  const list: string[] = []
  const cursor = new Date(endDate)

  for (let index = days - 1; index >= 0; index -= 1) {
    const next = new Date(cursor)
    next.setDate(cursor.getDate() - index)
    list.push(localDateKey(next))
  }

  return list
}
