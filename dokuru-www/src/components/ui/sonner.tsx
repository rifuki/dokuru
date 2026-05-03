import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      swipeDirections={["right", "left"]}
      toastOptions={{
        classNames: {
          actionButton: "!h-8 !rounded-md !border !border-white/15 !bg-white/[0.08] !px-3 !text-xs !font-semibold !text-white !shadow-none transition-colors hover:!bg-white/[0.14]",
          cancelButton: "!h-8 !rounded-md !border !border-white/10 !bg-white/[0.04] !px-3 !text-xs !font-semibold !text-white/80 !shadow-none transition-colors hover:!bg-white/[0.10]",
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
