import { Button, List, NavigationLink, Section, Text, Toggle, useState } from "scripting"
import { deleteSource, getActiveSourceId, getSourceProbeStatus, setActiveSourceId, updateSource } from "../storage"
import { StoredBookSource } from "../types"
import { SourceDebugPage } from "./SourceDebugPage"

function statusText(sourceId: string): string {
  const status = getSourceProbeStatus(sourceId)
  if (!status) return "未测试"
  if (status.success) return `已通过 · ${new Date(status.updatedAt).toLocaleString()}`
  return `失败(${status.stage}) · ${new Date(status.updatedAt).toLocaleString()}`
}

export function SourceManagePage({
  source,
  onChanged,
}: {
  source: StoredBookSource
  onChanged: () => void
}) {
  const [enabled, setEnabled] = useState(source.enabled)
  const [active, setActive] = useState(getActiveSourceId() === source.id)

  return (
    <List navigationTitle={source.bookSourceName}>
      <Section header={<Text>基本信息</Text>}>
        <Text>站点：{source.bookSourceUrl}</Text>
        <Text>分组：{source.bookSourceGroup || "未分组"}</Text>
        <Text>适配器：{source.adapter}</Text>
        <Text>状态：{statusText(source.id)}</Text>
        {source.notes ? <Text>{source.notes}</Text> : undefined}
      </Section>

      <Section header={<Text>书源状态</Text>}>
        <Toggle
          title="启用此书源"
          value={enabled}
          onChanged={(value) => {
            updateSource(source.id, { enabled: value })
            setEnabled(value)
            onChanged()
          }}
        />
        <Button
          title={active ? "当前搜索主源" : "设为当前搜索主源"}
          action={() => {
            setActiveSourceId(source.id)
            setActive(true)
            onChanged()
          }}
          disabled={active}
        />
        <Text font="caption" foregroundStyle="secondaryLabel">
          “启用”控制书源是否参与使用，“当前搜索主源”控制首页默认搜索用哪一个书源。
        </Text>
      </Section>

      <Section header={<Text>调试</Text>}>
        <NavigationLink
          title="立即试源"
          destination={<SourceDebugPage source={source} keyword="凡人修仙传" />}
        />
      </Section>

      {!source.builtin ? (
        <Section header={<Text>危险操作</Text>}>
          <Button
            title="删除这个书源"
            role="destructive"
            action={() => {
              deleteSource(source.id)
              onChanged()
            }}
          />
        </Section>
      ) : undefined}
    </List>
  )
}
