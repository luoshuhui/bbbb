import { defaultGeneralSettings } from "@follow/shared/settings/defaults"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { playEntryTts } from "./entry-tts"
import { requestTts } from "./tts-service"

const {
  getEntryMock,
  getGeneralSettingsMock,
  getReadabilityStatusMock,
  mountMock,
  toastFetchErrorMock,
} = vi.hoisted(() => ({
  getEntryMock: vi.fn(),
  getGeneralSettingsMock: vi.fn(),
  getReadabilityStatusMock: vi.fn(),
  mountMock: vi.fn(),
  toastFetchErrorMock: vi.fn(),
}))

vi.mock("./tts-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tts-service")>()
  return {
    ...actual,
    requestTts: vi.fn(),
  }
})

vi.mock("@follow/store/entry/getter", () => ({
  getEntry: getEntryMock,
}))

vi.mock("~/atoms/readability", () => ({
  ReadabilityStatus: {
    INITIAL: 1,
    WAITING: 2,
    SUCCESS: 3,
    FAILURE: 4,
  },
  getReadabilityStatus: getReadabilityStatusMock,
}))

vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: getGeneralSettingsMock,
}))

vi.mock("~/atoms/player", () => ({
  AudioPlayer: {
    mount: mountMock,
  },
  getAudioPlayerAtomValue: vi.fn(() => ({})),
  setAudioPlayerAtomValue: vi.fn(),
}))

vi.mock("~/lib/error-parser", () => ({
  toastFetchError: toastFetchErrorMock,
}))

describe("entry tts", () => {
  beforeEach(() => {
    getEntryMock.mockReturnValue({
      id: "entry-1",
      title: "",
      content: "Hello world",
      readabilityContent: "",
      description: "",
    })
    getGeneralSettingsMock.mockReturnValue({
      voice: "en-US-AvaMultilingualNeural",
    })
    getReadabilityStatusMock.mockReturnValue({})
    vi.mocked(requestTts).mockResolvedValue("blob:tts-audio")
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("requests entry tts from the new service", async () => {
    await playEntryTts("entry-1", { toastTitle: "Play TTS" })

    expect(requestTts).toHaveBeenCalledTimes(1)
    expect(requestTts).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "entry-1",
        text: "Hello world",
        voice: "en-US-AvaMultilingualNeural",
        signal: expect.any(AbortSignal),
      }),
    )

    expect(mountMock).toHaveBeenCalledWith({
      currentTime: 0,
      entryId: "entry-1",
      src: "blob:tts-audio",
      type: "audio",
    })
  })

  it("uses the new default voice", () => {
    expect(defaultGeneralSettings.voice).toBe("en-US-AvaMultilingualNeural")
  })
})
