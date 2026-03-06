# Sistema de Importação de Leituras IoT

Este documento descreve o novo sistema de importação de leituras IoT implementado.

## Visão Geral

O sistema permite importar leituras IoT a partir de planilhas de relatório, criando automaticamente dispositivos quando necessário e vinculando leituras a medidores através de MeterDeviceLinks.

## Arquitetura

### Serviços

1. **IotReadingService** (`lib/services/iot-reading-service.ts`)
   - Converte dados de importação em leituras
   - Cria dispositivos automaticamente
   - Vincula leituras a medidores quando possível
   - Processa importação completa

2. **DeviceManagementService** (`lib/services/device-management-service.ts`)
   - Gerencia dispositivos IoT
   - Busca leituras não vinculadas
   - Cria e remove links meter-device
   - Atualiza leituras quando links são criados

### Rotas da API

#### Importação de Leituras IoT
- **POST** `/api/(public)/user/(consumption)/readings/import-iot`
- Importa leituras a partir do formato ReadingReportImport
- Cria dispositivos automaticamente se não existirem
- Vincula leituras a medidores através de links existentes

#### Gerenciamento de Dispositivos
- **GET** `/api/(public)/user/(consumption)/devices/devices-list`
  - Lista dispositivos com status de vinculação
  - Parâmetros: `device_id`, `remote_id`, `has_active_link`, `take`, `skip`

- **GET** `/api/(public)/user/(consumption)/devices/unlinked-readings`
  - Lista leituras sem medidor vinculado
  - Parâmetros: `device_id`, `remote_id`, `date_from`, `date_to`, `take`, `skip`

#### Links Meter-Device
- **POST** `/api/(public)/user/(consumption)/devices/meter-links`
  - Cria novo link entre medidor e dispositivo
  - Body: `{ meterId, deviceId, startDate, endDate? }`

- **DELETE** `/api/(public)/user/(consumption)/devices/meter-links/[linkId]`
  - Remove link existente
  - Desvincula leituras associadas

## Fluxo de Trabalho

### 1. Importação de Leituras IoT

```typescript
// Exemplo de dados de importação
const importData = {
  readings: [
    {
      "device_id": "DEV001",
      "device_name": "Medidor Apartamento 101",
      "remote_id": "CHASSIS001",
      "data/hora 1": "01/01/2025  08:00:00",
      "leitura (m3) 1": 100.5,
      "data/hora 2": "31/01/2025  08:00:00",
      "leitura (m3) 2": 102.3,
      "consumo no período (m3)": 1.8
    }
  ]
};

// POST para /api/(public)/user/(consumption)/readings/import-iot
```

### 2. Gerenciamento de Dispositivos

```typescript
// Buscar dispositivos
GET /api/(public)/user/(consumption)/devices/devices-list?has_active_link=false

// Buscar leituras não vinculadas
GET /api/(public)/user/(consumption)/devices/unlinked-readings?device_id=DEV001

// Criar link meter-device
POST /api/(public)/user/(consumption)/devices/meter-links
{
  "meterId": "meter-uuid",
  "deviceId": "DEV001", 
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z"
}
```

## Tipos de Dados

### ReadingReportImport
```typescript
interface ReadingReportImport {
  "device_id"?: string;           // ID do dispositivo
  "device_name"?: string;         // Nome do dispositivo
  "remote_id"?: string;           // ID do chassi
  "gps_display_adress"?: string;  // Endereço (ignorado)
  "data/hora 1"?: string;         // Data/hora primeira leitura
  "leitura (m3) 1"?: number;      // Valor primeira leitura
  "data/hora 2"?: string;         // Data/hora segunda leitura
  "leitura (m3) 2"?: number;      // Valor segunda leitura
  "consumo no período (m3)"?: number; // Consumo (não usado)
}
```

### ProcessedReading
```typescript
interface ProcessedReading {
  reading: number;
  readAt: Date;
  readAtDate: string;
  deviceId: string;
  remoteId: string;
  deviceName?: string;
  isManualReading: boolean;
  isPreReading: boolean;
  meterId?: string;
}
```

## Funcionalidades

### Importação Automática
- Cada linha de importação gera 2 leituras (primeira e segunda)
- Dispositivos são criados automaticamente se não existirem
- Leituras são vinculadas a medidores se houver MeterDeviceLink ativo
- Leituras sem vinculação ficam disponíveis para gestão manual

### Gestão de Vínculos
- Interface para visualizar dispositivos com/sem vínculos ativos
- Busca de leituras não vinculadas por dispositivo/período
- Criação manual de vínculos meter-device
- Atualização automática de leituras quando vínculos são criados

### Validações e Permissões
- Validação de sessão em todas as rotas
- Verificação de permissões contextuais
- Validação de dados de entrada
- Tratamento de erros consistente

## Melhorias Futuras

1. **Interface Web**: Criar páginas para gerenciamento visual
2. **Validações Avançadas**: Detectar leituras inconsistentes
3. **Relatórios**: Dashboard de status de vinculação
4. **Notificações**: Alertas para leituras não vinculadas
5. **Histórico**: Log de alterações em vínculos

## Dependências

- Prisma ORM para acesso aos dados
- Validação de sessão existente
- Sistema de permissões por contexto
- Funções utilitárias para formatação de datas

## Observações

- O sistema mantém compatibilidade com leituras manuais existentes
- Leituras IoT usam `isManualReading: false`
- Dispositivos são identificados por `deviceId` único
- Links são validados por período (startDate/endDate)
- Permissões seguem o padrão existente do sistema
