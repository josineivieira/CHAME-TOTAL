# Arquitetura implementada

Monorepo npm workspaces com frontend React/Vite, backend NestJS e contratos Zod compartilhados. PostgreSQL é a fonte de verdade; não existe banco em localStorage nem dados comerciais simulados em arrays.

```text
apps/
  api/
    prisma/schema.prisma
    prisma/migrations/
    src/common/
    src/modules/{auth,bootstrap,catalog,inventory,sales,cash,finance,purchases,commissions,management,reports}/
    test/{unit,integration,e2e}/
    scripts/create-admin.ts
  web/src/
    app/
    layouts/
    routes/
    modules/
    components/
    services/
    utilities/
    design-system/
packages/shared/src/
infrastructure/render/
.github/workflows/
scripts/
docs/qa/
```

## Responsabilidades

Controllers recebem o contexto HTTP e chamam serviços de aplicação. Vendas, caixa, compras, financeiro, comissões, estoque, usuários, metas e fidelização possuem serviços/casos de uso. Consultas simples de configuração, auditoria e notificações usam o adaptador de banco diretamente, sem camadas artificiais.

Os serviços recebem `Actor` e comandos, não objetos Express. Regras financeiras usam Decimal. `Database` encapsula Prisma e a política transacional; o catálogo usa uma interface de delegate restrita à lista de recursos. Helpers compartilhados coordenam estoque, caixa, financeiro, auditoria e idempotência dentro da mesma transação.

O código não pretende implementar todas as camadas de Clean Architecture por formalidade. Novos domínios devem extrair políticas e repositórios quando a complexidade justificar.

## Consistência

Transações SERIALIZABLE com até três repetições para conflito de serialização. Locks consultivos transacionais por recurso; caixa antes de venda/financeiro/comissão e produtos ordenados por UUID antes de movimentar estoque. Decremento condicionado à disponibilidade e constraints impedem negativo.

Idempotência guarda chave, ator, empresa, operação, hash e resposta na mesma transação. Mudança de payload conflita. Cancelamentos/devoluções criam compensações; não apagam documentos.

## Frontend

React Router com rotas protegidas, TanStack Query para servidor, TanStack Table para tabelas e React Hook Form/Zod para formulários. Contexto de sessão mantém somente identidade/permissões. Não foi necessário Zustand. O dashboard carrega separadamente e usa Recharts com resultados reais.

Tokens Tailwind/CSS centralizam rose, branco, dourado e tons neutros. Sidebar compacta, breadcrumbs, formulários por seções, tabelas densas, navegação por teclado e comprovante de impressão. A marca é tipográfica temporária. Fuso é recebido pela sessão e utilizado na exibição; datas civis são formatadas sem converter o dia pelo fuso.

## Evolução e dependências

Acesso -> cadastros -> estoque/caixa -> venda -> financeiro/comissão/pontos -> metas/dashboard/relatórios. Compras dependem de fornecedor/produto e produzem estoque/contas. Auditoria acompanha os casos críticos desde a fundação.

Para adicionar módulo: contratos de entrada, permissão explícita, escopo, serviço, schema/migration revisada, controller, interface real, testes e documentação. Novas permissões precisam ser concedidas explicitamente; SUPERADMIN não possui bypass.
