"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"

interface Solution {
  id: string
  title: string
  shortDescription: string
  fullDescription: string
  image: string
}

// Example solutions data
const solutions: Solution[] = [
    {
        id: "1",
        title: "Garantidora",
        shortDescription: "Serviço de garantia para imóveis",
        fullDescription:
            "Oferecemos serviços de garantia para imóveis, assegurando a tranquilidade e segurança dos proprietários e inquilinos. Nossa equipe especializada garante a resolução rápida e eficiente de qualquer problema.",
        image: "/services/garantidora.jpeg?height=200&width=400",
    },
    // {
    //     id: "2",
    //     title: "Sindico profissional",
    //     shortDescription: "Gestão profissional de condomínios",
    //     fullDescription:
    //         "Serviço de síndico profissional para administração de condomínios, garantindo uma gestão eficiente, transparente e organizada. Ideal para condomínios que buscam profissionalismo e excelência na administração.",
    //     image: "/services/sindico.jpeg?height=200&width=400",
    // },
    // {
    //     id: "3",
    //     title: "Administradora",
    //     shortDescription: "Administração completa de condomínios",
    //     fullDescription:
    //         "Nossa administradora oferece serviços completos de gestão de condomínios, incluindo administração financeira, manutenção, comunicação com moradores e muito mais. Tudo para garantir a tranquilidade e organização do seu condomínio.",
    //     image: "/services/administradora.jpeg?height=200&width=400",
    // },
    {
        id: "4",
        title: "Pintura",
        shortDescription: "Serviços de pintura residencial e comercial",
        fullDescription:
            "Oferecemos serviços de pintura para residências e comércios, com profissionais qualificados e materiais de alta qualidade. Garantimos um acabamento impecável e duradouro.",
        image: "/services/pintor.jpeg?height=200&width=400",
    },
    {
        id: "5",
        title: "Advogado",
        shortDescription: "Consultoria jurídica especializada",
        fullDescription:
            "Serviços de consultoria jurídica especializada para condomínios, incluindo assessoria em questões legais, elaboração de contratos, mediação de conflitos e muito mais.",
        image: "/services/advogado.jpeg?height=200&width=400",
    },
    {
        id: "6",
        title: "Seguros",
        shortDescription: "Seguros para condomínios e imóveis",
        fullDescription:
            "Oferecemos seguros completos para condomínios e imóveis, garantindo a proteção contra diversos riscos. Nossos planos são personalizados para atender às necessidades específicas de cada cliente.",
        image: "/services/seguradora.jpeg?height=200&width=400",
    },
    {
        id: "7",
        title: "Gesso e Drywall",
        shortDescription: "Serviços de gesso e drywall",
        fullDescription:
            "Profissionais especializados em serviços de gesso e drywall, oferecendo soluções para divisórias, forros, sancas e muito mais. Garantimos um acabamento de alta qualidade e durabilidade.",
        image: "/services/dry-wall.jpeg?height=200&width=400",
    },
    {
        id: "8",
        title: "Construção Civil",
        shortDescription: "Serviços de construção e reforma",
        fullDescription:
            "Oferecemos serviços completos de construção civil, incluindo reformas, ampliações e construções novas. Nossa equipe é composta por profissionais experientes e qualificados, garantindo a execução de projetos com excelência.",
        image: "/services/engenharia-civil.jpeg?height=200&width=400",
    },
]

function SolutionCard({ solution }: { solution: Solution }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card className="w-full h-fit cursor-pointer" onClick={() => setIsExpanded(!isExpanded)} >
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          {solution.title}
          <Button variant="ghost" size="icon"className="h-8 w-8">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="space-y-4 relative">
          <div className="w-full h-56 max-h-56 relative">
            <Image
              src={solution.image || "/placeholder.svg"}
              alt={solution.title}
              className="w-full rounded-lg object-cover h-fit"
              fill
              />
            </div>
          
          <p className="text-muted-foreground">{isExpanded ? solution.fullDescription : solution.shortDescription}</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={()=>console.log('Serviço solicitado...')}>Solicitar Serviço</Button>
      </CardFooter>
    </Card>
  )
}

export default function SolutionsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 md:text-start text-center">Nossas Soluções</h1>
      <Separator className="mb-10" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {solutions.map((solution) => (
          <SolutionCard key={solution.id} solution={solution} />
        ))}
      </div>
    </div>
  )
}

