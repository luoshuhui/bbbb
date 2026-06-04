
const EDGE_SPEECH_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
const EDGE_API_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
const CHROMIUM_FULL_VERSION = "143.0.3650.75"

const WIN_EPOCH_OFFSET = 11644473600 // Windows epoch offset in seconds (1601 to 1970)
const S_TO_NS = 1000000000 // Seconds to nanoseconds conversion

const generateSecMsGec = async () => {
  let ticks = Math.floor(Date.now() / 1000)
  ticks += WIN_EPOCH_OFFSET
  ticks -= ticks % 300
  ticks *= S_TO_NS / 100
  const strToHash = `${ticks.toFixed(0)}${EDGE_API_TOKEN}`
  const encoder = new TextEncoder()
  const data = encoder.encode(strToHash)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

const generateMuid = () => {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

export interface EdgeTTSPayload {
  lang: string
  text: string
  voice: string
  rate?: number
  pitch?: number
}

const escapeXml = (unsafe: string) => {
  return unsafe
    .replaceAll('&', "&amp;")
    .replaceAll('<', "&lt;")
    .replaceAll('>', "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll('\'', "&apos;")
}

const genSSML = (lang: string, text: string, voice: string, rate = 1) => {
  const rateStr = rate >= 1 ? `+${((rate - 1) * 100).toFixed(0)}%` : `-${((1 - rate) * 100).toFixed(0)}%`
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>
    <voice name='${voice}'>
      <prosody rate='${rateStr}'>
        ${escapeXml(text)}
      </prosody>
    </voice>
  </speak>`
}

const EDGE_TTS_VOICES = {
  "en-US": [
    "en-US-AnaNeural",
    "en-US-AndrewMultilingualNeural",
    "en-US-AndrewNeural",
    "en-US-AriaNeural",
    "en-US-AvaMultilingualNeural",
    "en-US-AvaNeural",
    "en-US-BrianMultilingualNeural",
    "en-US-BrianNeural",
    "en-US-ChristopherNeural",
    "en-US-EmmaMultilingualNeural",
    "en-US-EmmaNeural",
    "en-US-EricNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-US-MichelleNeural",
    "en-US-RogerNeural",
    "en-US-SteffanNeural",
  ],
  "zh-CN": [
    "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoyiNeural",
    "zh-CN-YunjianNeural",
    "zh-CN-YunxiNeural",
    "zh-CN-YunxiaNeural",
    "zh-CN-YunyangNeural",
    "zh-CN-liaoning-XiaobeiNeural",
    "zh-CN-shaanxi-XiaoniNeural",
  ],
}

const genVoiceList = (voices: Record<string, string[]>) => {
  return Object.entries(voices).flatMap(([lang, voices]) => {
    return voices.map((id) => {
      const name = id.replace(`${lang}-`, "").replace("Neural", "")
      return { name, id, lang }
    })
  })
}

export class EdgeSpeechTTS {
  static voices = genVoiceList(EDGE_TTS_VOICES)
  private static audioUrlCache = new Map<string, string>()

  async fetchEdgeSpeechWs({ lang, text, voice, rate = 1 }: EdgeTTSPayload): Promise<Blob> {
    const connectId = crypto.randomUUID().replaceAll('-', "")
    const params = new URLSearchParams({
      ConnectionId: connectId,
      TrustedClientToken: EDGE_API_TOKEN,
      "Sec-MS-GEC": await generateSecMsGec(),
      "Sec-MS-GEC-Version": `1-${CHROMIUM_FULL_VERSION}`,
    })
    const url = `${EDGE_SPEECH_URL}?${params.toString()}`
    const date = new Date().toString()
    
    // For standard browser WebSocket, we cannot set custom headers.
    // Edge TTS WebSocket API actually works without Origin check in Chromium extensions/Electron if webSecurity is relaxed,
    // or it ignores it. If it fails, we will need to proxy or use main process.
    
    const configHeaders = {
      "Content-Type": "application/json; charset=utf-8",
      Path: "speech.config",
      "X-Timestamp": date,
    }
    const contentHeaders = {
      "Content-Type": "application/ssml+xml",
      Path: "ssml",
      "X-RequestId": connectId,
      "X-Timestamp": date,
    }
    const configContent = JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    })

    const genSendContent = (headerObj: Record<string, string>, content: string) => {
      let header = ""
      for (const key of Object.keys(headerObj)) {
        header += `${key}: ${headerObj[key]}\r\n`
      }
      return `${header}\r\n${content}`
    }

    const getHeadersAndData = (message: string) => {
      const lines = message.split("\n")
      const headers: Record<string, string> = {}
      let body = ""
      let lineIdx = 0

      for (lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!.trim()
        if (!line) break
        const separatorIndex = line.indexOf(":")
        if (separatorIndex === -1) continue
        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()
        headers[key] = value
      }

      for (lineIdx = lineIdx + 1; lineIdx < lines.length; lineIdx++) {
        body += `${lines[lineIdx]  }\n`
      }

      return { headers, body }
    }

    const ssml = genSSML(lang, text, voice, rate)
    const content = genSendContent(contentHeaders, ssml)
    const config = genSendContent(configHeaders, configContent)

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.binaryType = "arraybuffer"

      let audioData = new ArrayBuffer(0)
      let resolved = false

      ws.addEventListener("open", () => {
        ws.send(config)
        ws.send(content)
      })

      ws.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data === "string") {
          const { headers } = getHeadersAndData(event.data)
          if (headers["Path"] === "turn.end") {
            ws.close()
            if (!audioData.byteLength) {
              return reject(new Error("No audio data received."))
            }
            resolved = true
            resolve(new Blob([audioData], { type: "audio/mpeg" }))
          }
        } else if (event.data instanceof ArrayBuffer) {
          const dataView = new DataView(event.data)
          const headerLength = dataView.getInt16(0)
          if (event.data.byteLength > headerLength + 2) {
            const newBody = event.data.slice(2 + headerLength)
            const merged = new Uint8Array(audioData.byteLength + newBody.byteLength)
            merged.set(new Uint8Array(audioData), 0)
            merged.set(new Uint8Array(newBody), audioData.byteLength)
            audioData = merged.buffer
          }
        }
      })

      ws.addEventListener("close", () => {
        if (!resolved && !audioData.byteLength) {
          reject(new Error("No audio data received. Connection closed."))
        }
      })

      ws.addEventListener("error", () => {
        if (!resolved) {
          reject(new Error("WebSocket error occurred."))
        }
      })
    })
  }

  async createAudioUrl(payload: EdgeTTSPayload): Promise<string> {
    const cacheKey = JSON.stringify(payload)
    if (EdgeSpeechTTS.audioUrlCache.has(cacheKey)) {
      return EdgeSpeechTTS.audioUrlCache.get(cacheKey)!
    }
    const blob = await this.fetchEdgeSpeechWs(payload)
    const objectUrl = URL.createObjectURL(blob)
    EdgeSpeechTTS.audioUrlCache.set(cacheKey, objectUrl)
    return objectUrl
  }
}
