import { ReaderThemePreset } from "../types"

// 主题配色工具：支持 light/dark 双配置、custom 无解析、浮层 surface 色派生

export type ColorSchemeName = "light" | "dark"

export type ThemePalette = {
  textColor: string
  backgroundColor: string
}

export type ThemePresetDefinition = {
  /** 展示名称 */
  label: string
  light: ThemePalette
  dark: ThemePalette
}

/**
 * 内置主题配色。每个 preset 同时给出浅色/深色两套，
 * 由 ReaderPage 根据当前系统 colorScheme 运行时挑选。
 */
export const BUILTIN_THEME_PRESETS: Record<Exclude<ReaderThemePreset, "custom">, ThemePresetDefinition> = {
  paper: {
    label: "纸张",
    light: { textColor: "#1F1A17", backgroundColor: "#F6EEDF" },
    dark: { textColor: "#E8DFCE", backgroundColor: "#1A1714" },
  },
  sepia: {
    label: "暖棕",
    light: { textColor: "#3A2E24", backgroundColor: "#E8D7BE" },
    dark: { textColor: "#D7C4A8", backgroundColor: "#2A211A" },
  },
  night: {
    label: "夜读",
    // 白天用偏白灰 + 深色文字（避免白天也强制黑底）
    light: { textColor: "#1C1C1E", backgroundColor: "#F2F2F2" },
    dark: { textColor: "#E8E6E3", backgroundColor: "#15171A" },
  },
  grass: {
    label: "绿豆沙",
    light: { textColor: "#1F2A18", backgroundColor: "#E7ECD4" },
    dark: { textColor: "#C7D0B6", backgroundColor: "#1A201C" },
  },
  ocean: {
    label: "深蓝",
    light: { textColor: "#1C2736", backgroundColor: "#E8EEF4" },
    dark: { textColor: "#C4CED8", backgroundColor: "#0F1621" },
  },
}

/**
 * 读取 preset 在指定 scheme 下的实际配色。
 * 若 preset 为 custom 或未知，返回 null（调用方应退回使用 preferences 里保存的自定义色）。
 */
export function resolveThemeColors(
  preset: ReaderThemePreset,
  scheme: ColorSchemeName,
): ThemePalette | null {
  if (preset === "custom") return null
  const def = BUILTIN_THEME_PRESETS[preset]
  if (!def) return null
  return scheme === "dark" ? def.dark : def.light
}

// ---------- 颜色工具：生成"表面层"颜色（浮层底）----------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().replace(/^#/, "")
  if (m.length !== 6 && m.length !== 3) return null
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

function toHex(n: number): string {
  const s = clamp(Math.round(n), 0, 255).toString(16)
  return s.length === 1 ? "0" + s : s
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
      case gn: h = (bn - rn) / d + 2; break
      case bn: h = (rn - gn) / d + 4; break
    }
    h /= 6
  }
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hue2rgb(p, q, h + 1 / 3) * 255
  const g = hue2rgb(p, q, h) * 255
  const b = hue2rgb(p, q, h - 1 / 3) * 255
  return { r, g, b }
}

/**
 * 基于背景色派生一层"表面色"：
 * - 浅色方案：L 降低 0.06（稍深）
 * - 深色方案：L 提升 0.06（稍亮）
 * 用于朗读浮层控制条的底色，和主题同色系但视觉上能区分出来。
 */
export function deriveSurfaceColor(backgroundHex: string, scheme: ColorSchemeName): string {
  const rgb = parseHex(backgroundHex)
  if (!rgb) return backgroundHex
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const delta = 0.06
  const nextL = scheme === "dark" ? clamp(l + delta, 0, 1) : clamp(l - delta, 0, 1)
  const out = hslToRgb(h, s, nextL)
  return "#" + toHex(out.r) + toHex(out.g) + toHex(out.b)
}
