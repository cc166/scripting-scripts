import {
  List, Section, Text, HStack, VStack, Image, Spacer, NavigationLink,
  Button, Widget, useState, ZStack,
} from "scripting"
import { Anniversary } from "../util/const"
import {
  loadAnniversaries, removeAnniversary, moveAnniversary, resetAnniversaries,
} from "../util/store"
import { daysSince, daysUntil } from "../util/time"
import AnniversaryEdit from "./AnniversaryEdit"

export default function AnniversaryList() {
  const [items, setItems] = useState<Anniversary[]>(() => loadAnniversaries())

  const refresh = () => {
    setItems(loadAnniversaries())
    Widget.reloadAll()
  }

  const onDelete = async (a: Anniversary) => {
    const ok = await Dialog.confirm({ title: "删除", message: `删除「${a.title}」？` })
    if (!ok) return
    removeAnniversary(a.id)
    refresh()
  }

  const onMove = (a: Anniversary, dir: -1 | 1) => {
    moveAnniversary(a.id, dir)
    refresh()
  }

  const onReset = async () => {
    const ok = await Dialog.confirm({ title: "恢复预设", message: "覆盖现有纪念日？" })
    if (!ok) return
    resetAnniversaries()
    refresh()
  }

  return (
    <List
      navigationTitle="纪念日"
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: (
          <NavigationLink destination={<AnniversaryEdit onSaved={refresh} />}>
            <Image systemName="plus" />
          </NavigationLink>
        ),
      }}
    >
      <Section
        header={<Text>共 {items.length} 项 · 仅前 2 个会显示在中/大组件</Text>}
        footer={
          <Text font={12} foregroundStyle="secondaryLabel">
            点击行进入编辑；左滑可删除 / 上移 / 下移。
          </Text>
        }
      >
        {items.map((a: Anniversary, idx: number) => {
          const days = a.mode === "past" ? daysSince(a.date) : daysUntil(a.date, a.yearly)
          const tag = a.mode === "past" ? "已经" : "距离"
          return (
            <NavigationLink key={a.id}
              destination={<AnniversaryEdit anniversaryId={a.id} onSaved={refresh} />}
              trailingSwipeActions={{
                allowsFullSwipe: true,
                actions: [
                  <Button
                    title="删除"
                    systemImage="trash"
                    role="destructive"
                    action={() => onDelete(a)}
                  />,
                  <Button
                    title="下移"
                    systemImage="arrow.down"
                    action={() => onMove(a, 1)}
                  />,
                  <Button
                    title="上移"
                    systemImage="arrow.up"
                    action={() => onMove(a, -1)}
                  />,
                ],
              }}
            >
              <HStack spacing={12}>
                <ZStack
                  frame={{ width: 38, height: 38 }}
                  background={a.color}
                  clipShape={{ type: "rect", cornerRadius: 10 }}
                >
                  <Image
                    systemName={a.icon}
                    font={20}
                    foregroundStyle="white"
                  />
                </ZStack>
                <VStack alignment="leading" spacing={2}>
                  <Text fontWeight="semibold">{a.title}</Text>
                  <Text font={11} foregroundStyle="secondaryLabel">
                    {a.date}{a.yearly ? " · 每年" : ""}
                  </Text>
                </VStack>
                <Spacer />
                <VStack alignment="trailing" spacing={0}>
                  <Text font={22} fontWeight="bold" foregroundStyle={a.color}>
                    {Math.abs(days)}
                  </Text>
                  <Text font={10} foregroundStyle="secondaryLabel">
                    {tag} (天)
                  </Text>
                </VStack>
              </HStack>
            </NavigationLink>
          )
        })}
      </Section>

      <Section>
        <Button title="恢复预设" systemImage="arrow.counterclockwise" action={onReset} />
      </Section>
    </List>
  )
}
