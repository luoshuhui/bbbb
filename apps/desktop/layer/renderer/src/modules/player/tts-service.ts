import type { EntryModel } from "@follow/store/entry/types"
import { parseHtml } from "@follow/utils/html"

import { EdgeSpeechTTS } from "~/lib/tts/edge-tts"

export const DEFAULT_TTS_VOICE = "en-US-AvaMultilingualNeural"

export interface TtsVoice {
  FriendlyName: string
  Gender: string
  Locale: string
  ShortName: string
}

const normalizeTtsText = (value: string) =>
  value
    .replaceAll("\r\n", "\n")
    .replaceAll(/[^\S\n]+/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim()

const toPlainText = (value: string) => normalizeTtsText(parseHtml(value).toText())

export const getEntryTtsText = (
  entry: Pick<EntryModel, "content" | "description" | "readabilityContent" | "title">,
  options?: {
    preferReadability?: boolean
  },
) => {
  const { preferReadability = false } = options ?? {}

  const title = normalizeTtsText(entry.title || "")
  const bodySource = preferReadability
    ? entry.readabilityContent || entry.content || entry.description || ""
    : entry.content || entry.description || entry.readabilityContent || ""
  const body = bodySource ? toPlainText(bodySource) : ""

  return [title, body].filter(Boolean).join("\n\n")
}

export const fetchTtsVoices = async (signal?: AbortSignal, providedLocalDir?: string) => {
  const edgeVoices: TtsVoice[] = EdgeSpeechTTS.voices.map((v) => ({
    FriendlyName: `Edge - ${v.name} (${v.lang})`,
    ShortName: v.id,
    Gender: "Unknown",
    Locale: v.lang,
  }))

  return edgeVoices
}

export const requestTts = async ({
  id,
  signal,
  text,
  voice,
}: {
  id?: string
  text: string
  voice?: string
  signal?: AbortSignal
}) => {
  const normalizedText = normalizeTtsText(text)
  if (!normalizedText) {
    throw new Error("Text is required")
  }

  const normalizedVoice = voice?.trim() || DEFAULT_TTS_VOICE

  // It's Edge TTS
  try {
    const voiceInfo = EdgeSpeechTTS.voices.find((v) => v.id === normalizedVoice)
    const edgeTts = new EdgeSpeechTTS()
    const url = await edgeTts.createAudioUrl({
      text: normalizedText,
      voice: normalizedVoice,
      lang: voiceInfo?.lang || "en-US",
    })
    return url
  } catch (error: any) {
    throw new Error(error.message || "TTS request failed")
  }
}
