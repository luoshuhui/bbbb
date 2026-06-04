import { useUserRole } from "@follow/store/user/hooks"
import { cn } from "@follow/utils"
import { Fragment, memo, useMemo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"

import { useAIModel } from "../../hooks/useAIModel"

interface AIModelIndicatorProps {
  className?: string
  onModelChange?: (model: string) => void
}

type ProviderType = "openai" | "google" | "auto" | "deepseek" | "anthropic" | "moonshotai"

const providerIcons: Record<ProviderType, string> = {
  auto: "i-mgc-folo-bot-original size-4 -ml-0.5",
  openai: "i-mgc-openai-original",
  google: "i-simple-icons-googlegemini",
  anthropic: "i-simple-icons-claude",
  deepseek: "i-mgc-deepseek-original",
  moonshotai: "i-mgc-moonshotai-original",
}



const parseModelString = (modelString: string) => {
  if (!modelString || !modelString.includes("/") || modelString === "auto") {
    return { provider: "auto" as ProviderType, modelName: modelString || "Unknown" }
  }

  const [provider, ...modelParts] = modelString.split("/")
  const modelName = modelParts.join("/")

  return {
    provider: (provider as ProviderType) || "auto",
    modelName: modelName || "Unknown",
  }
}

export const AIModelIndicator = memo(({ className, onModelChange }: AIModelIndicatorProps) => {
  const { data, changeModel } = useAIModel()
  const { defaultModel, availableModels = [], currentModel, availableModelsMenu = [] } = data || {}
  const role = useUserRole()
  const settingModalPresent = useSettingModal()

  const { provider, modelName } = useMemo(() => {
    return parseModelString(currentModel || defaultModel || "")
  }, [currentModel, defaultModel])

  const selectedMenuItem = useMemo(() => {
    return availableModelsMenu.find((item) => item.value === currentModel)
  }, [availableModelsMenu, currentModel])

  const iconClass = providerIcons[provider] || providerIcons.auto
  const hasMultipleModels = availableModels && availableModels.length > 1

  const modelContent = (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl border font-medium backdrop-blur-sm transition-colors",
        hasMultipleModels
          ? "cursor-button hover:bg-material-medium"
          : "hover:bg-material-medium/50",
        "duration-200",
        "gap-1.5 p-1 text-xs",
        hasMultipleModels && "px-2",
        "border-border/50 bg-material-ultra-thin",
        "text-text-secondary",

        className,
      )}
    >
      <i className={cn("size-3", iconClass)} />
      <span className="hidden max-w-20 truncate @md:inline">
        {selectedMenuItem?.label || modelName}
      </span>
      {hasMultipleModels && <i className="i-mingcute-down-line size-3 opacity-60" />}
    </div>
  )

  // 强制始终渲染 DropdownMenu，允许单模型时也能下拉选择配置

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{modelContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {(availableModelsMenu as any[]).map(({ label, value }, index) => {
          if (value) {
            const { provider: itemProvider, modelName: itemModelName } = parseModelString(value)
            const itemIconClass = providerIcons[itemProvider] || providerIcons.auto
            const isSelected = value === (currentModel || defaultModel)

            const handleModelSelect = () => {
              changeModel(value)
              onModelChange?.(value)
            }

            return (
              <DropdownMenuItem
                key={value}
                className="gap-2"
                onClick={handleModelSelect}
                checked={isSelected}
              >
                <i className={cn("size-3", itemIconClass)} />
                <span className="truncate">{label || itemModelName}</span>
              </DropdownMenuItem>
            )
          } else {
            return (
              <Fragment key={label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
              </Fragment>
            )
          }
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="gap-2 text-text-secondary" 
          onClick={() => settingModalPresent("ai")}
        >
          <i className="i-mgc-settings-3-line size-3" />
          <span className="truncate">配置模型</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

AIModelIndicator.displayName = "AIModelIndicator"
