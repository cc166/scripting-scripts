import { Script } from "scripting"

const storageKey = "remote-registration-probe-sentinel"
const existing = Storage.get<string>(storageKey)
const sentinel = existing ?? "created-by-v1"
if (existing === null) {
  Storage.set(storageKey, sentinel)
}

console.log(JSON.stringify({
  name: Script.name,
  version: Script.metadata.version,
  remoteResource: Script.metadata.remoteResource ?? null,
  sentinel,
  codeMarker: "v2",
}))

Script.exit()
