/**
 * Script de correção do banco - executado em 11/03/2026
 * 
 * Correções aplicadas:
 * 1. Migrou condomínios das empresas "Teste" e "AcquaX do Brasil Ltda" 
 *    para a empresa principal "Acqua X do Brasil" (e8155542)
 * 2. Removeu (deletedAt) as empresas extras
 * 3. Corrigiu admin@acquax.com: trocou papel Programador → Administrador (system)
 * 4. Removeu papel Operacional do sistema
 * 5. Migrou os 4 usuários com papel Operacional → papel Administrador (contextType:company)
 * 
 * Resultado:
 * - 1 empresa ativa: Acqua X do Brasil
 * - 285 condomínios vinculados à empresa principal
 * - admin@acquax.com: isSystem:true, systemRoles:['Administrador']
 * - Dashboard admin: AdminKPIDashboard (panorama KPI completo)
 * - Sidebar: todos os menus visíveis (234 permissões)
 */

// Este script já foi executado. Mantido aqui para documentação.
