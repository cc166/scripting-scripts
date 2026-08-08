import { Script } from "scripting"

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function main(): Promise<void> {
  if (Script.queryParameters.action === "publish") {
    const { publishRepository } = await import("./publish")
    await publishRepository()
  } else {
    const { updateRepository } = await import("./update")
    const summary = await updateRepository()
    console.log(JSON.stringify(summary, null, 2))
  }
  Script.exit()
}

main().catch(error => {
  console.error(errorText(error))
  Script.exit()
})
