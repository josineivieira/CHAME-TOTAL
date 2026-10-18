# CHAME TOTAL

ERP comercial com React/TypeScript, NestJS, Prisma e PostgreSQL. Interface desktop compacta em português, moeda BRL e fuso inicial de Brasília (`America/Sao_Paulo`).

## Estado da entrega

O núcleo comercial foi implementado e conectado ao PostgreSQL Render informado pelo proprietário. A migration inicial foi aplicada a um banco confirmado vazio; PostgreSQL 18.6. Os dados sintéticos usados nos testes ficaram em schemas exclusivos, removidos ao término. O schema `public` não recebeu produtos, clientes ou vendas fictícias.

Este repositório ainda **não é uma entrega homologada para produção de todos os requisitos do prompt mestre**. O [mapa de módulos](MODULES.md) identifica as funções implementadas e os recursos avançados pendentes. Não houve publicação de serviço web no Render nem execução da CI no GitHub.

## Executar no Windows

As dependências já foram instaladas neste workspace. Para outra máquina:

```powershell
npm.cmd ci
```

Configure `apps/api/.env` conforme [o exemplo](apps/api/.env.example), sem versionar credenciais. Neste workspace, a conexão fornecida já foi configurada em `.env` ignorado pelo Git.

```powershell
npm.cmd run build
npm.cmd run db:migrate
npm.cmd run dev
```

Abra `http://localhost:5173/setup`. Informe seu nome, email e uma senha forte. Não existe senha padrão. O fluxo cria a empresa, a unidade, os perfis explícitos e o primeiro administrador, depois exige MFA. Guarde os códigos de recuperação. Após existir um usuário, a preparação inicial fica bloqueada.

No desenvolvimento, a preparação sem código é permitida somente por conexão local de loopback. Em produção, exige `BOOTSTRAP_TOKEN`, HTTPS e `MFA_ENCRYPTION_KEY`; remova o token do ambiente após concluir a preparação.

Alternativa ao assistente: execute `scripts/create-admin.ps1` em uma sessão PowerShell com política permitida pelo responsável. Ele lê a senha de forma oculta e envia JSON pela entrada padrão. Não altera a política do sistema.

## Operação inicial

1. Cadastre categorias, colaboradoras, clientes, fornecedores e produtos.
2. Cada SKU pode receber tamanho, cor e modelo; não existe saldo inicial fictício.
3. Registre entrada de estoque por ajuste autorizado ou recebimento de compra.
4. Abra o caixa com o dinheiro contado.
5. Use o PDV para selecionar vendedora, itens, descontos e pagamentos que somem o total.
6. Consulte o comprovante não fiscal, cancelamentos e devoluções em Vendas.
7. Gerencie baixas financeiras, metas mensais, aprovação/pagamento de comissões e relatórios.

Pagamentos são registrados operacionalmente; o sistema não realiza cobrança real nem emissão fiscal.

## Verificações

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run test:e2e --workspace @chame/api
npm.cmd audit
```

Os testes de integração e navegador criam schemas aleatórios `chame_test_*` e removem apenas esses schemas. Use preferencialmente `TEST_DATABASE_URL` em banco separado. Jamais configure uma base de terceiros. A CI utiliza PostgreSQL efêmero.

Veja [TESTING.md](TESTING.md) para evidências e limites. Capturas em [docs/qa](docs/qa) mostram exclusivamente dados de QA.

## Documentação

- [Arquitetura](ARCHITECTURE.md)
- [Banco e migrations](DATABASE.md)
- [Regras comerciais](BUSINESS_RULES.md)
- [API](API.md)
- [Segurança](SECURITY.md)
- [Implantação e restauração](DEPLOYMENT.md)
- [Estado dos módulos](MODULES.md)

A senha de banco fornecida foi exposta no chat: substitua-a no Render antes da operação e atualize somente os ambientes protegidos.

### Foto do perfil

No canto superior direito, clique no nome ou nas iniciais e escolha **Adicionar foto**. Aceita JPG/PNG de até 5 MB; aplica corte central e salva uma imagem de 160 px no PostgreSQL. O menu permite trocar ou remover a foto. O e-mail fica apenas dentro desse menu.

### Caixa da empresa

Novo módulo em Gestão para saldo consolidado, entradas, saídas e extrato. O primeiro saldo deve ser informado pelo responsável. Consulte [TREASURY.md](TREASURY.md) para o primeiro uso e as regras de composição.
