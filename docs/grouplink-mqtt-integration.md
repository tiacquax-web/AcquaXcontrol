# Integração Group Link via MQTT (coleta 1x ao dia)

Este projeto agora possui integração nativa com o broker MQTT da Group Link, com autenticação por certificado e execução sob demanda (ideal para cron diário, sem stream contínuo).

## 1) Pré-requisitos com a Group Link

Conforme documentação deles:

- Gerar CSR e chave privada localmente (`.key`).
- Enviar o CSR para a Group Link.
- Receber:
  - certificado da CA: `grouplink-ca.crt`
  - certificado de cliente assinado: `private.crt` (ou nome equivalente)

Referência: documentação oficial da Group Link (MQTT/TLS por certificado).

## 2) Configuração de ambiente

No `.env` (base no `.env.example`), preencher:

- `GROUPLINK_MQTT_HOST` (default: `mqtt.grouplinknetwork.com`)
- `GROUPLINK_MQTT_PORT` (default: `8883`)
- `GROUPLINK_MQTT_CLIENT_ID`
- `GROUPLINK_MQTT_TOPIC` (ex.: `message/sua-org`)
- `GROUPLINK_MQTT_CA_PATH` (path absoluto do `grouplink-ca.crt`)
- `GROUPLINK_MQTT_CERT_PATH` (path absoluto do `.crt` do cliente)
- `GROUPLINK_MQTT_KEY_PATH` (path absoluto da sua `.key`)
- `GROUPLINK_SYNC_SECRET` (segredo para chamada do endpoint agendado)

Opcional tuning:

- `GROUPLINK_MQTT_CONNECT_TIMEOUT_MS`
- `GROUPLINK_MQTT_MAX_COLLECTION_MS`
- `GROUPLINK_MQTT_IDLE_TIMEOUT_MS`
- `GROUPLINK_MQTT_MAX_MESSAGES`

## 3) Endpoint de sincronização

Rota implementada:

- `POST /api/integrations/grouplink/sync`

Autorização:

- **Agendador/integração**: enviar header `x-grouplink-sync-secret` com valor de `GROUPLINK_SYNC_SECRET`.
- **Uso manual**: usuário autenticado via sessão (cookie/bearer) também pode disparar.

Payload opcional:

```json
{
  "dryRun": true
}
```

- `dryRun: true`: conecta/coleta/parseia, mas não grava no banco.

## 3.1) Agendamento por condomínio (via Acquaxcontrol)

Agora cada condomínio pode ter seu próprio agendamento da Group Link salvo no cadastro.

Campos no condomínio:

- `groupLinkEnabled` (liga/desliga)
- `groupLinkScheduleTime` (HH:mm)
- `groupLinkTimezone` (timezone IANA, ex.: `America/Sao_Paulo`)
- `groupLinkTopic` (opcional; se vazio usa `GROUPLINK_MQTT_TOPIC`)

No front:

- Tela de **Condomínios** → editar condomínio → aba **Gestão** → seção **Integração Group Link**.

Endpoints:

- `GET /api/integrations/grouplink/schedules?complexId=<id>`
- `PUT /api/integrations/grouplink/schedules` com body:

```json
{
  "complexId": "uuid",
  "enabled": true,
  "scheduleTime": "03:10",
  "timezone": "America/Sao_Paulo",
  "topic": "message/seu-topico-opcional"
}
```

Executar agendamentos vencidos:

- `POST /api/integrations/grouplink/run-due`
- requer header `x-grouplink-sync-secret`

Esse endpoint varre condomínios habilitados e executa somente os que:

- já chegaram no horário configurado do dia no timezone do condomínio
- ainda **não** foram sincronizados hoje

## 4) Exemplo de agendamento 1x ao dia

Exemplo usando `curl` (rodar em cron externo):

```bash
curl -X POST "https://SEU_DOMINIO/api/integrations/grouplink/sync" \
  -H "x-grouplink-sync-secret: SEU_SEGREDO" \
  -H "content-type: application/json" \
  -d '{}'
```

Se estiver usando agendamento por condomínio no Acquaxcontrol, prefira chamar:

```bash
curl -X POST "https://SEU_DOMINIO/api/integrations/grouplink/run-due" \
  -H "x-grouplink-sync-secret: SEU_SEGREDO" \
  -H "content-type: application/json" \
  -d '{}'
```

Exemplo cron diário às 03:10:

```cron
10 3 * * * /usr/bin/curl -sS -X POST "https://SEU_DOMINIO/api/integrations/grouplink/sync" -H "x-grouplink-sync-secret: SEU_SEGREDO" -H "content-type: application/json" -d '{}'
```

## 5) O que a sincronização faz

1. Conecta no MQTT com TLS mTLS (CA + cert + key).
2. Assina o tópico configurado.
3. Coleta mensagens por janela curta (timeout/idle/config).
4. Normaliza mensagens para leituras.
5. Deduplica por chave: `deviceId + readAt + reading`.
6. Upsert em `IotDevice`.
7. Resolve vínculo ativo `MeterDeviceLink` no instante da leitura.
8. Insere em `Reading` com os campos IoT e contexto desnormalizado quando houver link.

## 6) Observações importantes

- A arquitetura continua suportando alto volume de mensagens no broker, mas seu sistema só consome quando o endpoint diário é chamado.
- Se quiser reforço de idempotência em nível de banco, o próximo passo recomendado é criar uma chave única técnica para leitura IoT (ex.: hash persistido da leitura).

## 7) Medidores: marca IoT e vínculo por ID

O cadastro de medidores já está preparado para múltiplas marcas IoT:

- `GL`
- `TIM`
- `ARQDATA`

No cadastro/edição de medidor:

- campo **Marca IoT**
- campo **ID Group Link (opcional)**

Se o ID Group Link for informado e existir em Dispositivos IoT, o sistema cria automaticamente o vínculo (`MeterDeviceLink`) no salvamento do medidor.

### Importação de medidores (planilha)

No módulo de medidores:

- botão para baixar **Modelo** da planilha
- importação com modo:
  - **Atualizar e criar**
  - **Apenas atualizar existentes**
  - **Apenas criar novos**

Colunas adicionais suportadas na planilha:

- `id_group_link` (opcional)
- `marca_iot` (opcional: `GL`, `TIM`, `ARQDATA`)
