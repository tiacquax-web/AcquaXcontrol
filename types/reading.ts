import { IotDevice, Meter, Reading as DefaultReading } from "@prisma/client";

export interface Reading extends DefaultReading {
    device?: IotDevice
    meter?: Meter
}

export interface ReadingReportImport {
    // Nomes conforme planilha de importação de report de leituras em período (entre leituras 1 e 2)
    // A função dessa interface é obter uma linha de report que possui duas leituras e ser usada para ser dividida em duas leituras
    // e ser importada como duas leituras separadas no sistema;
    "device_id"?: string; // Em Reading, "iotDeviceId"
    "device_name"?: string; // Em Reading, "deviceName", e em IotDevice, "name"
    "remote_id"?: string; // Em Reading, "remoteId", e em IotDevice, "remoteId"
    "gps_display_adress"?: string; // Ignorado. (TODO: Incluir no futuro, se necessário, ou utilizar para atualizar algum campo de endereço do dispositivo se não existir valor)
    "data/hora 1"?: string; // Em Reading, "readingDate" e "readAt" (considerando conversão para os respectivos formatos de cada campo); Refere-se à data e à hora da primeira leitura, formato "dd/mm/AAAA  HH:mm:ss" com dois espaços às vezes;
    "leitura (m3) 1"?: number; // Em Reading, "reading", para a primeira leitura
    "data/hora 2"?: string; // Em Reading, "readingDate" e "readAt" (considerando conversão para os respectivos formatos de cada campo); Refere-se à data e à hora da segunda leitura, formato "dd/mm/AAAA  HH:mm:ss" com dois espaços às vezes;
    "leitura (m3) 2"?: number; // Em Reading, "reading", para a segunda leitura
    "consumo no período (m3)"?: number; // Não é usado diretamente (TODO: Armazenar se necessário em um campo json com outros campos que ainda não são salvos)
}

export interface DailyReadingImport {
    // Formato para importação de leituras diárias - múltiplas datas por linha
    "device_id"?: string; // ID do dispositivo
    "device_name"?: string; // Nome do dispositivo
    "multiplier"?: number; // Multiplicador da leitura
    // Colunas dinâmicas: cada propriedade adicional é uma data (ex: "12/05/2025") 
    // e o valor é a leitura para aquela data
    [dateColumn: string]: string | number | undefined;
}