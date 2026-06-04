import { env } from "@follow/shared/env.desktop"
import { getEntry } from "@follow/store/entry/getter"
import type { HttpChatTransportInitOptions, UIMessageChunk } from "ai"
import { HttpChatTransport, parseJsonEventStream, uiMessageChunkSchema } from "ai"

import { getAISettings } from "~/atoms/settings/ai"

import { getAIModelState } from "../atoms/session"
import { AIPersistService } from "../services"
import type { BizUIMessage } from "./types"

type TitleHandlerPersistOption = boolean | ((title: string) => void | Promise<void>)

export interface TitleHandlerOptions {
  chatId?: string
  shouldHandle?: () => boolean
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export interface CreateChatTransportOptions {
  onValue?: (value: UIMessageChunk) => void
  titleHandler?: TitleHandlerOptions
}

export interface CreateChatTitleHandlerOptions {
  chatId: string
  getActiveChatId: () => string | null | undefined
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export function createChatTitleHandler(
  options: CreateChatTitleHandlerOptions,
): TitleHandlerOptions {
  const { chatId, getActiveChatId, onTitleChange, persist } = options

  return {
    chatId,
    persist,
    onTitleChange,
    shouldHandle: () => getActiveChatId() === chatId,
  }
}

/**
 * Create a chat transport for AI SDK
 * This is used by the AbstractChat instance to communicate with AI providers
 */
export function createChatTransport({ onValue, titleHandler }: CreateChatTransportOptions = {}) {
  const {byok} = getAISettings()
  const hasByok = byok?.enabled && byok.providers && byok.providers.length > 0

  if (hasByok) {
    const modelState = getAIModelState()
    const selectedModelRaw = modelState.selectedModel || ""
    const selectedModelName = selectedModelRaw.startsWith("openai/") ? selectedModelRaw.replace("openai/", "") : (selectedModelRaw.startsWith("custom/") ? selectedModelRaw.replace("custom/", "") : selectedModelRaw)

    let provider = byok!.providers.find(p => p.models?.includes(selectedModelName) || p.model === selectedModelName)
    if (!provider) provider = byok!.providers[0]!

    let baseApi = provider.baseURL?.trim() || "https://api.openai.com/v1/chat/completions"
    if (!baseApi.endsWith("/chat/completions")) {
      baseApi = baseApi.endsWith("/") ? `${baseApi}chat/completions` : `${baseApi}/chat/completions`
    }

    return new ExtendChatTransport({
      onValue,
      titleHandler,
      api: baseApi,
      fetch: async (url, init) => {
        let bodyObj: any = {}
        if (init?.body && typeof init.body === 'string') {
          try { bodyObj = JSON.parse(init.body) } catch{}
        }
        
        const messages = bodyObj.messages || []
        const mappedMessages = messages.map((m: any) => {
          let {content} = m
          if (Array.isArray(m.parts)) {
            content = m.parts.map((p: any) => {
              if (p.text) return p.text
              
              if (p.type === "data-block" && Array.isArray(p.data)) {
                return p.data.map((block: any) => {
                  if (block.type === "mainEntry" && block.value) {
                    const entry = getEntry(block.value)
                    if (entry) {
                      const entryContent = entry.readabilityContent || entry.content || ""
                      return `\n\n[Reference Context: ${entry.title}]\n${entryContent}\n\n`
                    }
                  }
                  return "" // Do not stringify raw internal blocks to AI
                }).join("\n")
              }
              
              if (p.type === "data-rich-text" && p.data) {
                const textContext = p.data.text || ""
                let mentionsContext = ""
                
                if (p.data.state) {
                  try {
                    const stateObj = JSON.parse(p.data.state)
                    const mentions: any[] = []
                    const traverse = (node: any) => {
                      if (node?.type === 'mention' && node.mentionData) {
                        mentions.push(node.mentionData)
                      }
                      if (node?.children && Array.isArray(node.children)) {
                        node.children.forEach(traverse)
                      }
                    }
                    if (stateObj.root) traverse(stateObj.root)
                    
                    mentions.forEach(mention => {
                       if (mention.type === "entry" && mention.id) {
                         const entry = getEntry(mention.id)
                         if (entry) {
                           const entryContent = entry.readabilityContent || entry.content || ""
                           mentionsContext += `\n\n[Mentioned Context: ${entry.title}]\n${entryContent}\n\n`
                         }
                       }
                    })
                  } catch{}
                }
                
                return `${mentionsContext}\n${textContext}`
              }
              
              return typeof p.data === 'string' ? p.data : (p.data ? JSON.stringify(p.data) : "")
            }).join('\n')
          }
          return {
            role: m.role === 'data' ? 'user' : m.role,
            content: content || ''
          }
        })

        let targetUrl = provider.baseURL?.trim() || "https://api.openai.com/v1/chat/completions"
        if (!targetUrl.endsWith("/chat/completions")) {
          targetUrl = targetUrl.endsWith("/") ? `${targetUrl}chat/completions` : `${targetUrl}/chat/completions`
        }
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...provider.headers
        }
        if (provider.apiKey) {
          headers["Authorization"] = `Bearer ${provider.apiKey}`
        }

        let modelToUse = selectedModelName || ""
        if (!modelToUse || modelToUse === "byok") {
          modelToUse = (provider.models && provider.models.length > 0) ? provider.models[0]! : (provider.model || provider.provider || "gpt-3.5-turbo")
        }

        const response = await window.fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: modelToUse,
            messages: mappedMessages,
            stream: true
          }),
          signal: init?.signal
        })

        if (!response.ok || !response.body) return response

        const transformStream = new TransformStream<Uint8Array, Uint8Array>({
          start() {
            (this as any).buffer = ""
            ;(this as any).hasStarted = false
          },
          transform(chunk, controller) {
            const decoder = new TextDecoder()
            const encoder = new TextEncoder()
            const self = this as any
            
            self.buffer += decoder.decode(chunk, { stream: true })
            const lines = self.buffer.split("\n")
            self.buffer = lines.pop() || ""
            
            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith("data:")) {
                const dataStr = trimmed.slice(5).trim()
                if (dataStr === "[DONE]") {
                  const finishObj = { type: "finish", finishReason: "stop" }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishObj)}\n\n`))
                  continue
                }
                try {
                  const data = JSON.parse(dataStr)
                  const text = data.choices?.[0]?.delta?.content
                  if (text) {
                    if (!(this as any).hasStarted) {
                      const startObj = { type: "text-start", id: "0" }
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(startObj)}\n\n`))
                      ;(this as any).hasStarted = true
                    }
                    const textObj = { type: "text-delta", delta: text, id: "0" }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(textObj)}\n\n`))
                  }
                } catch {}
              }
            }
          },
          flush(controller) {
            // handle any remaining complete JSON lines if needed
          }
        })

        return new Response(response.body.pipeThrough(transformStream), {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        })
      },
      body: () => {
        const modelState = getAIModelState()
        const { selectedModel } = modelState
        return selectedModel ? { model: selectedModel } : {}
      },
    })
  }

  return new ExtendChatTransport({
    onValue,
    titleHandler,
    // Custom fetch configuration
    api: `${env.VITE_API_URL}/ai/chat`,
    credentials: "include",
    // Add selected model to request body
    body: () => {
      const modelState = getAIModelState()
      const { selectedModel } = modelState

      return selectedModel ? { model: selectedModel } : {}
    },
  })
}

type UIMessageChunkParseResult =
  ReturnType<typeof parseJsonEventStream<UIMessageChunk>> extends ReadableStream<infer T>
    ? T
    : never

const coerceFinishChunk = (chunk: UIMessageChunkParseResult): UIMessageChunk | null => {
  const { rawValue } = chunk
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null
  }

  if ((rawValue as { type?: unknown }).type !== "finish") {
    return null
  }

  const { finishReason, messageMetadata } = rawValue as {
    finishReason?: unknown
    messageMetadata?: unknown
  }

  return {
    type: "finish",
    finishReason: typeof finishReason === "string" ? finishReason : undefined,
    messageMetadata,
  } as UIMessageChunk
}

class ExtendChatTransport extends HttpChatTransport<BizUIMessage> {
  constructor(
    private options: HttpChatTransportInitOptions<BizUIMessage> & {
      onValue?: (value: UIMessageChunk) => void
      titleHandler?: TitleHandlerOptions
    },
  ) {
    super(options)
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    const { onValue } = this.options || {}
    const handleGeneratedTitle = this.handleGeneratedTitle.bind(this)
    return parseJsonEventStream({
      stream,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<UIMessageChunkParseResult, UIMessageChunk>({
        async transform(chunk, controller) {
          const parsedChunk = chunk.success ? chunk.value : coerceFinishChunk(chunk)
          if (!parsedChunk) {
            throw chunk.error
          }

          await handleGeneratedTitle(parsedChunk)
          onValue?.(parsedChunk)
          controller.enqueue(parsedChunk)
        },
      }),
    )
  }

  private async handleGeneratedTitle(chunk: UIMessageChunk) {
    const { titleHandler } = this.options
    if (!titleHandler) {
      return
    }

    if (chunk.type !== "data-generated-title" || typeof chunk.data !== "string") {
      return
    }

    const shouldHandle = titleHandler.shouldHandle?.() ?? true
    if (!shouldHandle) {
      return
    }

    titleHandler.onTitleChange?.(chunk.data)

    const persistOption = titleHandler.persist
    const shouldPersist = persistOption === undefined ? true : persistOption

    if (!shouldPersist) {
      return
    }

    try {
      if (typeof persistOption === "function") {
        await persistOption(chunk.data)
        return
      }

      if (titleHandler.chatId) {
        await AIPersistService.updateSessionTitle(titleHandler.chatId, chunk.data)
      }
    } catch (error) {
      console.error("Failed to persist generated title:", error)
    }
  }

  override reconnectToStream(
    options: Parameters<HttpChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ) {
    options.chatId = encodeURIComponent(options.chatId)
    return super.reconnectToStream(options)
  }
}
