# API REST v1

Prefixo: `/api/v1`. Swagger em `/api/v1/docs`; JSON/YAML também protegidos. Exige sessão, users.manage e MFA quando requerido. Contratos de escrita centrais derivam dos schemas Zod usados na validação. Alguns endpoints auxiliares ainda não têm descrição detalhada de corpo/resposta no Swagger.

## Endpoints implementados

| Domínio                                           | Operações                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| bootstrap                                         | GET /bootstrap/status; POST /bootstrap (somente preparação inicial autorizada)                                              |
| auth                                              | POST login/logout/forgot-password/reset-password; GET me/options/sessions; POST mfa/setup, mfa/enable e sessions/:id/revoke |
| customers/employees/products/suppliers/categories | GET lista e :id; POST criação; PUT :id edição completa                                                                      |
| customers                                         | GET :id/history                                                                                                             |
| inventory                                         | GET saldos e movements; POST adjust                                                                                         |
| cash-registers                                    | GET histórico/current; POST open/movements/close                                                                            |
| sales                                             | GET lista/:id/quotations; POST confirmação, :id/cancel, :id/returns, quotations e quotations/:id/convert                    |
| purchases                                         | GET lista/:id; POST pedido e :id/receive                                                                                    |
| finance                                           | GET lista/:id; POST lançamento e :id/settle                                                                                 |
| commissions                                       | GET lançamentos; POST approve/settle                                                                                        |
| sales-goals                                       | GET por período; POST definição mensal                                                                                      |
| settings                                          | GET e PUT                                                                                                                   |
| users                                             | GET lista/roles; POST usuário/roles; PUT :id; POST :id/revoke-sessions                                                      |
| audit-logs                                        | GET paginado                                                                                                                |
| notifications                                     | GET; POST :id/read                                                                                                          |
| loyalty                                           | GET saldos/:id/history; POST adjust                                                                                         |
| dashboard/reports                                 | GET com período; relatórios JSON/Excel/PDF                                                                                  |
| health                                            | GET live/ready (públicos, sem detalhes internos)                                                                            |

## Convenções

Cookie opaco ct_session, HttpOnly, Secure em produção e SameSite=Lax. Mutações autenticadas exigem X-CSRF-Token recebido em auth/me. Todas as mutações exigem Origin igual ao APP_ORIGIN normalizado. Logout descarta a sessão mesmo se ela já expirou, protegido pela origem.

Operações críticas exigem Idempotency-Key de 16 a 100 caracteres alfanuméricos, hífen ou underscore. Pode usar UUID. Repetição igual recupera a resposta; chave reaproveitada com outro corpo retorna 409.

Listas principais: page >= 1, pageSize 1..100, q e ordenação por campos permitidos do recurso. Envelope `{data,pagination:{page,pageSize,total}}`. Consultas auxiliares podem retornar arrays limitados; consultar o módulo antes de integrar grandes volumes.

Valores monetários/quantidades são strings decimais com ponto. Instantes ISO UTC e datas civis YYYY-MM-DD. Não enviar preço da venda: o servidor usa catálogo e congela snapshots. Não enviar companyId/storeId como autoridade; o escopo vem da sessão.

## Erros

`{code,message,fieldErrors?,requestId}`. Validação 400, sessão 401, permissão/CSRF/origem 403, inexistente/fora do escopo 404, conflito/idempotência/estoque 409, abuso/ocupação 429. Produção não expõe stack. Falhas de infraestrutura usam mensagem genérica.

## Exportações

Exigem reports.read, reports.export e leitura do domínio. Até 10 mil linhas em Excel/JSON e 500 no PDF; reduza o período se exceder. Células textuais não executam fórmulas. Exportações são auditadas e evitam CPF/contatos completos no relatório de clientes.

Não existem endpoints de cobrança bancária, adquirência ou emissão fiscal.
