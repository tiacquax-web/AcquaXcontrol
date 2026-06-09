// Mapeamento de entidade da sidebar para PermissionableEntity
export const sidebarPermissionMap: Record<string, string> = {
  '/dashboard': 'system',
  '/apartment-report': 'apartmentConsumptionReport',
  '/dealership-readings': 'dealershipReading',
  '/readings': 'reading',
  '/meter-report': 'apartmentConsumptionReport',
  '/levantamento': 'apartmentConsumptionReport',
  // Monitoramento e Medidores de Nível são acessíveis para qualquer usuário
  // com permissão de leitura (síndicos com acesso a leituras podem ver monitoramento).
  // Usando 'reading' como proxy para não bloquear síndicos que não têm entidade
  // 'monitoringDashboard' ou 'reservoirReading' explicitamente em seu papel.
  '/monitoring': 'reading',
  '/reservoir-monitoring': 'reading',
  '/reservoirs': 'reservoir',
  '/companies': 'company',
  '/complexes': 'complex',
  '/blocks': 'block',
  '/apartments': 'apartment',
  '/meters': 'meter',
  '/devices': 'iotDevice',
  // '/users' intencionalmente omitido → visível para qualquer usuário autenticado com
  // alguma permissão (síndico, administradora, admin, etc.).
  // O controle de acesso real é feito no backend (scopedUserIds por contexto).
  '/roles': 'role',
  '/guia': 'system',
  '/apuracao': 'complex',
  // '/suporte' and '/sugestoes' intentionally omitted → visible to any authenticated user
  // '/api-manager' → somente usuários com contexto 'system' (admin/programador)
  // Mapeado para 'system' (mesma entidade do /dashboard) mas com requiresCreate:
  // a lógica do sidebar checa p.entity === 'system' && p.action === 'create'
  // que equivale a admins do sistema.
  '/api-manager': 'system',
};
