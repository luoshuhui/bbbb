import type { TtsVoice } from "~/modules/player/tts-service"

export const WebSpeechClient = {
  getVoices(): Promise<TtsVoice[]> {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        resolve(
          voices.map((v) => ({
            FriendlyName: `System - ${v.name}`,
            ShortName: `system:${v.voiceURI}`,
            Gender: "Unknown",
            Locale: v.lang,
          })),
        )
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          const vcs = window.speechSynthesis.getVoices()
          resolve(
            vcs.map((v) => ({
              FriendlyName: `System - ${v.name}`,
              ShortName: `system:${v.voiceURI}`,
              Gender: "Unknown",
              Locale: v.lang,
            })),
          )
        }
      }
    })
  },

  speak(text: string, voiceURI: string, onEnd: () => void, onError: (e: any) => void) {
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find((v) => v.voiceURI === voiceURI)
    if (voice) {
      utterance.voice = voice
    }
    utterance.onend = onEnd
    utterance.onerror = onError
    window.speechSynthesis.speak(utterance)
    return utterance
  },

  stop() {
    window.speechSynthesis.cancel()
  },

  pause() {
    window.speechSynthesis.pause()
  },

  resume() {
    window.speechSynthesis.resume()
  },
};
