# Segurança: controles e limites

## Implementado

- Argon2id (64 MiB, três iterações, paralelismo 1), concorrência limitada a dois cálculos e fila limitada. Login de conta inexistente também faz verificação criptográfica.
- Senha mínima de 12 caracteres com maiúscula, minúscula e número; sem senha padrão.
- Limites de tentativas persistidos por hash de IP/identidade e bloqueio temporário de 15 minutos em autenticação, reset e preparação.
- Sessões opacas hasheadas no banco, revogáveis, expiração absoluta configurável (máximo 24 horas) e 30 minutos de inatividade.
- Cookie HttpOnly, Secure em produção, SameSite=Lax; origem exata nas mutações e CSRF para operações autenticadas.
- RBAC/escopo no servidor, negação por padrão, isolamento por empresa/unidade e propriedade de vendas. Perfil limitado não concede permissões superiores às próprias nem redefine usuário de escopo superior.
- MFA TOTP para administradores e perfis com users.manage/settings.manage; segredo AES-256-GCM e códigos de recuperação de uso único hasheados.
- Reset de senha com token aleatório hasheado, prazo de 30 minutos, consumo atômico e revogação de sessões. Email só fica disponível quando SMTP é configurado.
- Validação estrita de comandos, whitelist de ordenação, consultas parametrizadas, CORS restrito, headers Helmet, body JSON limitado e erros padronizados sem stack público.
- Auditoria transacional e proteção de histórico por triggers. Preços/comissões/parâmetros/perfis registram antes/depois sem copiar senhas, tokens ou CPF/endereço para logs.
- Dependências auditadas e versões transitivas corrigidas no lockfile. A análise local mais recente deve ser registrada em TESTING.md.

## Primeiro acesso

Não existe conta oculta ou bypass SUPERADMIN. Bootstrap roda uma única vez. Em desenvolvimento sem token, é restrito a loopback; em produção exige BOOTSTRAP_TOKEN e origem autorizada. Remova o token do ambiente depois de criar o administrador. CLI recebe segredo por stdin, sem senha em argumento.

## Segredos e recuperação

.env é ignorado pelo Git, DATABASE_URL só existe no backend e segredos não entram em código/artefatos frontend. A credencial enviada no chat deve ser rotacionada pelo proprietário antes da operação.

Mantenha MFA_ENCRYPTION_KEY estável entre deploys e preserve-a em armazenamento seguro separado do backup de dados. Trocar a chave sem plano de migração torna os segredos TOTP existentes ilegíveis. Backup de banco sozinho não substitui a recuperação da chave.

## O que ainda exige homologação

Não há certificação OWASP/LGPD nem promessa de invulnerabilidade. Revisão ASVS/Top 10, pentest, carga, retenção/eliminação de dados, abuso distribuído, cadeia de proxy Render, segredos em produção, menor privilégio de banco e restauração ainda precisam de validação operacional.

MFA de troca de dispositivo depende de sessão autenticada; fluxo administrativo de perda completa de fatores precisa de política e revisão. Não implementar conta de emergência oculta.

Uploads, comunicações promocionais e integrações externas ainda não estão disponíveis. Quando implementados, exigem validação real de conteúdo, armazenamento persistente, controle de acesso, limites e consentimentos/requisitos aplicáveis.
