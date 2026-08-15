import type { Color } from "scripting"

export function getLevelColor(level: number): { light: Color; dark: Color } {
  const lightColors: Color[] = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"]
  const darkColors: Color[] = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]

  return {
    light: lightColors[level] || lightColors[0],
    dark: darkColors[level] || darkColors[0],
  }
}
