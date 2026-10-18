# PostgreSQL e Prisma

Banco Render conectado e migration inicial aplicada. Versão consultada: PostgreSQL 18.6. O cliente Prisma/adapter-pg/CLI está fixado em 6.19.3 no lockfile. A versão foi escolhida após auditoria e verificada com o banco real; não foi adotado release candidate. [Versões PostgreSQL suportadas no Prisma v6](https://www.prisma.io/docs/orm/v6/reference/supported-databases).

O modelo executável é [schema.prisma](apps/api/prisma/schema.prisma). A migration é [migration.sql](apps/api/prisma/migrations/202610140001_initial/migration.sql), incluindo SQL adicional para constraints, índices parciais e triggers.

## Organização

| Área             | Tabelas principais                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Organização      | Company, Store, Setting                                                                                      |
| Acesso           | User, Role, Permission, UserRole, RolePermission, Session, PasswordResetToken, MfaRecoveryCode, LoginAttempt |
| Cadastros        | Customer, Employee, Category, Supplier, Product                                                              |
| Estoque          | StockBalance, StockMovement                                                                                  |
| Comercial        | Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem, Quotation, SalesGoal                                |
| Caixa/financeiro | CashSession, CashMovement, FinancialEntry, FinancialSettlement                                               |
| Comissões        | CommissionEntry, CommissionSettlement                                                                        |
| Compras          | PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem                                             |
| Operação         | AuditLog, IdempotencyRecord, Notification, LoyaltyTransaction                                                |

## Integridade

UUIDs estáveis e códigos gerados por sequências PostgreSQL. Entidades operacionais carregam empresa/unidade e autoria conforme o domínio. FKs compostas impedem referências entre empresas. UserRole também valida a empresa da função vinculada. Referências históricas usam RESTRICT e NO ACTION; não existe cascade de exclusão de vendas.

Preços/valores usam NUMERIC(19,2), custos unitários NUMERIC(19,6), quantidades NUMERIC(18,3) e percentuais NUMERIC(9,4). O cálculo usa Decimal; o transporte JSON usa strings. CPF/barcode vazios tornam-se NULL, permitindo ausência sem duplicidade artificial.

Checks: estoque/reserva não negativos, quantidades positivas, devolução/recebimento dentro do original, pagamentos positivos, limites financeiros e estados. Índice parcial permite um caixa aberto por loja e uma meta por período/escopo. Índices cobrem escopo, status, período e identificadores comerciais.

AuditLog, StockMovement, CashMovement e SalePayment possuem proteção append-only. SaleItem preserva snapshot e só permite atualizar a quantidade devolvida. Outros registros históricos não têm endpoints de exclusão; privilégios de banco devem ser reduzidos antes da produção.

## Datas e política financeira

Instantes usam timestamptz; aniversário, admissão e vencimento usam date. Os instantes são mostrados no fuso configurado. Datas civis mantêm o dia original.

Arredondamento metade para cima por item e compensação cumulativa em devoluções. A política de custo atual é o custo cadastrado/snapshot; custo médio automático e estrutura completa de locais/variantes continuam pendentes.

## Migrations e testes

`npm run db:migrate` executa Prisma Migrate deploy. Não usar db push como implantação. Não editar SQL de migration já aplicada; criar nova migration e revisar seu diff. Alterações destrutivas precisam de análise, aprovação e restauração ensaiada.

Testes criam schemas `chame_test_*` aleatórios, aplicam a mesma DDL e removem somente esses schemas após encerrar a aplicação. A preferência operacional é um TEST_DATABASE_URL separado; CI usa PostgreSQL efêmero. Nenhum fixture deve ser inserido em public.

## Operação pendente

Definir retenção, separar credenciais de runtime/migration quando permitido pelo plano, validar backups e ensaiar restauração. Não houve restauração de backup nesta entrega.
