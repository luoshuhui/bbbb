import { Button } from "@follow/components/ui/button/index.js"
import { Checkbox } from "@follow/components/ui/checkbox/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { ScrollArea } from "@follow/components/ui/scroll-area/index.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@follow/components/ui/select/index.js"
import type { ByokProviderName, UserByokProviderConfig } from "@follow/shared/settings/interface"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PROVIDER_OPTIONS } from "./constants"

interface ByokProviderModalContentProps {
  provider: UserByokProviderConfig | null
  configuredProviders?: ByokProviderName[]
  onSave: (provider: UserByokProviderConfig) => void
  onCancel: () => void
}

const EMPTY_CONFIGURED_PROVIDERS: ByokProviderName[] = []

export const ByokProviderModalContent = ({
  provider,
  configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
  onSave,
  onCancel,
}: ByokProviderModalContentProps) => {
  const { t } = useTranslation("ai")

  // Filter out already configured providers, but keep the current one if editing
  const availableProviders = PROVIDER_OPTIONS.filter(
    (option) => !configuredProviders.includes(option.value) || option.value === provider?.provider,
  )

  // Get the first available provider or fallback to the current one
  const defaultProvider = availableProviders[0]?.value ?? provider?.provider ?? "openai"

  const [formData, setFormData] = useState<UserByokProviderConfig>({
    provider: provider?.provider ?? defaultProvider,
    model: provider?.model ?? null,
    models: provider?.models ?? (provider?.model ? [provider.model] : []),
    baseURL: provider?.baseURL ?? null,
    apiKey: provider?.apiKey ?? null,
    headers: provider?.headers ?? {},
  })

  const [manualModelInput, setManualModelInput] = useState("")

  const toggleModel = (model: string) => {
    const currentModels = formData.models || []
    if (currentModels.includes(model)) {
      setFormData({ ...formData, models: currentModels.filter((m) => m !== model) })
    } else {
      setFormData({ ...formData, models: [...currentModels, model] })
    }
  }

  const addManualModel = () => {
    const val = manualModelInput.trim()
    if (val) {
      const currentModels = formData.models || []
      if (!currentModels.includes(val)) {
        setFormData({ ...formData, models: [...currentModels, val] })
      }
      setManualModelInput("")
    }
  }

  const removeModel = (model: string) => {
    const currentModels = formData.models || []
    setFormData({ ...formData, models: currentModels.filter((m) => m !== model) })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.provider) {
      return
    }
    onSave(formData)
  }

  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)

  const fetchModels = async () => {
    setIsFetchingModels(true)
    try {
      const baseUrl = formData.baseURL?.trim()
      let modelsUrl = ""
      if (!baseUrl) {
        modelsUrl = "https://api.openai.com/v1/models"
      } else {
        if (baseUrl.endsWith("/chat/completions")) {
          modelsUrl = baseUrl.replace("/chat/completions", "/models")
        } else {
          modelsUrl = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`
        }
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (formData.apiKey) {
        headers.Authorization = `Bearer ${formData.apiKey}`
      }
      const res = await fetch(modelsUrl, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.data && Array.isArray(data.data)) {
          const models = data.data.map((m: any) => m.id).filter(Boolean)
          if (models.length > 0) {
            setFetchedModels(models)
            toast.success("拉取模型列表成功")
          } else {
            toast.error("拉取的模型列表为空")
          }
        } else if (Array.isArray(data.models)) {
          const models = data.models.map((m: any) => m.name || m.id).filter(Boolean)
          if (models.length > 0) {
            setFetchedModels(models)
            toast.success("拉取模型列表成功")
          } else {
            toast.error("拉取的模型列表为空")
          }
        } else {
          toast.error("返回的数据格式不匹配")
        }
      } else {
        toast.error(`拉取失败: ${res.status}`)
      }
    } catch (e) {
      toast.error(`请求异常: ${String(e)}`)
    } finally {
      setIsFetchingModels(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-[40ch] space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">{t("byok.providers.form.provider")}</Label>
        <Select
          value={formData.provider}
          disabled={availableProviders.length === 0}
          onValueChange={(value) =>
            setFormData({ ...formData, provider: value as ByokProviderName })
          }
        >
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="baseURL">{t("byok.providers.form.base_url")}</Label>
        <Input
          id="baseURL"
          type="url"
          placeholder={formData.provider === "ollama" ? "http://localhost:11434/v1" : t("byok.providers.form.base_url_placeholder")}
          value={formData.baseURL ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              baseURL: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.base_url_help")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="model">{t("byok.providers.form.model", { defaultValue: "模型(Model)" })}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={fetchModels} disabled={isFetchingModels}>
            {isFetchingModels ? "拉取中..." : "拉取可用模型"}
          </Button>
        </div>
        {fetchedModels.length > 0 ? (
          <div className="space-y-2">
            <ScrollArea.ScrollArea rootClassName="h-32 w-full rounded-md border border-border mt-2 p-2">
              <div className="flex flex-col gap-2">
                {fetchedModels.map((m) => {
                  const isChecked = formData.models?.includes(m) || false
                  return (
                    <div key={m} className="flex items-center space-x-2">
                      <Checkbox
                        id={`model-${m}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleModel(m)}
                      />
                      <label
                        htmlFor={`model-${m}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {m}
                      </label>
                    </div>
                  )
                })}
              </div>
            </ScrollArea.ScrollArea>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="手动添加模型名称"
                value={manualModelInput}
                onChange={(e) => setManualModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addManualModel()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addManualModel}>
                添加
              </Button>
            </div>
            <Button type="button" variant="ghost" onClick={() => setFetchedModels([])}>
              收起模型列表
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              id="model"
              type="text"
              placeholder={t("byok.providers.form.model_placeholder", { defaultValue: "例如: gpt-4o-mini" })}
              value={manualModelInput}
              onChange={(e) => setManualModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addManualModel()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addManualModel}>
              添加
            </Button>
          </div>
        )}
        
        {/* Render selected models */}
        {(formData.models && formData.models.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.models.map(m => (
              <span key={m} className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer" onClick={() => removeModel(m)}>
                {m}
                <span className="text-xs ml-1 opacity-50 hover:opacity-100">✕</span>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-text-secondary">{t("byok.providers.form.model_help", { defaultValue: "留空则使用默认模型" })}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("byok.providers.form.api_key")}</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("byok.providers.form.api_key_placeholder")}
          value={formData.apiKey ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.api_key_help")}</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("words.cancel", { ns: "common" })}
        </Button>
        <Button type="submit">{t("words.save", { ns: "common" })}</Button>
      </div>
    </form>
  )
}
