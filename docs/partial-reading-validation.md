# 🔧 Validação de Campos Parciais de Leitura

## ✅ Nova Funcionalidade Implementada

Agora o sistema detecta quando uma linha tem **campos parciais de leitura** e informa especificamente quais campos estão presentes e quais estão faltando.

## 🎯 Como Funciona

### Antes (Comportamento Antigo)
```
❌ Validação genérica que não ajudava:
"Deve ter pelo menos dados de leitura OU relatório"
```

### Agora (Comportamento Melhorado)
```
🔧 Detecção inteligente de campos parciais:
"Dados de leitura incompletos. Encontrados: chassi, leitura_atual. 
Faltam: data_leitura. Para registrar leituras, todos os 3 campos são obrigatórios."
```

## 📊 Exemplos de Cenários

### ✅ **Cenário 1: Dados Completos de Leitura**
```csv
chassi,leitura_atual,data_leitura
12345,150.5,31/01/2025
```
**Resultado**: ✅ Aceito como "linha com leitura"

### ⚠️ **Cenário 2: Só Chassi (Incompleto)**
```csv
chassi,leitura_atual,data_leitura
12345,,
```
**Resultado**: 
```
🔧 Linha 2: Dados de leitura incompletos. 
Encontrados: chassi. 
Faltam: leitura_atual, data_leitura. 
Para registrar leituras, todos os 3 campos são obrigatórios.
```

### ⚠️ **Cenário 3: Chassi + Leitura (Incompleto)**
```csv
chassi,leitura_atual,data_leitura
12345,150.5,
```
**Resultado**: 
```
🔧 Linha 2: Dados de leitura incompletos. 
Encontrados: chassi, leitura_atual. 
Faltam: data_leitura. 
Para registrar leituras, todos os 3 campos são obrigatórios.
```

### ⚠️ **Cenário 4: Só Data + Leitura (Incompleto)**
```csv
chassi,leitura_atual,data_leitura
,150.5,31/01/2025
```
**Resultado**: 
```
🔧 Linha 2: Dados de leitura incompletos. 
Encontrados: leitura_atual, data_leitura. 
Faltam: chassi. 
Para registrar leituras, todos os 3 campos são obrigatórios.
```

### ✅ **Cenário 5: Sem Leitura, Mas Com Relatório**
```csv
chassi,leitura_atual,data_leitura,consumo_agua_m3
,,,2.3
```
**Resultado**: ✅ Aceito como "linha com relatório" (leitura ignorada)

## 🧠 Lógica Implementada

```typescript
// 1. Verificar quais campos de leitura estão presentes
const readingFields = {
  chassi: !!(row.chassi?.toString().trim()),
  leitura_atual: (row.leitura_atual !== null && row.leitura_atual !== undefined),
  data_leitura: !!(row.data_leitura?.toString().trim())
};

// 2. Contar campos presentes
const readingFieldsPresent = Object.values(readingFields).filter(Boolean).length;

// 3. Classificar situação
const hasCompleteReadingData = readingFieldsPresent === 3;  // Todos os 3
const hasPartialReadingData = readingFieldsPresent > 0 && readingFieldsPresent < 3; // 1 ou 2

// 4. Gerar mensagem específica para dados parciais
if (hasPartialReadingData) {
  const presentFields = Object.entries(readingFields)
    .filter(([field, present]) => present)
    .map(([field]) => field);
    
  const missingFields = Object.entries(readingFields)
    .filter(([field, present]) => !present)  
    .map(([field]) => field);
    
  // Mensagem detalhada com campos encontrados e faltando
}
```

## 🎯 Benefícios para o Usuário

### Antes:
1. ❌ Planilha rejeitada sem explicação clara
2. ❌ Usuário não sabia quais campos específicos faltavam
3. ❌ Tentativa e erro para descobrir o problema

### Agora:
1. ✅ Mensagem específica sobre campos presentes e ausentes
2. ✅ Usuário sabe exatamente o que adicionar na planilha
3. ✅ Correção direcionada e eficiente

## 📝 Exemplo Real de Feedback

```
❌ 3 erros encontrados:

• 🔧 Linha 3: Dados de leitura incompletos. 
     Encontrados: chassi. 
     Faltam: leitura_atual, data_leitura. 
     Para registrar leituras, todos os 3 campos são obrigatórios.

• 🔧 Linha 5: Dados de leitura incompletos. 
     Encontrados: chassi, leitura_atual. 
     Faltam: data_leitura. 
     Para registrar leituras, todos os 3 campos são obrigatórios.

• 🔧 Linha 7: Dados de leitura incompletos. 
     Encontrados: leitura_atual, data_leitura. 
     Faltam: chassi. 
     Para registrar leituras, todos os 3 campos são obrigatórios.

Estatísticas do arquivo:
Total de linhas: 10     |  Linhas válidas: 7
Com leituras: 4         |  Com relatórios: 8
```

---

**Status**: ✅ **IMPLEMENTADO**  
**Impacto**: Feedback específico para dados parciais de leitura  
**UX**: Usuário sabe exatamente quais campos adicionar
