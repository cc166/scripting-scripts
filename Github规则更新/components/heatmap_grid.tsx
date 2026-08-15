import { HStack, VStack, Color, RoundedRectangle } from "scripting"
import { ContributionDay, ContributionWeek } from "../types"

type HeatmapGridProps = {
  weeks: ContributionWeek[]
  getLevelColor: (level: number) => { light: Color; dark: Color }
  cellSize?: number
  spacing?: number
  cornerRadius?: number
}

const EMPTY_CELL_COLOR: { light: Color; dark: Color } = {
  light: "rgba(0, 0, 0, 0)",
  dark: "rgba(0, 0, 0, 0)",
}

function normalizeWeek(week: ContributionWeek): Array<ContributionDay | null> {
  const normalized = new Array<ContributionDay | null>(7).fill(null)
  for (const day of week) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay()
    normalized[weekday] = day
  }
  return normalized
}

/** GitHub 风格：每周一列（上=周日，下=周六），周与周横向堆叠 */
export function HeatmapGrid({
  weeks,
  getLevelColor,
  cellSize = 11,
  spacing = 2.5,
  cornerRadius = 2,
}: HeatmapGridProps) {
  return (
    <HStack spacing={spacing} alignment="center">
      {weeks.map((week, weekIndex) => (
        <VStack key={weekIndex} spacing={spacing}>
          {normalizeWeek(week).map((day, dayIndex) => (
            <RoundedRectangle
              cornerRadius={cornerRadius}
              key={dayIndex}
              frame={{ width: cellSize, height: cellSize }}
              fill={day ? getLevelColor(day.level) : EMPTY_CELL_COLOR}
            />
          ))}
        </VStack>
      ))}
    </HStack>
  )
}
