// app/politica-de-privacidade/page.tsx

export default function PrivacyPolicyPage() {
  const lastUpdated = "12 de novembro de 2025";
  return (
    <main className="prose prose-xs sm:prose-sm lg:prose-base xl:prose-lg 2xl:prose-xl mx-auto my-12 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-sm text-gray-500">Última atualização: {lastUpdated}</p>

      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 my-4" role="alert">
        <p className="font-bold">Transparência</p>
        <p>
          Esta política descreve como a AcquaX Field coleta, usa, compartilha e protege seus dados pessoais no site e aplicativo. O texto reflete o funcionamento atual do sistema conforme implementado no código.
        </p>
      </div>

      <h2 className="text-2xl font-semibold mt-6">1. Controlador e Contato</h2>
      <p>
        Controlador: AcquaX Field. Encarregado (DPO): responsável designado. Contato: suporte@acquaxdobrasil.com.br.
      </p>

      <h2 className="text-2xl font-semibold mt-6">2. Dados Pessoais Tratados</h2>
      <ul>
        <li>
          Identificação e contato: nome, e-mail, telefone, celular, documento pessoal (quando informado), foto (opcional) e preferências de usuário.
        </li>
        <li>
          Autenticação e segurança: senha (armazenada com hash bcrypt), token de sessão (cookie httpOnly), token temporário de recuperação de senha e carimbos de data.
        </li>
        <li>
          Operacionais: dados de consumo/leituras e informações de dispositivos/medidores vinculados a apartamento/bloco/condomínio/empresa.
        </li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">3. Finalidades e Bases Legais</h2>
      <ul>
        <li>Executar o serviço contratado (acesso à conta, relatórios e medições).</li>
        <li>Manter a segurança (gestão de sessão, antifraude e controle de acesso).</li>
        <li>Atendimento e suporte (inclusive recuperação de senha por e-mail).</li>
        <li>Melhoria do serviço e manutenção operacional.</li>
      </ul>
      <p>Base legal predominante: execução de contrato e legítimo interesse, quando aplicável.</p>

      <h2 className="text-2xl font-semibold mt-6">4. Cookies</h2>
      <ul>
        <li>
          Essenciais: <code>session</code> (httpOnly, SameSite=Lax, expira em 1 hora) para autenticação.
        </li>
        <li>
          Funcionais: <code>sidebar:state</code> (preferência de interface). Não utilizamos cookies de rastreamento ou analytics de terceiros.
        </li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">5. Compartilhamento com Operadores</h2>
      <ul>
        <li>Infraestrutura de banco (MongoDB/DigitalOcean) para armazenamento de dados.</li>
        <li>Envio de e-mail (Gmail/Nodemailer) exclusivamente para mensagens operacionais (ex.: recuperação de senha).</li>
      </ul>
      <p>Pode haver transferência internacional de dados em razão da infraestrutura. Adotamos medidas contratuais e técnicas adequadas.</p>

      <h2 className="text-2xl font-semibold mt-6">6. Retenção e Descarte</h2>
      <ul>
        <li>
          Sessões expiram automaticamente em 1 hora. Dados de conta e consumo são mantidos enquanto necessários à prestação do serviço e cumprimento de obrigações.
        </li>
        <li>
          Registros marcados para exclusão ficam indisponíveis (exclusão lógica) até eliminação ou anonimização definitiva conforme solicitação do titular ou encerramento contratual.
        </li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">7. Segurança</h2>
      <ul>
        <li>Senhas armazenadas com hash (bcrypt) e gestão de sessão por cookie httpOnly.</li>
        <li>Controles de acesso por contexto/permissões e registros de auditoria de criação/alteração.</li>
        <li>Monitoramento e correções contínuas de segurança.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">8. Direitos do Titular</h2>
      <p>
        Você pode exercer seus direitos de acesso, correção, portabilidade, oposição e exclusão. Parte das atualizações (nome, e-mail, senha, preferências) pode ser realizada diretamente na sua conta. Para portabilidade e exclusão/anonimização, contate o Encarregado.
      </p>

      <h2 className="text-2xl font-semibold mt-6">9. Alterações a Esta Política</h2>
      <p>
        Podemos atualizar esta política para refletir melhorias e requisitos legais. Publicaremos a versão vigente nesta página.
      </p>

      <h2 className="text-2xl font-semibold mt-6">10. Contato</h2>
      <p>
        Dúvidas ou solicitações relacionadas a dados pessoais: suporte@acquaxdobrasil.com.br
      </p>
    </main>
  );
}
