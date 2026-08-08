import { Color, Widget, useReducer } from 'scripting'

export interface Settings {
  fontSize: number
  textColor: { light: Color; dark: Color }
  timeColor: { light: Color; dark: Color }
  background: { light: Color; dark: Color }
  frostedBackground: boolean
  lineLimit: number
  gap: number
  /** 正则过滤排除 */
  exclude: string
}

const TRANSPARENT_BACKGROUND: Settings['background'] = {
  light: 'rgba(255, 255, 255, 0)',
  dark: 'rgba(255, 255, 255, 0)'
}

const LEGACY_BACKGROUND: Settings['background'] = {
  light: '#ffffff',
  dark: '#242426'
}

function isLegacyBackground(background: Settings['background'] | undefined) {
  return (
    background?.light === LEGACY_BACKGROUND.light &&
    background?.dark === LEGACY_BACKGROUND.dark
  )
}

export function getSettings(): Settings {
  const storedSettings = Storage.get<Settings>('settings')
  const background = isLegacyBackground(storedSettings?.background)
    ? TRANSPARENT_BACKGROUND
    : storedSettings?.background ?? TRANSPARENT_BACKGROUND
  const settings: Settings = {
    fontSize: 12,
    textColor: { light: '#232323', dark: '#ffffff' },
    timeColor: { light: '#707070', dark: '#c2c2c2' },
    frostedBackground: true,
    lineLimit: 2,
    gap: 4,
    exclude: '',
    ...storedSettings,
    background
  }

  if (storedSettings && isLegacyBackground(storedSettings.background)) {
    Storage.set('settings', settings)
  }
  return settings
}

function reducer(state: Settings, action: Settings) {
  return { ...state, ...action }
}

export function useSettings() {
  const [state, dispatch] = useReducer(reducer, getSettings())
  function setSettings(data: Partial<Settings>) {
    const newState = { ...state, ...data }
    Storage.set('settings', newState)
    Widget.reloadAll()
    dispatch(newState)
  }
  return [state, setSettings] as const
}
