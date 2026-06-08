# Ferramenta de Avaliação de Integridade — versão com back-end seguro

Esta versão lê a planilha do **Google Sheets em tempo real** e guarda as
**anotações do analista no Supabase**. As credenciais ficam **exclusivamente no
servidor** — nada (nem a key do Supabase, nem o link da planilha) é exposto no
navegador.

## Arquitetura (resumo)

```
  navegador  ───►  /api/*  ───►  servidor Node  ───►  Supabase
   (front)                        (.env: chaves)  ───►  Google Sheets
```

- O front (`public/`) só conhece endpoints neutros: `/api/health`,
  `/api/anotacoes`, `/api/sheets`.
- O servidor (`server/`) guarda as credenciais em `server/.env` e fala com o
  Supabase e o Google. **`.env` nunca é servido ao navegador.**
- Os dados brutos continuam vindo da planilha (fonte da verdade). O Supabase
  guarda só o trabalho manual do analista, casado a cada linha por uma chave
  estável (`processo | edital | uasg`).

## Como rodar (por ordem de prioridade)

### 1º — Subir o servidor (essencial)
```bash
cd app/server
npm install          # instala express, dotenv, @supabase/supabase-js
cp .env.example .env # crie seu .env
node server.js       # abre em http://localhost:3000
```
A leitura da planilha exige o Google Sheets configurado (`SHEETS_URL`): esse é o
único fluxo de entrada de dados. Sem ele, o app mostra uma mensagem indicando
que a planilha não está configurada e o botão de sincronização fica desabilitado.

### 2º — Ligar a persistência (Supabase)
1. No Supabase → **SQL Editor**, rode `app/supabase_schema.sql` (anotações + RLS),
   depois `app/supabase_cycles_schema.sql` (ciclos de análise + relatórios).
2. Em **Storage**, crie um bucket chamado `relatorios` (guarda os PDFs dos relatórios).
3. Em **Project Settings → API**, copie a **Project URL** e a **service_role key**.
4. Preencha em `server/.env`:
   ```
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_KEY=sua-service-role-key
   ```
   > A service_role key é segura aqui porque nunca sai do servidor. Como o acesso
   > passa só pela API do back-end, você pode inclusive deixar a tabela fechada
   > no RLS (sem políticas para `anon`).

### 3º — Ligar a leitura do Google Sheets
1. Compartilhe a planilha como **“Qualquer pessoa com o link → Leitor”**.
2. Em `server/.env`:
   ```
   SHEETS_URL=https://docs.google.com/spreadsheets/d/SEU_ID/edit
   SHEETS_AUTO_REFRESH_SEG=0   # >0 para o front re-ler periodicamente

   # Cache / versionamento (opcionais — têm padrão)
   SHEETS_CACHE_TTL_SEG=60     # serve do cache por N s antes de rebuscar (0 = só com ?forcar=1)
   SHEETS_KEEP_VERSIONS=20     # quantas versões manter em disco (a atual nunca é apagada)
   # SHEETS_DATA_DIR=./data/sheets   # onde guardar versões e histórico
   ```
A aba lida é a `edital` (ou a primeira, se não existir) — igual ao comportamento
original.

**Cache, versionamento e rastreabilidade.** A planilha não é mais baixada do
Google a cada requisição. O servidor mantém a versão corrente em memória e em
disco e só rebusca quando o TTL expira (ou com `?forcar=1`). Cada download tem o
conteúdo identificado por hash (SHA-256): conteúdo idêntico **não** gera nova
versão; conteúdo diferente vira uma nova versão em `server/data/sheets/`, e toda
importação é registrada em `history.jsonl`. Se o Google ficar indisponível, o
servidor serve a última versão válida (estado `stale`) em vez de quebrar — só
retorna erro se nunca houver baixado nada.

## Estrutura

```
app/
├─ public/                 ← front-end (servido pelo Node)
│  ├─ index.html
│  ├─ css/styles.css
│  └─ js/  (supabase_store.js e sheets.js chamam /api/*)
├─ server/
│  ├─ server.js            ← entrypoint: só sobe o servidor
│  ├─ package.json
│  ├─ .env.example         ← modelo; copie para .env e preencha
│  ├─ .gitignore           ← ignora node_modules, .env e data/
│  └─ src/                 ← aplicação organizada em camadas
│     ├─ app.js            ← monta o Express (json, /api, estáticos, erros)
│     ├─ config/           ← configuração e clientes externos
│     │  ├─ index.js       ← lê .env; centraliza portas, flags e paths
│     │  └─ supabase.js    ← cria o client do Supabase (ou null se inativo)
│     ├─ repositories/     ← acesso a dados puro
│     │  ├─ anotacoes.repository.js
│     │  └─ sheetsCache.repository.js  ← versões em disco + histórico
│     ├─ services/         ← regra de negócio
│     │  ├─ anotacoes.service.js
│     │  └─ sheets.service.js          ← cache, versionamento, fallback
│     ├─ routes/           ← endpoints HTTP
│     │  ├─ index.js       ← agrega as rotas em /api
│     │  ├─ health.routes.js
│     │  ├─ anotacoes.routes.js
│     │  └─ sheets.routes.js
│     └─ middlewares/      ← utilitários transversais
│        ├─ asyncHandler.js   ← encaminha erros async ao handler
│        └─ errorHandler.js   ← tratamento de erro centralizado
└─ supabase_schema.sql     ← rode no Supabase (anotações)
└─ supabase_cycles_schema.sql ← rode no Supabase (ciclos + relatórios)
```

> Os dados da planilha baixados ficam em `server/data/sheets/` (versões `.xlsx`
> + `manifest.json` + `history.jsonl`). Essa pasta é gerada em runtime e está no
> `.gitignore`.

## Endpoints da API (referência)

| Método | Rota | Função |
|---|---|---|
| GET | `/api/health` | Flags do que está ativo (sem credenciais) |
| GET | `/api/anotacoes` | Todas as anotações `{ uid: dados }` |
| PUT | `/api/anotacoes/:uid` | Grava as anotações de uma linha |
| DELETE | `/api/anotacoes/:uid` | Remove as anotações de uma linha |
| GET | `/api/sheets` | Devolve o XLSX da planilha (via cache; `?forcar=1` rebusca no Google) |
| GET | `/api/sheets/meta` | Metadados da versão atual (hash, horário, tamanho, origem) |
| GET | `/api/sheets/historico` | Histórico de importações (`?limite=N`, padrão 50) |
| GET | `/api/ciclos/dashboard` | Contagens por status + último relatório |
| GET | `/api/ciclos/fila` | Registros do ciclo atual (não-finalizados) |
| GET | `/api/ciclos/status` | Mapa `{ uid: status }` para cruzar com a planilha |
| POST | `/api/ciclos/sincronizar` | Cadastra novos obrigatórios (só insere novos) |
| POST | `/api/ciclos/analises/:uid/transicao` | Muda o status de uma análise |
| POST | `/api/ciclos/relatorios` | Gera relatório (encerra o lote) — aceita PDF base64 |
| GET | `/api/ciclos/relatorios` | Lista de relatórios (histórico) |
| GET | `/api/ciclos/relatorios/:id` | Um relatório com seus registros |

A resposta de `GET /api/sheets` inclui headers de rastreabilidade: `X-Sheet-Version`
(hash do conteúdo), `X-Sheet-Imported-At` e `X-Sheet-Cache` (`hit` / `miss` /
`revalidado` / `stale`).

## Fluxo operacional por ciclos

A ferramenta opera em ciclos de análise para nunca reprocessar o mesmo registro.
O eixo de **ciclo de vida** é independente do classificador de conformidade:
o classificador diz se um registro é `avaliacao-obrigatoria`; só esses entram no
ciclo, percorrendo `PENDENTE → EM_ANALISE → VALIDADO → FINALIZADO`.

- **Sincronização:** ao ler a planilha, os novos obrigatórios são cadastrados
  como `PENDENTE`. Registros já existentes não são recriados e finalizados nunca
  são reabertos (a função SQL `sincronizar_obrigatorios` é idempotente).
- **Análise:** abrir um obrigatório pendente marca `EM_ANALISE`; concluir o
  questionário de avaliação obrigatória marca `VALIDADO`.
- **Relatório:** "Gerar Relatório" cria um lote fechado com numeração sequencial
  (transação atômica via `gerar_relatorio`), gera o PDF, guarda no Storage e move
  os registros validados para `FINALIZADO`. Eles somem da fila e ficam só no
  histórico. Um registro `FINALIZADO` é terminal: não volta para a fila nem entra
  em relatórios futuros.
- **Histórico:** a aba Histórico lista todos os relatórios (número, data,
  analista, total, download do PDF) e, ao abrir um, mostra os registros que o
  compuseram — trilha de auditoria permanente.

As três tabelas (`analises`, `relatorios`, `relatorio_registros`) e as funções
transacionais ficam em `app/supabase_cycles_schema.sql`.

## Hospedagem (recomendação)

Para uso interno, qualquer VPS simples roda `node server.js` (use um gerenciador
de processo como `pm2` para manter no ar). O mesmo código sobe quase sem
mudanças em plataformas gerenciadas (Railway, Render) caso queira depois — basta
configurar as variáveis de ambiente lá em vez do `.env`.
```
