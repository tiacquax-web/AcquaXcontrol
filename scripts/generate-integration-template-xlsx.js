const XLSX = require("xlsx");
const path = require("path");

function sheetFromRows(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

const workbook = XLSX.utils.book_new();

const fornecedoresRows = [
  [
    "fornecedor",
    "ambiente",
    "base_url",
    "auth_tipo",
    "auth_detalhes",
    "rate_limit_rps",
    "timeout_s",
    "suporta_webhook",
    "suporta_polling",
    "suporta_agendamento",
    "timezone_padrao",
    "doc_url",
    "contato_tecnico",
  ],
  ["SIMHUB", "sandbox", "", "", "", "", "", "", "", "", "", "", ""],
  ["SIMHUB", "producao", "", "", "", "", "", "", "", "", "", "", ""],
  ["TIM", "sandbox", "", "", "", "", "", "", "", "", "", "", ""],
  ["TIM", "producao", "", "", "", "", "", "", "", "", "", "", ""],
  ["GROUPLINK", "sandbox", "", "", "", "", "", "", "", "", "", "", ""],
  ["GROUPLINK", "producao", "", "", "", "", "", "", "", "", "", "", ""],
];

const endpointsRows = [
  [
    "fornecedor",
    "ambiente",
    "finalidade",
    "metodo",
    "endpoint_path",
    "query_params",
    "headers_obrigatorios",
    "body_exemplo",
    "response_exemplo",
    "paginacao",
    "retry_recomendado",
  ],
  ["SIMHUB", "sandbox", "nivel_tempo_real", "GET", "/reservoirs/levels", "complexId,deviceId", "Authorization", "{}", "{}", "cursor", "3"],
  ["TIM", "sandbox", "coleta_leituras", "GET", "/readings", "meterId,from,to", "Authorization", "{}", "{}", "page", "3"],
  ["GROUPLINK", "sandbox", "coleta_leituras", "GET", "/meters/readings", "deviceId,date", "Authorization", "{}", "{}", "none", "3"],
];

const mapeamentoRows = [
  [
    "fornecedor",
    "company_id_interno",
    "complex_id_interno",
    "block_id_interno",
    "apartment_id_interno",
    "meter_id_interno",
    "register_chassi_interno",
    "reservoir_id_interno",
    "id_externo_fornecedor",
    "tipo_utilitario",
    "ativo",
  ],
  ["SIMHUB", "", "", "", "", "", "", "", "", "nivel", "sim"],
  ["TIM", "", "", "", "", "", "", "", "", "agua", "sim"],
  ["GROUPLINK", "", "", "", "", "", "", "", "", "gas", "sim"],
];

const agendamentosRows = [
  [
    "fornecedor",
    "complex_id_interno",
    "meter_id_interno",
    "regra_tipo",
    "dias_semana",
    "horario_local",
    "timezone",
    "janela_minutos",
    "ativo",
    "prioridade",
    "observacao",
  ],
  ["TIM", "", "", "diario", "seg,ter,qua,qui,sex,sab,dom", "06:00", "America/Sao_Paulo", "30", "sim", "1", ""],
  ["GROUPLINK", "", "", "diario", "seg,ter,qua,qui,sex,sab,dom", "07:00", "America/Sao_Paulo", "30", "sim", "1", ""],
];

const regrasRows = [
  ["topico", "chave", "valor"],
  ["SIMHUB", "latencia_max_segundos", "30"],
  ["SIMHUB", "modo_ingestao_preferencial", "webhook"],
  ["TIM", "coleta_fora_janela", "nao"],
  ["GROUPLINK", "coleta_fora_janela", "nao"],
  ["GERAL", "tentativas_retry", "3"],
  ["GERAL", "backoff_segundos", "5,15,45"],
  ["GERAL", "deduplicacao_por", "fornecedor+id_externo+timestamp"],
  ["GERAL", "fuso_padrao", "America/Sao_Paulo"],
];

const aceiteRows = [
  ["id", "cenario", "entrada", "resultado_esperado", "prioridade"],
  ["AC1", "Leitura TIM agendada", "complexo X 06:00", "leitura salva no intervalo de janela", "alta"],
  ["AC2", "Leitura GL agendada", "medidor Y 07:00", "leitura salva sem duplicidade", "alta"],
  ["AC3", "Nivel Simhub em tempo real", "reservatorio Z atualiza", "nivel refletido em <=30s", "alta"],
  ["AC4", "Falha de API", "timeout fornecedor", "retry executado e erro auditado", "alta"],
];

XLSX.utils.book_append_sheet(workbook, sheetFromRows(fornecedoresRows), "fornecedores");
XLSX.utils.book_append_sheet(workbook, sheetFromRows(endpointsRows), "endpoints");
XLSX.utils.book_append_sheet(workbook, sheetFromRows(mapeamentoRows), "mapeamento_ids");
XLSX.utils.book_append_sheet(workbook, sheetFromRows(agendamentosRows), "agendamentos");
XLSX.utils.book_append_sheet(workbook, sheetFromRows(regrasRows), "regras_negocio");
XLSX.utils.book_append_sheet(workbook, sheetFromRows(aceiteRows), "criterios_aceite");

const outputPath = path.resolve(process.cwd(), "docs", "integracao_api_template.xlsx");
XLSX.writeFile(workbook, outputPath);

console.log(outputPath);
