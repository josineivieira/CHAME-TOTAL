# Implantação e recuperação

## Estado real

PostgreSQL Render 18.6 conectado; migration inicial aplicada em public após verificar banco vazio. Backend/frontend ainda não foram publicados no Render. Nenhum plano/backup foi confirmado por API de conta. GitHub remoto e execução da CI dependem das conexões do proprietário.

## Pacote pronto para revisão

[render.yaml](render.yaml) contém um único serviço Node servindo API e frontend na mesma origem, na região Oregon do banco informado. Build: npm ci --include=dev && npm run build; start: npm run start --workspace @chame/api; health: /api/v1/health/ready; migration em preDeployCommand. O plano starter é proposta sujeita à aprovação de custo/capacidade; não foi contratado pelo agente. Deploy automático só após checks da branch passarem. [Referência oficial de Blueprint](https://render.com/docs/blueprint-spec).

Node está fixado em 24.20.0, a versão validada localmente. [Configuração de versão Node no Render](https://render.com/docs/node-version). Não depender do default de plataforma.

## Configuração de ambiente

Configure pelo painel ou conexão autorizada, nunca por Git/chat:

- DATABASE_URL: conexão PostgreSQL apropriada ao ambiente, com TLS verificado conforme o provedor; não colocar no frontend.
- DATABASE_SCHEMA: public em produção; schemas aleatórios apenas em testes.
- NODE_ENV: production.
- APP_ORIGIN: URL HTTPS real retornada pelo serviço/dominio, sem inventar domínio.
- MFA_ENCRYPTION_KEY: os mesmos 32 bytes hexadecimais usados para os usuários existentes. Se o administrador foi criado localmente, preserve essa chave ao publicar o mesmo banco.
- BOOTSTRAP_TOKEN: segredo de preparação inicial; remover após cadastro.
- SESSION_HOURS: 1..24, padrão 8.
- SMTP_HOST/PORT/USER/PASSWORD/FROM: provedor autorizado para reset por email, quando disponível.
- PORT: fornecida pela plataforma.

.env.example contém apenas variáveis consumidas pelo código. DIRECT_URL não é usado. Se houver credencial própria de migration, forneça-a ao job de migration sem dar DDL ao runtime.

## Publicação

Conectar GitHub e Render, criar/vincular repositório privado, aprovar plano/região, aplicar Blueprint e configurar segredos. Usar homologação com banco próprio antes de produção. Conferir ready, login, MFA, permissões e fluxo completo de venda. Registrar URL/deploy retornados; não afirmar publicação sem resultado do provedor.

Antes de produção: rotacionar a senha exposta, criar administrador real, confirmar MFA/SMTP, domínio/HTTPS, privilégio de banco, monitoramento, backups e restauração.

## Backup

O plano contratado determina PITR, exportações e retenção; ainda não foi informado. [Recuperação e backups Render](https://render.com/docs/postgresql-backups). Não prometer retenção com base no nome do banco ou apenas na conexão SQL.

Planejar exportação pg_dump em formato custom, cliente PostgreSQL 18 compatível, backup criptografado fora do serviço e retenção aprovada. Credenciais ficam em ambiente protegido/arquivo de senha com acesso restrito, nunca no argumento ou histórico. Não foram instalados pg_dump/pg_restore nem executado backup nesta entrega.

## Ensaio de restauração

Restaurar exportação em PostgreSQL isolado compatível. Confirmar contagens, constraints, usuários/permissões, chave MFA, reconciliação de movimentos/saldos, vendas/devoluções, pagamentos e comissão. Executar fluxo autorizado e medir tempo/ponto recuperado contra RPO/RTO. Não restaurar por cima de produção durante o ensaio.

## Falha de deploy

Interromper rollout, preservar logs sem segredos, inspecionar readiness/migrations. Reverter aplicação somente se compatível com schema atual; preferir correção aditiva. Não editar migration aplicada nem automatizar rollback destrutivo. Recuperação que perca dados exige análise e autorização específica.
