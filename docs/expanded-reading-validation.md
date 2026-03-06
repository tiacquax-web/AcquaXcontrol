# 🔍 Detecção Expandida de Campos Parciais de Leitura

## ✅ Nova Funcionalidade Implementada

O sistema agora detecta **todos os campos necessários** para registrar uma leitura no sistema e sinaliza quando há tentativa de importar leitura com dados incompletos.

## 📋 Campos Necessários para Leitura Completa

### **Obrigatórios para QUALQUER operação:**
1. `condominio` - Identificação do condomínio
2. `bloco` - Identificação do bloco  
3. `apartamento` - Identificação do apartamento

### **Obrigatórios para LEITURAS:**
4. `chassi` - Registro/chassi do medidor
5. `leitura_atual` - Valor da leitura em m³
6. `data_leitura` - Data da leitura (DD/MM/AAAA)

**Total: 6 campos obrigatórios para uma leitura funcionar**

## 🧠 Lógica de Detecção

### **Critério para "Tentativa de Leitura":**
Se a linha tem **pelo menos 1** dos campos específicos de leitura:
- `chassi` OU
- `leitura_atual` OU  
- `data_leitura`

### **Resultado da Validação:**
- ✅ **6/6 campos**: Leitura completa aceita
- ⚠️ **1-5/6 campos**: Detecta tentativa de leitura incompleta
- ✅ **0/6 campos**: Ignorado para leituras (pode ser só relatório)

## 📊 Exemplos de Cenários Detectados

### ⚠️ **Cenário 1: Falta condomínio**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
,A,101,12345,150.5,31/01/2025
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: bloco, apartamento, chassi do medidor, leitura atual, data da leitura. 
Faltam: condomínio. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 2: Falta bloco**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,,101,12345,150.5,31/01/2025
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: condomínio, apartamento, chassi do medidor, leitura atual, data da leitura. 
Faltam: bloco. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 3: Falta apartamento**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,A,,12345,150.5,31/01/2025
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: condomínio, bloco, chassi do medidor, leitura atual, data da leitura. 
Faltam: apartamento. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 4: Falta chassi (dados básicos OK)**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,A,101,,150.5,31/01/2025
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: condomínio, bloco, apartamento, leitura atual, data da leitura. 
Faltam: chassi do medidor. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 5: Falta valor da leitura**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,A,101,12345,,31/01/2025
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: condomínio, bloco, apartamento, chassi do medidor, data da leitura. 
Faltam: leitura atual. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 6: Falta data da leitura**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,A,101,12345,150.5,
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: condomínio, bloco, apartamento, chassi do medidor, leitura atual. 
Faltam: data da leitura. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ⚠️ **Cenário 7: Múltiplos campos faltando**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
,A,,12345,,
```
**Feedback:**
```
🔧 Linha 2: Tentativa de registrar leitura detectada, mas dados incompletos. 
Encontrados: bloco, chassi do medidor. 
Faltam: condomínio, apartamento, leitura atual, data da leitura. 
Para registrar leituras, todos os campos são obrigatórios.
```

### ✅ **Cenário 8: Leitura completa**
```csv
condominio,bloco,apartamento,chassi,leitura_atual,data_leitura
Condomínio ABC,A,101,12345,150.5,31/01/2025
```
**Resultado**: ✅ Aceito como leitura completa

### ✅ **Cenário 9: Só relatório (sem campos de leitura)**
```csv
condominio,bloco,apartamento,consumo_agua_m3
Condomínio ABC,A,101,2.3
```
**Resultado**: ✅ Aceito como relatório (leitura ignorada)

## 🎯 Vantagens da Nova Detecção

### **Antes:**
- ❌ Só detectava campos específicos de leitura (chassi + valor + data)
- ❌ Não considerava campos básicos obrigatórios
- ❌ Usuário podia ter todos dados de leitura mas faltar bloco/apartamento

### **Agora:**
- ✅ Detecta **qualquer tentativa** de registrar leitura
- ✅ Considera **todos os 6 campos** necessários
- ✅ Feedback específico com campos presentes vs ausentes
- ✅ Tradução para português dos nomes dos campos
- ✅ Orientação clara sobre todos os campos obrigatórios

## 🔧 Implementação Técnica

```typescript
// 1. Definir todos os campos necessários para leitura
const allReadingFields = {
  condominio: !!(row.condominio?.toString().trim()),
  bloco: !!(row.bloco?.toString().trim()),
  apartamento: !!(row.apartamento?.toString().trim()),
  chassi: !!(row.chassi?.toString().trim()),
  leitura_atual: (row.leitura_atual !== null && row.leitura_atual !== undefined),
  data_leitura: !!(row.data_leitura?.toString().trim())
};

// 2. Detectar tentativa de leitura (campos específicos de leitura presentes)
const coreReadingFields = {
  chassi: allReadingFields.chassi,
  leitura_atual: allReadingFields.leitura_atual,
  data_leitura: allReadingFields.data_leitura
};

const coreReadingFieldsPresent = Object.values(coreReadingFields).filter(Boolean).length;
const allReadingFieldsPresent = Object.values(allReadingFields).filter(Boolean).length;

// 3. Classificar situação
const hasCompleteReadingData = allReadingFieldsPresent === 6; // Todos os 6 campos
const hasPartialReadingData = coreReadingFieldsPresent > 0 && !hasCompleteReadingData;

// 4. Gerar feedback específico com tradução
const fieldTranslations = {
  condominio: 'condomínio',
  bloco: 'bloco', 
  apartamento: 'apartamento',
  chassi: 'chassi do medidor',
  leitura_atual: 'leitura atual',
  data_leitura: 'data da leitura'
};
```

---

**Status**: ✅ **IMPLEMENTADO**  
**Cobertura**: Todos os 6 campos necessários para leitura  
**UX**: Feedback específico e orientativo em português
