import { getEntry } from "@follow/store/entry/getter"
import { setByokSummaryInterceptor } from "@follow/store/summary/store"
import { setByokTranslationInterceptor } from "@follow/store/translation/store"
import { toast } from "sonner"

import { getAISettings } from "~/atoms/settings/ai"

const callByokChatCompletion = async (prompt: string, overrideModel?: string | null) => {
  const {byok} = getAISettings()
  if (!byok?.providers || byok.providers.length === 0) return null

  const selectedModelRaw = overrideModel
  let targetProviderId: string | null = null

  // Strip prefix first
  let modelWithoutPrefix = selectedModelRaw || ""
  if (modelWithoutPrefix.startsWith("openai/")) modelWithoutPrefix = modelWithoutPrefix.replace("openai/", "")
  if (modelWithoutPrefix.startsWith("custom/")) modelWithoutPrefix = modelWithoutPrefix.replace("custom/", "")

  let selectedModelName = modelWithoutPrefix

  if (modelWithoutPrefix.includes("::")) {
    const parts = modelWithoutPrefix.split("::")
    targetProviderId = parts[0] ?? null
    selectedModelName = parts.slice(1).join("::")
  }

  let provider
  if (targetProviderId) {
    provider = byok.providers.find(p => p.provider === targetProviderId)
  }
  if (!provider) {
    provider = byok.providers.find(p => p.models?.includes(selectedModelName) || p.model === selectedModelName)
  }
  if (!provider) provider = byok.providers[0]!

  const fallbackModel = (provider?.models && provider.models.length > 0) ? provider.models[0] : (provider.model || provider.provider || "gpt-3.5-turbo")
  const finalModelName = (!selectedModelName || selectedModelName === "byok") ? fallbackModel : selectedModelName
  
  let targetUrl = provider.baseURL?.trim() || "https://api.openai.com/v1"
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

  try {
    let responseOk: boolean
    let errorText: string = ""
    let responseStatus: number
    let data: any

    // if in electron, use ipc fetch to bypass CORS
    if (window.electron) {
      const { ipcServices } = await import("~/lib/client")
      const result = await ipcServices!.integration.customFetch({
        url: targetUrl,
        method: "POST",
        headers,
        body: JSON.stringify({
          model: finalModelName,
          messages: [{ role: "user", content: prompt }]
        }),
        timeout: 300000, // 5 minutes timeout for local LLMs which might be slow
      })
      responseOk = result.ok
      responseStatus = result.status
      errorText = result.text
      data = result.data
    } else {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: finalModelName,
          messages: [{ role: "user", content: prompt }]
        }),
      })
      responseOk = response.ok
      responseStatus = response.status
      if (!responseOk) {
        errorText = await response.text()
      } else {
        data = await response.json()
      }
    }

    if (!responseOk) {
      console.error("BYOK fetch failed:", errorText)
      toast.error(`翻译请求失败: HTTP ${responseStatus}`, { description: errorText.slice(0, 100) })
      throw new Error(`BYOK Request Failed: ${responseStatus} ${errorText.slice(0, 50)}`)
    }
    return data?.choices?.[0]?.message?.content || null
  } catch (err) {
    console.error("BYOK interceptor error:", err)
    if (err instanceof Error && !err.message.includes("BYOK Request Failed")) {
      toast.error(`翻译请求出错: ${String(err)}`)
    }
    throw err
  }
}

export const initByokInterceptors = () => {
  setByokSummaryInterceptor(async (entryId, target, lang) => {
    const entry = getEntry(entryId)
    if (!entry) return null
    
    const {byok} = getAISettings()


    const content = target === "content" ? entry.content : entry.readabilityContent
    if (!content) return null
    
    const prompt = `Please summarize the following article in language code "${lang}":\n\nTitle: ${entry.title}\n\n${content}`
    const result = await callByokChatCompletion(prompt)
    return result
  })

  setByokTranslationInterceptor(async (entryId, lang, fields, target, mode) => {
    const entry = getEntry(entryId)
    if (!entry) return null
    
    const {byok} = getAISettings()


    const translation: any = {}
    const translationModel = byok?.translationModel
    
    // We do simple parallel translations for requested fields
    const promises = fields.map(async (field) => {
      let contentToTranslate = ""
      if (field === "title") contentToTranslate = entry.title || ""
      if (field === "description") contentToTranslate = entry.description || ""
      if (field === "content") contentToTranslate = entry.content || ""
      if (field === "readabilityContent") contentToTranslate = entry.readabilityContent || ""
      
      if (!contentToTranslate) return

      let prompt = `Please translate the following text into language code "${lang}". Only output the translated text without any explanation or markdown wrappers if possible:\n\n${contentToTranslate}`
      if (mode === "bilingual" && (field === "content" || field === "readabilityContent" || field === "description")) {
        prompt = `You are an expert HTML translator. Translate the following HTML into language code "${lang}" in a bilingual format (双语对照).
CRITICAL RULES:
1. You MUST preserve the entire HTML structure and all HTML tags exactly as they are.
2. You MUST NOT delete or replace the original text. The original text MUST be kept intact.
3. For EVERY block of text (e.g. inside <p>, <h1>, <li>, <blockquote>), you must output the ORIGINAL text first, followed by a "<br/><br/>" tag, and then the TRANSLATED text.
4. Example Input:
   <h1>Introduction</h1>
   <p>This is a <b>test</b>.</p>
5. Example Output:
   <h1>Introduction<br/><br/>简介</h1>
   <p>This is a <b>test</b>.<br/><br/>这是一个<b>测试</b>。</p>
6. Do NOT output a fully translated article followed by the original article. The translation MUST be interleaved element by element.
7. Only output the raw HTML code. Do NOT wrap in \`\`\`html or any markdown wrappers.

Content to translate:
${contentToTranslate}`
      }

      try {
        const result = await callByokChatCompletion(prompt, translationModel)
        if (result) {
          // If the LLM returned markdown wrapped html, strip it
          let cleanResult = result.trim()
          if (cleanResult.startsWith("\`\`\`html") && cleanResult.endsWith("\`\`\`")) {
            cleanResult = cleanResult.replace(/^```html\n/, "").replace(/\n```$/, "")
          } else if (cleanResult.startsWith("\`\`\`") && cleanResult.endsWith("\`\`\`")) {
            cleanResult = cleanResult.replace(/^```\n/, "").replace(/\n```$/, "")
          }
          translation[field] = cleanResult
        }
      } catch (e) {
        // Error already handled and toasted by callByokChatCompletion, we just rethrow
        throw e
      }
    })

    await Promise.all(promises)
    
    if (Object.keys(translation).length > 0) {
      return translation
    }
    return null
  })
}
