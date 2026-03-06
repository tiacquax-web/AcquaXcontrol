# 📊 Importação Combinada de Leituras e Relatórios

## 🎯 Visão Geral

A funcionalidade de **Importação Combinada** permite importar **leituras de medidores** e **relatórios de consumo de apartamentos** em uma única planilha, facilitando o processo operacional mensal.

## 🗂️ Formato da Planilha

### Campos Obrigatórios
- `condominio`: Nome do condomínio
- `ano_ref`: Ano de referência (ex: 2025)
- `mes_ref`: Mês de referência (01-12 ou janeiro-dezembro)
- `bloco`: Identificação do bloco
- `apartamento`: Número/nome do apartamento

### Campos de Leitura (Opcionais)
- `chassi`: Registro/chassi do medidor
- `leitura_atual`: Valor da leitura atual em m³
- `data_leitura`: Data da leitura (DD/MM/AAAA)
- `prox_leitura`: Data da próxima leitura (DD/MM/AAAA)
- `foto`: URL da foto da leitura
- `pre_leitura`: Se é pré-leitura ("Sim"/"Não" ou true/false)
- `leitura_anterior`: Valor da leitura anterior (opcional)
- `data_leitura_anterior`: Data da leitura anterior (opcional)

### Campos de Relatório (Opcionais)
- `consumo_agua_m3`: Consumo de água em m³
- `valor_consumo_agua`: Valor do consumo de água em R$
- `valor_esgoto`: Valor do esgoto em R$
- `consumo_pipa_m3`: Consumo carro pipa em m³
- `custo_pipa`: Custo carro pipa em R$
- `rateio_agua`: Rateio proporcional
- `consumo_total_agua_m3`: Consumo total da unidade
- `valor_total_agua_unidade`: Valor total da unidade
- `consumo_gas_m3`: Consumo de gás em m³
- `valor_consumo_gas`: Valor do consumo de gás em R$

## 🚀 Como Usar

### 1. Acesso
Vá para: **Contas de Condomínio** → **Selecionar conta** → **Aba "Relatórios de Apartamentos"**

### 2. Botão de Importação
Clique em **"Importar Leituras + Relatórios"** (ao lado do botão de importação padrão)

### 3. Download do Template
- Clique em **"Baixar Template"** para obter o formato correto
- O template inclui exemplos de preenchimento

### 4. Preparar Planilha
- Use o template como base
- Cada linha pode ter **apenas leituras**, **apenas relatório**, ou **ambos**
- Certifique-se de que o nome do condomínio está correto

### 5. Validação
- Selecione o arquivo Excel/CSV
- Clique em **"Validar"**
- Revise o resumo: quantas linhas com leituras, relatórios, etc.

### 6. Importação
- Se a validação passou, clique em **"Importar Dados"**
- Acompanhe o progresso da importação
- Revise o resultado final

## ✨ Funcionalidades Especiais

### Vinculação Automática
- Quando uma linha tem **leitura E relatório** do mesmo apartamento/período
- A leitura é automaticamente vinculada ao relatório via `lastReadingId`
- Facilita o rastreamento de qual leitura gerou cada relatório

### Validações Inteligentes
- ✅ Verifica se apartamentos existem no sistema
- ✅ Valida formato de datas e valores numéricos
- ✅ Confirma se medidores existem (para leituras)
- ✅ Detecta duplicatas

### Flexibilidade
- ✅ Pode importar **só leituras**, **só relatórios**, ou **ambos**
- ✅ Leituras anteriores são opcionais
- ✅ Atualiza relatórios existentes se necessário
- ✅ Mantém funcionalidades de importação separadas

## 📈 Resultados da Importação

Após a importação, você verá:
- **Leituras criadas**: Quantas novas leituras foram registradas
- **Relatórios criados**: Quantos novos relatórios foram criados
- **Relatórios atualizados**: Quantos relatórios existentes foram atualizados
- **Vinculações criadas**: Quantas leituras foram vinculadas a relatórios

## ⚠️ Avisos e Erros

### Avisos Comuns
- Medidor não encontrado para leitura
- Leitura já existe para o mesmo medidor/data
- Apartamento não encontrado

### Erros Comuns
- Formato de data inválido
- Valores numéricos negativos
- Campos obrigatórios faltando
- Condomínio não encontrado no sistema

## 🔧 Dependências Técnicas

### Pré-requisitos
- Conta do condomínio deve estar cadastrada (`DealershipReading`)
- Apartamentos e blocos devem existir no sistema
- Medidores devem estar cadastrados (para leituras)

### Limitações
- Apenas um condomínio por importação
- Apenas um mês/ano por importação
- Arquivos até 10MB (limite do sistema)

## 📝 Exemplo de Planilha

```csv
condominio,ano_ref,mes_ref,bloco,apartamento,chassi,leitura_atual,data_leitura,consumo_agua_m3,valor_consumo_agua,valor_esgoto
Condomínio ABC,2025,01,A,101,12345,150.5,31/01/2025,2.3,15.50,8.75
Condomínio ABC,2025,01,A,102,12346,75.8,31/01/2025,1.8,12.20,6.90
Condomínio ABC,2025,01,B,201,,,,3.1,18.60,10.50
```

## 🎉 Benefícios

- ⚡ **Reduz tempo**: Uma planilha para dois tipos de dados
- 🔗 **Vincula automaticamente**: Leituras e relatórios são conectados
- ✅ **Mantém qualidade**: Validações garantem dados consistentes
- 🔄 **Flexível**: Não substitui métodos existentes, apenas complementa
- 📊 **Transparente**: Mostra exatamente o que foi processado

---

*Esta funcionalidade foi desenvolvida para otimizar o processo mensal de importação de dados, mantendo a robustez e separação dos dados no sistema.*
