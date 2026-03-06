import { ContextType, PermissionableEntity, PermissionAction } from "@prisma/client"

export const mapContextType: Record<ContextType, string> = {
    company: 'Empresa',
    complex: 'Condomínio',
    block: 'Bloco',
    apartment: 'Apartamento',
    system: 'Sistema',
}


export const actionTitleMap: Record<PermissionAction, string> = {
    create: "Criar",
    read: "Ler",
    update: "Atualizar",
    delete: "Excluir",
    do: "Executar",
}

export const entityTitleMap: Record<PermissionableEntity, string> = {
    apartment: "Apartamentos",
    meter: "Medidores",
    role: "Papéis",
    permission: "Permissões",
    reading: "Leituras",
    monitoringDashboard: "Dashboard de Monitoramento",
    apartmentConsumptionReport: "Relatórios de Consumo",
    block: "Blocos",
    complex: "Condomínios",
    company: "Empresas",
    dealership: "Concessionárias",
    dealershipReading: "Leituras da Concessionária",
    // dealershipReadingGas: "Leitura de Gás",
    iotDevice: "Dispositivo IoT",
    roleAssignment: "Atribuição de Papel",
    typeMeter: "Tipos de Medidor",
    user: "Usuários",
    meterDeviceLink: "Vínculo de Dispositivo de Medidor",
    reservoir: "Reservatórios",
    reservoirReading: "Leituras de Reservatórios",
    scheduledTask: "Tarefas Agendadas",
    recurringSchedule: "Agendamentos Recorrentes",
    scheduleOverride: "Substituições de Agendamento",
    generateFilipeta: "Gerar Filipeta",
}