"use client"

import type * as React from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { cn } from "@/lib/utils"

interface CarouselItem {
  title?: string
  content: React.ReactNode
  footer?: React.ReactNode
}

interface CarouselProps {
  slidesToShow?: 1 | 2 | 3 | 4 | 5 | 6
  items: CarouselItem[]
  overlayArrows?: boolean
  showGradient?: boolean
  arrowsPosition?: "top" | "middle" | "bottom"
  horizontalOffset?: number
  alignItems?: "start" | "center" | "end" | "baseline" | "flex-start" | "flex-end"
  justifyContent?: "start" | "center" | "end"
  maxCardWidth?: number
  gradientDarkTheme?: "background" | "black" | string
  gradientLightTheme?: "background" | "white" | string
  extraCardContentClasses?: string
  aspectRatio?: string
  footerPosition?: "below" | "over-translucid" | "over-background-color"
}

const demoItems: CarouselItem[] = [
  { title: "Item 1", content: <p>This is the content for item 1</p> },
  { title: "Item 2", content: <p>Here&apos;s some content for item 2</p> },
  { title: "Item 3", content: <p>Content for the third item</p> },
  { title: "Item 4", content: <p>Fourth item&apos;s content goes here</p> },
  { title: "Item 5", content: <p>And here&apos;s the content for item 5</p> },
]

export default function EnhancedCarousel({
  slidesToShow,
  items = demoItems,
  overlayArrows = false,
  showGradient = false,
  arrowsPosition = "middle",
  horizontalOffset = 0,
  alignItems = "start",
  justifyContent = "center",
  maxCardWidth,
  gradientDarkTheme = "background",
  gradientLightTheme = "white",
  extraCardContentClasses = "",
  aspectRatio = "aspect-[3/1]",
  footerPosition = "below",
}: CarouselProps) {
  const getArrowPositionClass = (position: "top" | "middle" | "bottom") => {
    switch (position) {
      case "top":
        return "top-0 -translate-y-1/2"
      case "bottom":
        return "bottom-0 translate-y-1/2"
      default:
        return "top-1/2 -translate-y-1/2"
    }
  }

  const getFooterClasses = (position: typeof footerPosition) => {
    const baseClasses = "w-full"
    
    switch (position) {
      case "over-translucid":
        return cn(
          baseClasses,
          "absolute bottom-0 left-0 right-0",
          "bg-black/50 dark:bg-black/70",
          "text-white",
          "px-2 md:p-4",
          "pointer-events-none" // Permite que cliques atravessem o footer
        )
      case "over-background-color":
        return cn(
          baseClasses,
          "absolute bottom-0 left-0 right-0",
          "bg-background/90 dark:bg-background/90",
          "px-2 md:p-4",
          "pointer-events-none" // Permite que cliques atravessem o footer
        )
      default: // "below"
        return cn(baseClasses, "pb-2")
    }
  }

  const basis = slidesToShow ? (slidesToShow > 1 ? `basis-1/${slidesToShow}` : "w-full") : "basis-1/1"

  return (
    <div className="relative w-full overflow-hidden">
      <Carousel
        opts={{
          align: "start",
          slidesToScroll: "auto",
        }}
        className="w-full"
      >
        <CarouselContent className={cn("flex w-full -ml-2 md:-ml-4")}>
          {items.map((item, index) => (
            <CarouselItem key={index} className={`flex flex-col ${basis}`}>
              <div className="flex-grow p-1 w-full" style={maxCardWidth ? { maxWidth: `${maxCardWidth}rem` } : {}}>
                <Card className="h-full flex flex-col w-full overflow-hidden">
                  {item.title && (
                    <CardHeader>
                      <CardTitle>{item.title}</CardTitle>
                    </CardHeader>
                  )}
                  <CardContent
                    className={cn(
                      "flex-grow flex relative",
                      aspectRatio,
                      `justify-${justifyContent}`,
                      extraCardContentClasses,
                      footerPosition !== "below" && "overflow-hidden" // Adiciona overflow hidden quando o footer está sobreposto
                    )}
                    style={{ alignItems }}
                  >
                    {item.content}
                    {/* Renderiza o footer dentro do CardContent quando está sobreposto */}
                    {item.footer && footerPosition !== "below" && (
                      <div className={getFooterClasses(footerPosition)}>
                        {item.footer}
                      </div>
                    )}
                  </CardContent>
                  {/* Renderiza o footer normalmente quando está abaixo */}
                  {item.footer && footerPosition === "below" && (
                    <CardFooter className={getFooterClasses("below")}>
                      {item.footer}
                    </CardFooter>
                  )}
                </Card>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          className={cn(
            "absolute z-10",
            overlayArrows ? `left-${horizontalOffset}` : `left-2`,
            getArrowPositionClass(arrowsPosition)
          )}
        />
        <CarouselNext
          className={cn(
            "absolute z-10",
            overlayArrows ? `right-${horizontalOffset}` : `right-2`,
            getArrowPositionClass(arrowsPosition)
          )}
        />
      </Carousel>
      {showGradient && (
        <>
          <div
            className={cn(
              `pointer-events-none absolute inset-y-0 left-${horizontalOffset} w-1/6 bg-gradient-to-r z-[1]`,
              {
                "from-background": gradientDarkTheme === "background",
                "from-white": gradientLightTheme === "white",
              }
            )}
          />
          <div
            className={cn(
              `pointer-events-none absolute inset-y-0 right-${horizontalOffset} w-1/6 bg-gradient-to-l z-[1]`,
              {
                "from-background": gradientDarkTheme === "background",
                "from-white": gradientLightTheme === "white",
              }
            )}
          />
        </>
      )}
    </div>
  )
}
