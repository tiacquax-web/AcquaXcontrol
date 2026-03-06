import Image from "next/image"

export default function BlogPost() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 md:px-6 lg:py-16 md:py-12">
        {/* Aumentamos a largura máxima aqui */}
        <article className="prose prose-gray mx-auto max-w-[85ch] lg:prose-xl dark:prose-invert">
          <div className="space-y-2 not-prose">
            <h1 className="text-3xl font-extrabold tracking-tight lg:text-5xl lg:leading-[3.5rem]">
              Veja o que está acontecendo em Vila Velha-ES, neste momento
            </h1>
            <p className="text-muted-foreground">Publicado em 25 de Fevereiro de 2024</p>
          </div>

          {/* Ajustamos o container da imagem e suas proporções */}
          <div className="my-8 max-w-[1000px] mx-auto">
            <div className="relative aspect-[5/2] w-full">
              <Image
                src="/news/vila-velha-4k.jpeg?height=400&width=1000"
                alt="Vista aérea da Praia da Costa em Vila Velha"
                fill
                className="rounded-lg object-cover object-center"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 85vw, 1000px"
                priority
              />
            </div>
            <figcaption className="text-center text-sm text-muted-foreground mt-2 p-8">
              Vista panorâmica de Vila Velha, com o Convento da Penha ao fundo
            </figcaption>
          </div>

          {/* Resto do conteúdo permanece o mesmo */}
          <p>
            Vila Velha, cidade histórica do Espírito Santo, continua seu desenvolvimento urbano mantendo suas tradições
            e belezas naturais. Neste momento, diversos eventos e mudanças estão ocorrendo em diferentes regiões do
            município.
          </p>

          <h2>Revitalização da Orla</h2>
          <p>
            A Praia da Costa está recebendo melhorias significativas em sua infraestrutura. O calçadão está sendo
            renovado com novo paisagismo e iluminação LED, tornando o espaço mais agradável para moradores e turistas
            que frequentam a região.
          </p>

          <h2>Mobilidade Urbana</h2>
          <p>
            O sistema de transporte público está passando por atualizações importantes. Novas linhas de ônibus foram
            implementadas para melhorar a conexão entre os bairros, especialmente nas regiões de Terra Vermelha e Grande
            Cobilândia.
          </p>

          <blockquote>
            &ldquo;Nossa cidade está em constante evolução, mas mantemos nossa essência e tradições vivas&rdquo;
          </blockquote>

          <h2>Eventos Culturais</h2>
          <p>
            O Convento da Penha, principal cartão postal da cidade, continua recebendo milhares de visitantes
            diariamente. A programação cultural inclui exposições de artistas locais e apresentações musicais nos fins
            de semana.
          </p>

          <h3>Destaques da Semana</h3>
          <ul>
            <li>Festival Gastronômico na Praia da Costa</li>
            <li>Exposição de artesanato no Centro da cidade</li>
            <li>Projeto de preservação ambiental em Itaparica</li>
            <li>Obras de infraestrutura em Coqueiral de Itaparica</li>
          </ul>

          <p>
            A cidade continua crescendo e se desenvolvendo, mantendo o equilíbrio entre modernidade e preservação
            histórica. Os moradores podem acompanhar as atualizações sobre obras e eventos através dos canais oficiais
            da prefeitura.
          </p>

          <h2>Próximos Eventos</h2>
          <p>
            Para as próximas semanas, estão programadas diversas atividades culturais e esportivas nas praias e praças
            da cidade. A agenda completa pode ser consultada no portal oficial do município.
          </p>
        </article>
      </div>
    </div>
  )
}

