import { getSetting } from "./setting"
import { resolveCategory, CategoryInfo } from "./category"

const schema: JSONSchemaObject = {
  type: "object",
  properties: {
    code: {
      type: "string",
      required: true,
      description: "取餐码、取件码"
    },
    seller: {
      type: "string",
      required: false,
      description: "商家名称、商店名称、门店名称、服务商"
    },
    items: {
      type: "array",
      items: {
        type: "string",
        description: "商品名称、产品名称、快递地址"
      },
      required: false,
      description: "商品名称、产品名称、快递地址"
    },
    category: {
      type: "string",
      required: false,
      description: "订单所属品类，如汉堡、奶茶、咖啡、外卖餐食等"
    }
  },
  description: ""
}

export type AssistantResult = {
  content: Record<string, any>
  categoryInfo: CategoryInfo
}

function validateAssistantResp(
  data: Record<string, any>
) {
  if (typeof data !== "object" || data == null) {
    throw Error(`validateAssistantResp: Invalid value type, ${typeof data}`)
  }

  for (const [sk, sv] of Object.entries(schema.properties)) {
    const val = data[sk]
    if (sv.required && (val == null || val === "")) {
      throw Error(`validateAssistantResp: Missing required value, ${JSON.stringify(data)}`)
    }
  }
}

export async function requestAssistant(input: string | UIImage): Promise<AssistantResult> {
  let data: Record<string, any>
  const prompt = getSetting("modelPrompt")
  const modelProvider = getSetting("modelProvider")
  const provider = modelProvider === "custom" 
    ? { custom: getSetting("modelCustomProvider") }
    : modelProvider
  const options = {
    provider: provider,
    modelId: getSetting("modelId")
  }

  if (typeof input === "string") {
    data = await Assistant.requestStructuredData(
      `${prompt}\n${input}`,
      schema,
      options
    )
  } else {
    const base64Data = input.toJPEGBase64String(0.5)
    const base64Image = `data:image/jpeg;base64,${base64Data}`
    data = await Assistant.requestStructuredData(
      prompt,
      [base64Image],
      schema,
      options
    )
  }
  validateAssistantResp(data)
  return {
    content: data,
    categoryInfo: resolveCategory(data)
  }
}