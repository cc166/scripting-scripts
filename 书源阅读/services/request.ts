import { fetch, Headers, RequestInit } from "scripting"
import { StoredBookSource } from "../types"

type RequestConfig = {
  url: string
  method: "GET" | "POST"
  body?: string
  headers: Record<string, string>
  retry: number
  timeout: number
}

type FetchDocument = {
  text: string
  url: string
  isJson: boolean
  json?: any
}

function interpolate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

function parseObjectHeader(input: string | Record<string, string> | undefined): Record<string, string> {
  if (!input) return {}
  if (typeof input !== "string") return input

  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
        ),
      )
    }
  } catch {
    return {}
  }

  return {}
}

function splitRuleUrl(raw: string): {
  baseUrl: string
  extra?: Record<string, any>
} {
  const marker = "##{"
  const index = raw.indexOf(marker)

  if (index === -1) {
    return { baseUrl: raw }
  }

  const baseUrl = raw.slice(0, index)
  const jsonText = raw.slice(index + 2)

  try {
    return {
      baseUrl,
      extra: JSON.parse(jsonText),
    }
  } catch {
    return { baseUrl: raw }
  }
}

export function resolveRelativeUrl(url: string, baseUrl: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url

  const protocolMatch = baseUrl.match(/^(https?:)\/\//i)
  const originMatch = baseUrl.match(/^(https?:\/\/[^/]+)/i)
  const protocol = protocolMatch?.[1] ?? "https:"
  const origin = originMatch?.[1] ?? ""

  if (url.startsWith("//")) {
    return `${protocol}${url}`
  }

  if (url.startsWith("/")) {
    return `${origin}${url}`
  }

  const normalizedBase = baseUrl.replace(/[?#].*$/, "")
  const baseDir = normalizedBase.endsWith("/")
    ? normalizedBase
    : normalizedBase.slice(0, normalizedBase.lastIndexOf("/") + 1)

  return `${baseDir}${url}`.replace(/([^:]\/)\/+/g, "$1")
}

export function buildRequestConfig(
  source: StoredBookSource,
  rawUrl: string,
  variables: Record<string, string> = {},
): RequestConfig {
  const { baseUrl, extra } = splitRuleUrl(rawUrl)
  const url = interpolate(baseUrl, variables)
  const sourceHeaders = parseObjectHeader(source.header)
  const extraHeaders = parseObjectHeader(extra?.headers)
  const headers = {
    ...sourceHeaders,
    ...extraHeaders,
  }

  const method = String(extra?.method ?? "GET").toUpperCase() === "POST" ? "POST" : "GET"
  const body = typeof extra?.body === "string" ? interpolate(extra.body, variables) : undefined

  if (method === "POST" && body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
  }

  return {
    url,
    method,
    body,
    headers,
    retry: typeof extra?.retry === "number" ? Math.max(0, Math.min(3, extra.retry)) : 1,
    timeout: typeof extra?.timeout === "number" ? Math.max(5, Math.min(60, extra.timeout)) : 15,
  }
}

export async function fetchDocument(
  source: StoredBookSource,
  rawUrl: string,
  variables: Record<string, string> = {},
  baseUrl?: string,
): Promise<FetchDocument> {
  const request = buildRequestConfig(source, resolveRelativeUrl(rawUrl, baseUrl ?? source.bookSourceUrl), variables)
  const headers = new Headers(request.headers)
  const init: RequestInit = {
    method: request.method,
    headers,
    timeout: request.timeout,
    debugLabel: `BookSource:${source.bookSourceName}`,
    allowInsecureRequest: /^http:\/\//i.test(request.url),
  }

  if (request.method === "POST" && request.body) {
    init.body = request.body
  }

  let response: Awaited<ReturnType<typeof fetch>> | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt <= request.retry; attempt += 1) {
    try {
      response = await fetch(request.url, init)
      if (!response.ok) {
        throw new Error(`请求失败（HTTP ${response.status}）`)
      }
      lastError = null
      break
    } catch (error) {
      lastError = error
      response = null
    }
  }

  if (!response) {
    throw new Error(String(lastError ?? "请求失败"))
  }

  const text = await response.text()
  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json") || /^[\s\r\n]*[\[{]/.test(text)

  if (!isJson) {
    return {
      text,
      url: request.url,
      isJson,
    }
  }

  try {
    return {
      text,
      url: request.url,
      isJson,
      json: JSON.parse(text),
    }
  } catch {
    return {
      text,
      url: request.url,
      isJson: false,
    }
  }
}
