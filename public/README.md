# Olá companheiros, sejam bem-vindos a Ferramenta de Conformidade criada pelo setor de integridade — Decreto Estadual nº 34.196/2024

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Lógica Jurídica](#lógica-jurídica)
   - [Art. 1º — Âmbito de Aplicação](#art-1º--âmbito-de-aplicação)
   - [Art. 2º — Obrigatoriedade da Avaliação](#art-2º--obrigatoriedade-da-avaliação)
   - [Art. 8º — Dispensa por Anterioridade](#art-8º--dispensa-por-anterioridade)
   - [Ordem de Aplicação das Regras](#ordem-de-aplicação-das-regras)
3. [Funcionamento Técnico](#funcionamento-técnico)
   - [Carregamento dos Dados](#carregamento-dos-dados)
   - [Normalização](#normalização)
   - [Classificação](#classificação)
   - [Exibição dos Resultados](#exibição-dos-resultados)
4. [Estrutura de Arquivos](#estrutura-de-arquivos)
5. [Módulos JavaScript](#módulos-javascript)
6. [Status Finais Possíveis](#status-finais-possíveis)
7. [Órgãos Excluídos (Art. 1º)](#órgãos-excluídos-art-1º)
8. [Como Executar os Testes](#como-executar-os-testes)
9. [Guia do Desenvolvedor](#guia-do-desenvolvedor)

---

## Visão Geral

Aplicação web para verificação automatizada de conformidade com o **Decreto Estadual nº 34.196/2024**, que regulamenta a Avaliação de Integridade nas contratações públicas do Estado do Rio Grande do Norte.

A lógica jurídica roda inteiramente no navegador (*client-side*). Um back-end Node enxuto acompanha a aplicação para servir os arquivos estáticos, ler a planilha do Google Sheets em tempo real e guardar as anotações do analista no Supabase — sem expor credenciais ao navegador. A entrada de dados é feita por um único fluxo oficial: a sincronização em tempo real com o Google Sheets configurado no servidor (ver `app/LEIA-ME.md`).

A ferramenta:

- Lê uma planilha Excel (`.xlsx` / `.xls`) com dados de processos licitatórios
- Aplica três verificações jurídicas em sequência obrigatória
- Classifica cada processo com um dos cinco status possíveis
- Permite que o analista informe dados complementares (valor manual, datas, validação Art. 8º)
- Exporta os resultados em CSV ou PDF

---

## Lógica Jurídica

### Art. 1º — Âmbito de Aplicação

**O que verifica:** Se o órgão responsável pelo processo pertence ao escopo do Decreto.

**Escopo do Decreto (órgãos incluídos):**
- Administração pública *direta* do Poder Executivo Estadual
- **Autarquias** estaduais
- **Fundações** públicas estaduais

**Exclusões automáticas (Art. 1º):**
Empresas públicas e sociedades de economia mista NÃO estão sujeitas ao Decreto:

| Sigla | Nome Oficial |
|-------|-------------|
| AGN | Agência de Fomento do Rio Grande do Norte (Desenvolve RN) |
| ARSEP | Agência Reguladora de Serviços Públicos do RN |
| CAERN | Companhia de Águas e Esgotos do Rio Grande do Norte |
| CEASA | Centrais de Abastecimento do Rio Grande do Norte |
| CEHAB | Companhia Estadual de Habitação e Desenvolvimento Urbano |
| DATANORTE | Companhia de Processamento de Dados do Rio Grande do Norte |
| EMGERN | Empresa Gestora de Ativos do Rio Grande do Norte |
| EMPARN | Empresa de Pesquisa Agropecuária do Rio Grande do Norte |
| EMPROTUR | Empresa Potiguar de Promoção Turística |
| POTIGAS | Companhia Potiguar de Gás |

**Resultado quando excluído:** Status `nao-enquadrado-art1` — o processo **não passa para Art. 2º nem Art. 8º**.

**Detecção inteligente do nome do órgão:**
1. Sigla exata (ex.: `"CAERN"` ou `"CAERN - Cia. de Águas"` → token `"CAERN"`)
2. Keywords normalizadas (sem acento, sem pontuação) — ex.: `"Companhia Potiguar de Gás S.A."` → keyword `"companhia potiguar de gas"` → POTIGAS identificada

---

### Art. 2º — Obrigatoriedade da Avaliação

**O que verifica:** Se o processo atinge os critérios de valor e/ou modalidade que tornam a Avaliação de Integridade obrigatória.

**Hierarquia de critérios (do mais específico para o mais genérico):**

| Prioridade | Inciso/§ | Critério | Limiar |
|-----------|----------|----------|--------|
| 1ª | §2º | Modalidade especial (inexigibilidade, emergencial, PPP, consórcio) | > R$ 15.000.000 |
| 2ª | §1º | Objeto especial (insumos hospitalares, medicamentos, vacinas, merenda escolar, alimentação prisional, uniforme, livro escolar, mão de obra terceirizada) | > R$ 15.000.000 |
| 3ª | I | Obras ou serviços de engenharia | > R$ 35.000.000 |
| 4ª | II | Serviços ou compras em geral (critério residual) | > R$ 25.000.000 |

**Regra dos aditivos (Art. 2º, §3º):**
Para aditivos contratuais, o valor relevante é o **total acumulado** (contrato original + aditivo). O sistema detecta aditivos por palavras-chave e solicita o valor total ao analista quando necessário.

**Resultado quando enquadrado:** `_requerAlice = true` → prossegue para verificação do Art. 8º.

**Resultado quando não enquadrado:** Status `nao-enquadrado` (não há avaliação necessária).

---

### Art. 8º — Dispensa por Anterioridade

**O que verifica:** Se o processo pode ser **dispensado** da Avaliação de Integridade por ter tido um evento relevante antes da entrada em vigor do Decreto (10/03/2025).

**Aplicação:** Somente quando o Art. 2º classifica o processo como obrigatório.

**Eventos que dispensam (Art. 8º, caput):**
1. Assinatura do instrumento contratual **antes de 10/03/2025**
2. Publicação do edital **antes de 10/03/2025**
3. Início do processo de dispensa/inexigibilidade **antes de 10/03/2025**

**Exceção (Art. 8º, § único):**
Aditivos contratuais NÃO são dispensados mesmo que o contrato original seja anterior a 10/03/2025.

**Fluxo de validação:**
1. O sistema verifica automaticamente a data do edital (campo `dt_public_edital`)
2. Se a data for anterior a 10/03/2025 → status `verificacao-humana` (aguarda confirmação do analista)
3. O analista seleciona qual evento ocorreu antes da vigência → sistema aplica a dispensa ou mantém a obrigatoriedade
4. Se o analista confirmar "nenhum evento anterior" → `avaliacao-obrigatoria`

---

### Ordem de Aplicação das Regras

```
Processo recebido
      │
      ▼
┌─────────────────────────────────────────┐
│  1️⃣  ART. 1º — Âmbito de aplicação       │
│  O órgão é da admin. direta/autarquia/   │
│  fundação do Poder Executivo Estadual?   │
└─────────────────────────────────────────┘
      │ Não                  │ Sim
      ▼                      ▼
 nao-enquadrado-art1   ┌─────────────────────────────────────────┐
 (processo encerrado)  │  2️⃣  ART. 2º — Obrigatoriedade          │
                       │  Atinge limiar de valor e critério?      │
                       └─────────────────────────────────────────┘
                             │ Não                  │ Sim
                             ▼                      ▼
                        nao-enquadrado    ┌─────────────────────────────────┐
                                          │  3️⃣  ART. 8º — Dispensa         │
                                          │  Evento relevante antes          │
                                          │  de 10/03/2025?                  │
                                          └─────────────────────────────────┘
                                                │           │            │
                                           Confirmado   Sem data/   Não ocorreu
                                           (Sim)        pendente    (Não)
                                                ▼           ▼            ▼
                                           dispensada  verificacao-  avaliacao-
                                                       humana        obrigatoria
```

> **Regra crítica:** O Art. 8º **nunca** é verificado antes do Art. 2º. Processos não enquadrados no Art. 2º recebem status `nao-enquadrado` — nunca `dispensada`.

---

## Funcionamento Técnico

### Carregamento dos Dados

**Arquivo aceito:** `.xlsx` ou `.xls`

**Fluxo de processamento (io.js):**

```
Arquivo Excel
     │
     ▼
FileReader.readAsArrayBuffer()
     │
     ▼
XLSX.read() — SheetJS com cellDates:true
     │  (converte seriais de data para objetos Date)
     ▼
sheet_to_json() → array de objetos
     │
     ▼
_mapColumnNames()
     │  (normaliza cabeçalhos: "Valor Estimado" → "valor_estimado", etc.)
     ▼
_normalizeFieldTypes()
     │  (converte datas para ISO, trata valores sigilosos)
     ▼
Normalizer.normalizeAll()
     │  (padroniza modalidade, tipo_objeto, nome do órgão)
     ▼
Classifier.classifyAll()
     │  (aplica Art. 1º → Art. 2º → Art. 8º em cada linha)
     ▼
loadDataset() → UI atualizada
```

**Mapeamento de colunas:**
O sistema aceita variações nos nomes das colunas da planilha. Exemplos mapeados:
- `"Valor Estimado"`, `"Vl Estimado"`, `"Valor (R$)"` → `valor_estimado`
- `"Data Publicação"`, `"Dt Pub Edital"` → `dt_public_edital`
- `"Órgão"`, `"Nome UASG"`, `"Unidade"` → `nome_Uasg`

### Normalização

**Módulo:** `normalizer.js`

Padroniza os campos de texto para garantir consistência na classificação:
- `modalidade`: "Pregão Eletrônico", "PE", "Pregão" → `"Pregão Eletrônico"`
- `tipo_objeto`: "Material", "Materiais", "Compra" → `"Material"`
- Remove acentos, colapsa espaços, aplica title-case consistente

### Classificação

**Módulo:** `classifier.js`

Funções principais:

| Função | Descrição |
|--------|-----------|
| `classifyAll(data)` | Processa todo o dataset (Art. 1 → Art. 2 → Art. 8) |
| `isOrgaoExcluidoArt1(row)` | Detecta órgão excluído pelo Art. 1º |
| `checkArt2I/II/P1/P2(row)` | Verificações individuais do Art. 2º |
| `checkArt8(row)` | Verifica dispensa pelo Art. 8º |
| `buildMotivoArt1/2/8(...)` | Gera texto explicativo da decisão |
| `getCounts(data)` | Agrega contagens para os cards de resumo |

**Campos internos adicionados a cada linha:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `_excluido_art1` | boolean | Verdadeiro se excluído pelo Art. 1º |
| `_reasons` | string[] | Critérios do Art. 2º ativados |
| `_requerAlice` | boolean | Verdadeiro se enquadra no Art. 2º |
| `_art8` | string | Status do Art. 8º |
| `_statusFinal` | string | Status final para exibição |
| `_motivoArt1/2/8` | string | Texto explicativo da decisão |
| `_isSigiloso` | boolean | Verdadeiro se valor não informado |
| `_isAditivo` | boolean | Verdadeiro se é aditivo contratual |

### Exibição dos Resultados

**Módulo:** `ui.js`

A interface exibe:
1. **Header** com pílulas de resumo (total, obrigatórios, dispensados, pendentes)
2. **Painel normativo** com os cards de critérios (Art. 1º, Art. 2º, Art. 8º)
3. **Seção de atenção** com alertas para processos críticos
4. **Panorama geral** com 4 cards de status final (clicáveis como filtros)
5. **Detalhamento** por inciso do Art. 2º (4 cards)
6. **Barra de filtros** com busca textual e filtros por status, modalidade, UASG, valor
7. **Tabela de resultados** paginada com ações inline
8. **Modal de detalhes** por processo — mostra Art. 1º / Art. 2º / Art. 8º com formulários de ação

---

## Estrutura de Arquivos

```
public/                     — front-end (servido pelo back-end Node)
│
├── index.html              — Página principal (HTML + layout completo)
│
├── css/
│   └── styles.css          — Todos os estilos (design system, responsivo)
│
├── js/
│   ├── state.js            — Estado global (State, DOM cache)
│   ├── classifier.js       — Lógica jurídica: Art. 1º, Art. 2º, Art. 8º
│   ├── normalizer.js       — Normalização de campos de texto
│   ├── io.js               — Pipeline de parse Excel (Sheets) e exportação CSV
│   ├── ui.js               — Renderização da tabela, modal, cards
│   ├── handlers.js         — Event handlers, filtros, reclassificação manual
│   ├── app.js              — Bootstrap, event listeners, API pública (window.App)
│   ├── analytics.js        — Aba de análise (gráficos, KPIs)
│   ├── export_pdf.js       — Exportação para PDF (via janela de impressão)
│   ├── icons.js            — Ícones SVG inline
│   ├── supabase_store.js   — Persistência das anotações via /api/anotacoes
│   └── sheets.js           — Leitura da planilha em tempo real via /api/sheets
│
├── Testes/
│   ├── _load_real_modules.js — Carrega os módulos IIFE reais para os testes
│   ├── test_logica.js        — Suíte de asserts sobre o pipeline real
│   └── test_cenarios_5.js    — Cenários simulados de validação
│
├── README.md               — Esta documentação
└── CORRECOES_APLICADAS.md  — Histórico das correções de lógica já aplicadas
```

> O back-end Node fica em `app/server/` e é documentado em `app/LEIA-ME.md`.
> O front consome apenas endpoints neutros sob `/api`.

**Ordem de carregamento no HTML (importa):**
```
icons.js → supabase_store.js → sheets.js → normalizer.js → classifier.js →
state.js → ui.js → handlers.js → io.js → analytics.js → export_pdf.js → app.js
```

## Módulos JavaScript

### `state.js`
- `State` — objeto global com `allData`, `filteredData`, `activeFilter`, `currentPage`, `pageSize`
- `DOM` — cache de referências ao DOM (populado por `bindDOM()`)
- `DATA_REF_TIPOS` — rótulos para tipos de data de referência do Art. 8º

### `classifier.js`
Módulo IIFE que expõe a API pública `Classifier`. Toda a lógica jurídica está aqui.

### `normalizer.js`
Módulo IIFE que expõe `Normalizer`. Padroniza textos de modalidade e tipo de objeto.

### `io.js`
Pipeline compartilhado de parse de planilha (usado pela sincronização com o Sheets) e exportação CSV.

### `ui.js`
Funções globais para renderização: `renderTable()`, `openModal()`, `closeModal()`, `buildStatusFinalBadge()`, etc.

### `handlers.js`
Funções globais para filtros (`applyFilters()`, `clearFilters()`), paginação (`changePage()`) e todas as ações do analista (valor manual, data, Art. 8º, contrato assinado).

### `app.js`
Bootstrap (`init()` chamado em `DOMContentLoaded`), `setupListeners()`, `toggleNormaPanel()` e `window.App` (API pública para uso em `onclick` inline no HTML).

---

## Status Finais Possíveis

| Status | Descrição | Cor |
|--------|-----------|-----|
| `avaliacao-obrigatoria` | Enquadra no Art. 2º e não está dispensado |  Vermelho |
| `dispensada` | Enquadra no Art. 2º, mas dispensado pelo Art. 8º |  Verde |
| `verificacao-humana` | Pendente de informação do analista (valor sigiloso, Art. 8º aguardando) |  Amarelo |
| `nao-enquadrado` | Não atinge critérios do Art. 2º (dentro do escopo do Art. 1º) |  Cinza |
| `nao-enquadrado-art1` | Órgão excluído pelo Art. 1º (empresa pública/economia mista) |  Índigo |

---

## Órgãos Excluídos (Art. 1º)

A detecção é inteligente e opera em dois níveis:

1. **Sigla exata** — identifica o primeiro token do nome, comparando com o Set de siglas
2. **Keywords** — normaliza o texto (remove acentos, S.A., LTDA, pontuação) e verifica se qualquer keyword do mapa está presente

```javascript
// Exemplo de detecção por keyword:
// nome_Uasg = "Companhia Potiguar de Gás S.A."
// → normalizado: "companhia potiguar de gas"
// → keyword "companhia potiguar de gas" ∈ POTIGAS.keywords
// → EXCLUÍDO
```

Para adicionar um novo órgão excluído, edite `ORGAOS_EXCLUIDOS_MAP` em `classifier.js`:
```javascript
{
  sigla: 'SIGLA',
  nome: 'Nome Oficial Completo',
  keywords: ['keyword1', 'keyword2', 'palavra chave sem acento'],
},
```

---

## Como Executar os Testes

Requer Node.js (v14+). Os testes ficam em `public/Testes/`:

```bash
cd public/Testes

# Suíte de asserts sobre o pipeline real
node test_logica.js

# Cenários simulados detalhados
node test_cenarios_5.js
```

**Resultado esperado:**
```
RESULTADO FINAL: 38 aprovados | 0 falhou(ram)
RESULTADO: 21 aprovados | 0 falhou(ram) | Total: 21
```

> Os testes carregam os módulos reais (`classifier.js`, `normalizer.js`) via
> `_load_real_modules.js`, exercitando o mesmo código que roda em produção.

---

## Guia do Desenvolvedor

### Como funciona o fluxo de reclassificação manual

Quando o analista informa dados (valor, data, validação Art. 8º), o sistema chama `_reclassifyRow(row)` em `handlers.js`, que reaplicará a sequência completa Art. 1 → Art. 2 → Art. 8 na linha e atualizará a UI.

### Como adicionar um novo critério ao Art. 2º

1. Adicione as keywords na lista correspondente em `classifier.js` (ex.: `P1_KEYWORDS`)
2. Se for um novo inciso/§, crie a função `checkArt2Px(row)` seguindo o padrão existente
3. Adicione à hierarquia em `classifyRow()` e ao `getCounts()`
4. Atualize `RULE_META` para metadados de exibição
5. Adicione testes em `test_logica.js`

### Como funciona a filtragem

`applyFilters()` em `handlers.js` filtra `State.allData` com base em:
- `State.activeFilter` — filtro de card ativo (clique nos cards do panorama)
- `DOM.filterStatus.value` — filtro dropdown por status
- `DOM.searchInput.value` — busca textual
- Dropdowns de modalidade, tipo de objeto, UASG
- Faixa de valor mínimo/máximo

O resultado é armazenado em `State.filteredData` e renderizado por `renderTable()`.

### Dependências externas

| Biblioteca | Versão | Uso |
|-----------|--------|-----|
| [SheetJS (XLSX)](https://sheetjs.com/) | 0.18.5 (via CDN) | Parse de planilhas Excel |
| [Inter Font](https://fonts.google.com/specimen/Inter) | via Google Fonts | Tipografia |

> A exportação em PDF não usa biblioteca externa: `export_pdf.js` monta um
> documento HTML e aciona a janela de impressão do navegador (`window.print()`),
> de onde o usuário salva como PDF.

---

*Documentação da Ferramenta de Conformidade — Setor de Integridade.*
