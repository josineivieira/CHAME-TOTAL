# Validação e evidências

Execuções iniciadas em 14/10/2026 e concluídas em 15/10/2026, Brasília. Ambiente local Windows, Node 24.20.0, PostgreSQL Render 18.6, Prisma 6.19.3 e Chromium Playwright.

## Execuções concluídas

- Build de backend/frontend e geração Prisma concluídos.
- Typecheck strict e ESLint concluídos.
- Cinco testes unitários aprovados: precisão, descontos/resíduos, devoluções proporcionais, CPF e rejeição de contrato inválido.
- Vinte e três testes de integração aprovados no PostgreSQL: sessão/origem/CSRF, caixa único, venda transacional/idempotente, concorrência de última unidade, rollback, snapshots/auditoria, devolução, cancelamento, descontos, compra parcial, baixa parcial, IDOR/exportação, metas/dashboard/Excel/PDF, bootstrap bloqueado, sangria sem saldo, comissão concorrente, reset de uso único, histórico e MFA/revogação.
- Cinco testes E2E aprovados: login/MFA, cadastro+estoque, caixa+PDV+comprovante, navegação/responsividade.
- npm audit retornou zero vulnerabilidades conhecidas após corrigir dependências.

A execução completa final aprovou 23 cenários de integração, incluindo login TOTP, schema efetivo das consultas SQL e lucro histórico. Em seguida, quatro cenários focados também passaram após reforçar unidades inteiras: acesso, caixa, venda e rejeição de frações/alteração de unidade com histórico. São 24 cenários distintos de integração aprovados, além dos cinco unitários e cinco E2E.

## Isolamento

Suites criam schemas aleatórios chame_test_* no PostgreSQL configurado. Aplicam a migration, configuram a função de validação de perfis no schema de teste, e removem exclusivamente esse schema após fechar aplicação/browser. A revisão identificou 17 contadores transitórios de autenticação em public devido ao search_path do SQL direto. O pool foi corrigido para usar o mesmo schema validado do Prisma; os contadores foram removidos com aprovação e guarda que exigia zero usuários/clientes/produtos/vendas. Nenhum cadastro ou movimento comercial foi alterado. Os testes finais verificam current_schema() e os valores calculados por SQL direto. Preferir TEST_DATABASE_URL dedicado; CI usa serviço PostgreSQL efêmero.

Não há arrays de clientes/produtos/vendas de produção simulados. Exemplos QA existem somente nos testes e capturas identificadas.

## Comandos

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd exec -- playwright install chromium
npm.cmd run test:e2e --workspace @chame/api
npm.cmd audit
```

`npm run format` formata fontes/documentação. A workflow .github/workflows/ci.yml declara essas verificações, mas não foi executada no GitHub nesta entrega.

## Limites

Não foram executados deploy Render, pentest, teste de carga com volume representativo, backup/restauração, envio SMTP real, cobrança real ou emissão fiscal. Capturas são QA, não evidência de homologação da loja. O bundle frontend ainda pode ser dividido em mais rotas para reduzir carregamento inicial; o dashboard já é separado.

Produção exige aceite dos critérios pendentes em MODULES.md e DEPLOYMENT.md.

### Revisão visual e perfil (15/10/2026)

Cabeçalhos compartilhados mais compactos, remoção de subtítulos genéricos, seções e espaçamentos padronizados. Foto de perfil persistida por usuário, validada e normalizada no servidor, sem metadados da imagem original. Migração aditiva `202610150001_user_photo`; os schemas de teste também aplicam essa migração.

Validação desta revisão: 25 testes de integração e 6 E2E aprovados. O teste de foto cobre imagem inválida, CSRF, normalização, persistência e remoção; no navegador cobre envio, recarregamento e remoção. Captura `docs/qa/cadastro-desktop.png` usa exclusivamente o usuário de QA.

### Fichas desktop e confirmacoes internas (17/10/2026)

Fichas compartilhadas por clientes, colaboradoras, produtos, fornecedores e categorias, com status, secoes, referencias por nome e atributos em campos separados. Dialogos do sistema substituem confirm/prompt internos do navegador; fechamento da aba continua protegido pelo mecanismo do navegador. O teste E2E valida categoria por nome, caracteristicas sem JSON, percentual, foco inicial seguro, Escape preservando rascunho e descarte confirmado, sem dialogos nativos. Capturas de QA: ficha-produto-desktop.png, ficha-colaboradora-desktop.png e confirmacao-desktop.png.

### Consulta de venda e comprovante (17/10/2026)

Ficha desktop com identificacao, itens, pagamentos e totais. Previa do comprovante A4/80 mm com identidade comercial retornada pelo endpoint autorizado da venda. PDFs de QA gerados por Chromium: A4 MediaBox 594,96 x 841,92 pt; bobina MediaBox 227,04 x 841,92 pt (80 mm, pagina de 297 mm). Teste verifica total de R$ 10,00, alternancia de formato e ocultacao da ficha na impressao. Dados comerciais nao foram alterados. Impressora fisica nao foi usada nesta validacao.

### Caixa da empresa (17/10/2026)

Nova tesouraria consolidada, independente dos saldos físicos do caixa operacional. Quatro testes de integração aprovados no PostgreSQL: permissão específica e ausência de saldo presumido; duas lojas, outra empresa e referências financeiras sem duplicidade; saldo inicial, idempotência e estorno preservando o original; filtros, datas, imutabilidade e preservação dos movimentos/contas anteriores. A migração adiciona tabelas e permissões próprias, sem criar saldo real.

Regras de uso em TREASURY.md. A tela mantém os filtros disponíveis durante consultas e erros de período. Captura de QA: docs/qa/caixa-empresa-desktop.png.
Validacao no navegador: sete cenarios operacionais aprovados, incluindo saldo inicial, entrada e estorno da tesouraria. O processo da suite aguardou encerramento depois dos cenarios; o teste de primeiro acesso foi executado separadamente e aprovado.

### Ajuste manual e faltas em compras (17/10/2026)

Testes direcionados de integracao: saida de estoque e recusa de saldo negativo; faltas com entrega, reembolso e credito, idempotencia, bloqueio de duplicidade, encerramento automatico da espera e preservacao financeira. QA no navegador com API simulada confirma entrada +2, saida -2, registro e encerramento de tratativa, bloqueio de recebimento e visual desktop/mobile. Capturas em docs/qa/compra-falta-desktop.png, compra-falta-mobile.png, ajuste-entrada-desktop.png e ajuste-saida-desktop.png. Regras e limites em PURCHASES.md.

### Compra paga e reembolso recebido (17/10/2026)

Quatro cenarios direcionados de compras aprovados: recebimento parcial, acompanhamento de faltas, pagamento integral com reembolso idempotente e preservacao de LEGACY. Os quatro testes de integracao da tesouraria tambem passaram com a nova migracao. Novo E2E purchase-payment.test.ts aprovado: saldo 1000 -> 600 na compra de 400 -> 600 na entrega parcial e solicitacao -> 800 no reembolso confirmado de 200; uma unidade no estoque, duas contas liquidadas e nenhum movimento no caixa operacional. Confirmacao repetida e reembolso fora da loja/permissao foram recusados na API.

Build, tipos, lint e verificacao de repositorio aprovados. Migracao 202610170003_purchase_payment aplicada, sem lancamentos financeiros retroativos. Verificacao final: nenhum schema temporario restante. Capturas reais de QA: compra-paga-desktop.png, compra-reembolsada-desktop.png e compra-reembolsada-mobile.png; compra-reembolso-confirmacao.png usa dados simulados para validar centralizacao desktop/mobile sem enviar movimentos.

### Processamento central e autoria (17/10/2026)

Indicador modal central para gravacoes, exportacoes e carregamento inicial via Loading compartilhado; consultas em segundo plano nao bloqueiam a tela. Contagem de requisicoes simultaneas, encerramento em finally, atraso de 150 ms para evitar piscadas e respeito a movimento reduzido. QA simulado no navegador aprovou sucesso, erro, Escape bloqueado durante requisicao, centralizacao, concorrencia e busca sem bloqueio.

Autoria de consulta e edicao nos cadastros, vendas, compras, financeiro, caixa aberto e configuracoes. Metadados projetam somente nome e instante da auditoria, respeitando a autorizacao do proprio registro; nao liberam audit.read. Teste de integracao com dois usuarios aprovado: criador preservado, ultimo editor correto, ausencia de autoria tratada sem inventar usuario e isolamento de outra empresa. Migracao 202610170004_record_activity adiciona somente indice de leitura.

E2E de compra/reembolso valida indicador durante gravacao, autoria de criacao e ultima movimentacao, alem dos saldos anteriores. Captura processando-operacao-desktop.png e fichas de compra usam dados exclusivos de QA.

## Pessoal e resultado empresarial

Validação de 17/10/2026: três cenários novos em operations.test.ts conferem baixa financeira e comissão sem caixa aberto, adiantamento e salário com compensação e pagamentos parciais, permissões, idempotência, imutabilidade, CMV, devolução e cancelamento por competência. Os quatro testes de treasury.test.ts continuam aprovados.

personnel-results.test.ts executa pelo navegador o cadastro e pagamento de adiantamento de 200 e salário de 1000, compensando 200 e pagando somente 800 adicionais, sem sessão de caixa ou CashMovement. Confere a apresentação do resultado e captura telas desktop e mobile em docs/qa. Todos esses dados são criados em schema chame_test aleatório removido ao terminar; não são pagamentos reais da empresa.
