import {
  List, Section, Text, TextField, Button, HStack, VStack, Image, Spacer,
  Picker, Toggle, DatePicker, Navigation,Widget, ZStack, Color,
  useState, useMemo,
} from "scripting"
import { Anniversary, ANNIV_ICON_PRESETS, COLOR_PRESETS } from "../util/const"
import { loadAnniversaries, upsertAnniversary, newId } from "../util/store"
import { daysSince, daysUntil, fmtDate, parseDate } from "../util/time"

interface Props {
  anniversaryId?: string
  onSaved?: () => void
}

export default function AnniversaryEdit({ anniversaryId, onSaved }: Props) {
  const dismiss = Navigation.useDismiss()

  const original = useMemo<Anniversary | undefined>(() => {
    if (!anniversaryId) return undefined
    return loadAnniversaries().find(i => i.id === anniversaryId)
  }, [anniversaryId])
  const isCreate = !original

  const [title, setTitle] = useState(original?.title ?? "")
  const [mode, setMode] = useState<"past" | "future">(original?.mode ?? "past")
  // DatePicker 的 value/onChanged 是毫秒时间戳；这里直接用 number 状态
  const [dateTs, setDateTs] = useState<number>(
    () => (original ? parseDate(original.date).getTime() : Date.now())
  )
  const [color, setColor] = useState<Color>(original?.color ?? "systemPink")
  const [icon, setIcon] = useState(original?.icon ?? "heart.fill")
  const [yearly, setYearly] = useState(original?.yearly ?? false)

  const canSave = title.trim().length > 0
  const date = new Date(dateTs)

  const days = mode === "past"
    ? daysSince(fmtDate(date))
    : daysUntil(fmtDate(date), yearly)

  const save = async () => {
    if (!canSave) {
      Dialog.alert({ message: "请填写文案" })
      return
    }
    const next: Anniversary = {
      id: original?.id ?? newId("anv"),
      title: title.trim(),
      mode,
      date: fmtDate(date),
      color,
      icon,
      yearly: mode === "future" ? yearly : false,
    }
    upsertAnniversary(next)
    Widget.reloadAll()
    onSaved?.()
    dismiss()
  }

  return (
    <List
      navigationTitle={isCreate ? "新增纪念日" : "编辑纪念日"}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: <Button title="保存" action={save} disabled={!canSave} />,
      }}
    >
      <Section
        header={<Text>文案</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            文案显示在卡片顶部，例如「我和小美 · 在一起」、「距离高考」。
          </Text>
        }
      >
        <HStack>
          <Text>文案</Text>
          <TextField title="" value={title} onChanged={setTitle}
            prompt="如：在一起 / 距离高考 / 宝宝出生" />
        </HStack>

        <Picker title="模式" value={mode} onChanged={(v: any) => setMode(v)}>
          <Text tag="past">已经过去（正计时）</Text>
          <Text tag="future">还有多久（倒计时）</Text>
        </Picker>

        <DatePicker
          title={mode === "past" ? "起始日期" : "目标日期"}
          value={dateTs}
          onChanged={setDateTs}
          displayedComponents={["date"]}
        />

        {mode === "future" && (
          <Toggle title="每年重复（生日 / 节日）" value={yearly} onChanged={setYearly} />
        )}
      </Section>

      <Section header={<Text>图标</Text>}>
        <IconPalette value={icon} onChange={setIcon} color={color} />
      </Section>

      <Section header={<Text>颜色</Text>}>
        <ColorPalette value={color} onChange={setColor} />
      </Section>

      <Section header={<Text>预览</Text>}>
        <HStack spacing={12}>
          <ZStack
            frame={{ width: 48, height: 48 }}
            background={color}
            clipShape={{ type: "rect", cornerRadius: 12 }}
          >
            <Image
              systemName={icon}
              font={28}
              foregroundStyle="white"
            />
          </ZStack>
          <VStack alignment="leading" spacing={2}>
            <Text fontWeight="semibold">{title || "未命名"}</Text>
            <Text font={11} foregroundStyle="secondaryLabel">
              {mode === "past" ? "已经" : "距离"} {Math.abs(days)} 天 · {fmtDate(date)}
            </Text>
          </VStack>
          <Spacer />
        </HStack>
      </Section>
    </List>
  )
}

function IconPalette({
  value, onChange, color,
}: { value: string; onChange: (v: string) => void; color: Color }) {
  const cols = 5
  const rows: string[][] = []
  for (let i = 0; i < ANNIV_ICON_PRESETS.length; i += cols) {
    rows.push(ANNIV_ICON_PRESETS.slice(i, i + cols))
  }
  return (
    <VStack alignment="leading" spacing={10} padding={{ top: 4, bottom: 4 }}>
      {rows.map((row, ri) => (
        <HStack key={`r-${ri}`} spacing={10}>
          {row.map(name => {
            const sel = name === value
            return (
              <ZStack key={name}
                frame={{ width: 40, height: 40 }}
                background={sel ? "systemGray5" : "clear"}
                clipShape={{ type: "rect", cornerRadius: 8 }}
                contentShape="rect"
                onTapGesture={() => onChange(name)}
              >
                <Image
                  systemName={name}
                  font={22}
                  foregroundStyle={sel ? color : "secondaryLabel"}
                />
              </ZStack>
            )
          })}
          <Spacer />
        </HStack>
      ))}
    </VStack>
  )
}

function ColorPalette({
  value, onChange,
}: { value: Color; onChange: (v: Color) => void }) {
  const cols = 6
  const rows: Color[][] = []
  for (let i = 0; i < COLOR_PRESETS.length; i += cols) {
    rows.push(COLOR_PRESETS.slice(i, i + cols))
  }
  return (
    <VStack alignment="leading" spacing={10} padding={{ top: 4, bottom: 4 }}>
      {rows.map((row, ri) => (
        <HStack key={`cr-${ri}`} spacing={14}>
          {row.map(c => {
            const sel = c === value
            return (
              <Image key={c}
                systemName={sel ? "checkmark.circle.fill" : "circle.fill"}
                font={28}
                foregroundStyle={c}
                contentShape="rect"
                onTapGesture={() => onChange(c)}
              />
            )
          })}
          <Spacer />
        </HStack>
      ))}
    </VStack>
  )
}
