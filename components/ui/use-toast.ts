// Se o arquivo não existir, vamos criar um componente de toast básico
import { useToast as useToastOriginal } from "@/hooks/use-toast"

export const toast = {
  title: (title: string) => {
    const { toast } = useToastOriginal()
    toast({
      title,
    })
  },
  description: (description: string) => {
    const { toast } = useToastOriginal()
    toast({
      description,
    })
  },
  variant: (variant: "default" | "destructive") => {
    return {
      title: (title: string) => {
        const { toast } = useToastOriginal()
        toast({
          variant,
          title,
        })
      },
      description: (description: string) => {
        const { toast } = useToastOriginal()
        toast({
          variant,
          description,
        })
      },
    }
  },
}

export { useToastOriginal as useToast }
