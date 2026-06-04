import { useAtomValue } from "jotai"
import { useEffect, useMemo } from "react"

import { __aiSettingAtom } from "~/atoms/settings/ai"

import { setAIModelState, useAIModelState } from "../atoms/session"
import { useAIConfiguration } from "./useAIConfiguration"

export const useAIModel = () => {
  const { data: configuration, isLoading } = useAIConfiguration()
  const modelState = useAIModelState()
  const aiSettings = useAtomValue(__aiSettingAtom)

  const enhancedConfiguration = useMemo(() => {
    if (!configuration) return null

    const byokProviders = aiSettings?.byok?.providers || []
    const availableModels: string[] = []
    const availableModelsMenu: any[] = []

    if (byokProviders.length === 0) {
      availableModels.push("openai/byok")
      availableModelsMenu.push({ label: "Custom Provider (BYOK)", value: "openai/byok" })
    } else {
      byokProviders.forEach((p, idx) => {
        const modelsToUse = (p.models && p.models.length > 0) ? p.models : (p.model ? [p.model] : [p.provider || `BYOK Model ${idx + 1}`])
        modelsToUse.forEach(modelName => {
          const value = `openai/${p.provider}::${modelName}`
          if (!availableModels.includes(value)) {
            availableModels.push(value)
            availableModelsMenu.push({
              label: `${p.provider || 'BYOK'} - ${modelName}`,
              value
            })
          }
        })
      })
    }

    return {
      defaultModel: byokProviders.length > 0 ? availableModels[0] : (configuration.defaultModel || "openai/byok"),
      availableModels: byokProviders.length > 0 ? availableModels : [...(configuration.availableModels || []), ...availableModels],
      availableModelsMenu: byokProviders.length > 0 ? availableModelsMenu : [...(configuration.availableModelsMenu || []), ...availableModelsMenu],
    }
  }, [configuration, aiSettings])

  // Validate and sync persistent model with available models
  useEffect(() => {
    if (!enhancedConfiguration || isLoading) return

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = enhancedConfiguration

    // If no model is selected or selected model is not available, use default
    if (!selectedModel || !availableModels.includes(selectedModel)) {
      setAIModelState({
        selectedModel: defaultModel || null,
      })
    }
  }, [enhancedConfiguration, isLoading, modelState])

  const changeModel = (model: string) => {
    if (!enhancedConfiguration?.availableModels?.includes(model)) {
      console.warn(`Model ${model} is not available in current configuration`)
      return
    }

    setAIModelState({
      selectedModel: model,
    })
  }

  // Get current effective model
  const currentModel = useMemo(() => {
    if (modelState.selectedModel) {
      return modelState.selectedModel
    }
    const byokProviders = aiSettings?.byok?.providers || []
    if (byokProviders.length > 0) {
      const p = byokProviders[0]
      const modelName = (p?.models && p.models.length > 0) ? p.models[0] : (p?.model || p?.provider || "BYOK Model")
      return `openai/${p?.provider}::${modelName}`
    }
    return "openai/byok"
  }, [aiSettings, modelState.selectedModel])

  return {
    data: enhancedConfiguration ? {
      defaultModel: enhancedConfiguration.defaultModel,
      availableModels: enhancedConfiguration.availableModels,
      availableModelsMenu: enhancedConfiguration.availableModelsMenu,
      currentModel,
    } : undefined,
    isLoading,
    changeModel,
  }
}
