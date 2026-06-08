
---

# Correções de FLUXO DO ANALISTA (ciclo operacional)

Segunda rodada, focada em como o analista conduz e finaliza um registro.
Todas validadas por `node --check` e pelas suítes em `public/Testes/`
(38 + 21 + 8 ciclo-estado + 3 finalização individual, 100% verdes).
O back-end SQL já suportava as transições necessárias — nenhuma mudança de schema.

## (d) — Descompasso de estado VALIDADO ao refazer questionário
**Arquivos:** `public/js/handlers.js`

Apagar o questionário de um registro VALIDADO não revertia o ciclo: o front
ficava sem questionário enquanto o back-end seguia marcando VALIDADO.

**Fix:** novo helper central `_sincronizarCiclo(row)` que deriva o estado-alvo do
ciclo a partir do estado real da análise, de forma idempotente e respeitando as
transições legais do schema (de VALIDADO só recua para EM_ANALISE; ao sair de
escopo encadeia até PENDENTE). Usado ao salvar, ao interromper e ao refazer.

## (a) — "Em análise" disparado por mera consulta
**Arquivos:** `public/js/ui.js`

Abrir o modal só para olhar já movia o registro para EM_ANALISE.

**Fix:** a transição agora ocorre na primeira interação real com o questionário
(listener `change` único e auto-removível no bloco da avaliação obrigatória).

## (c) — Estágio do ciclo invisível na fila
**Arquivos:** `public/js/ui.js`, `public/css/styles.css`

A tabela mostrava só o status de conformidade, não em que ponto do ciclo
(PENDENTE/EM_ANALISE/VALIDADO) cada registro estava.

**Fix:** badge de estágio na linha ("A analisar" / "Em análise" / "Validado"),
visível apenas com ciclo ativo, atualizado após cada transição.

## (b) — Não havia finalização individual
**Arquivos:** `public/js/ui.js`, `public/js/ciclos.js`, `public/js/app.js`,
`public/css/styles.css`

Só era possível finalizar todos os validados de uma vez (relatório em lote).

**Fix:** botão "Finalizar este registro" no resumo de um questionário validado.
Reaproveita o MESMO caminho `gerarRelatorio([uid], pdf)` do lote (mesma
numeração, PDF e imutabilidade), passando um único uid — sem fluxo paralelo.

## Testes adicionados
- `public/Testes/test_ciclo_estado.js` — 8 casos da derivação de estado do ciclo.
- `public/Testes/test_finalizar_registro.js` — 3 casos do caminho de finalização individual.
