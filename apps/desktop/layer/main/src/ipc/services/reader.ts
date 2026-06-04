import { callWindowExpose } from "@follow/shared/bridge"
import { readability } from "@follow-app/readability"
import type { BrowserWindow } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"
import type { ModelResult } from "vscode-languagedetection"

import { detectCodeStringLanguage } from "../../modules/language-detection"

interface ReadabilityInput {
  url: string
  html?: string
}

interface DetectCodeStringLanguageInput {
  codeString: string
}

const showReaderToastError = (
  window: BrowserWindow | null,
  error: unknown,
  fallbackMessage: string,
) => {
  if (!window) return

  let message = fallbackMessage
  if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as any).message)
  } else if (typeof error === "string") {
    message = error
  }

  void callWindowExpose(window).toast.error(message, {
    duration: 3000,
  })
}

export class ReaderService extends IpcService {
  static override readonly groupName = "reader"

  @IpcMethod()
  async readability(_context: IpcContext, input: ReadabilityInput) {
    const { url } = input

    if (!url) {
      return null
    }
    const result = await readability(url)

    return result
  }

  @IpcMethod()
  async detectCodeStringLanguage(
    _context: IpcContext,
    input: DetectCodeStringLanguageInput,
  ): Promise<ModelResult | undefined> {
    const { codeString } = input
    const languages = detectCodeStringLanguage(codeString)

    let finalLanguage: ModelResult | undefined
    for await (const language of languages) {
      if (!finalLanguage) {
        finalLanguage = language
        continue
      }
      if (language.confidence > finalLanguage.confidence) {
        finalLanguage = language
      }
    }

    return finalLanguage
  }
}
