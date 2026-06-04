import { cn } from "@follow/utils"

import aiBotImg from "../../../../../public/ai-bot.png"

export const AISplineLoader = ({ className }: { className?: string }) => {
  return (
    <div className={cn("size-16", className)}>
      <img src={aiBotImg} alt="AI Bot" className="size-full object-contain" />
    </div>
  )
}
