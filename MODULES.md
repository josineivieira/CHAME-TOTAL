# Estado dos módulos

A implementação é um núcleo operacional integrado. Não declarar o escopo completo do prompt mestre concluído: os itens avançados abaixo ainda não possuem implementação e homologação.

| Domínio                  | Implementado                                                                                                                                            | Ainda pendente                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Acesso                   | Argon2id, sessão revogável, expiração, CSRF/origem, RBAC, MFA TOTP, recuperação por token, bootstrap sem senha padrão                                   | SMTP real, revisão de recuperação administrativa e ensaios operacionais                                  |
| Dashboard                | Período, faturamento líquido, quantidade, ticket, lucro bruto, despesas, resultado, ranking, evolução, mais vendidos, estoque crítico e contas vencidas | Comparativo mensal, todos os filtros gerenciais e indicadores de baixa movimentação                      |
| Clientes                 | Cadastro, CPF opcional validado, CPF único por empresa, endereço, situação, consulta e histórico autorizado com totais                                  | Preferências, segmentação, aniversariantes e duplicidade configurável                                    |
| Colaboradoras            | Cadastro, cargo, admissão, comissão percentual, situação e vínculo com usuário                                                                          | Histórico de metas detalhado e indicadores individuais em tela própria                                   |
| Produtos                 | SKU/barcode únicos, descrição, categoria, marca textual, fornecedor, custos, preços, mínimo e atributos de variante                                     | Família de variantes, imagens, marca como cadastro e importação por planilha                             |
| Estoque                  | Saldo persistente, entradas/saídas, ajustes autorizados, histórico, devoluções e bloqueio de saldo negativo                                             | Inventário físico, reservas operacionais, locais, transferências e custo médio automático                |
| PDV e vendas             | Busca, quantidades, descontos, pagamento misto, confirmação ACID, idempotência, histórico, comprovante não fiscal                                       | Troco apresentado em tela, parametrização de formas e políticas mais detalhadas                          |
| Cancelamentos/devoluções | Cancelamento sem apagar, devolução parcial/total, reentrada opcional, reembolso registrado e compensação financeira/comercial                           | Crédito formal para troca, fluxo separado de solicitação/aprovação e troca vinculada                     |
| Orçamentos               | Registro pendente e conversão autorizada em venda                                                                                                       | Validade, reserva de estoque e impressão própria                                                         |
| Metas                    | Meta mensal da loja/vendedora, líquido vendido, percentual, saldo e média diária                                                                        | Metas diárias/semanais, projeção e alertas de desempenho                                                 |
| Comissões                | Percentual por colaboradora, reversão proporcional, aprovação, pagamento único e compensação após pagamento                                             | Regras fixas/por produto/categoria/meta, ajustes e relatórios especializados                             |
| Financeiro               | Contas a pagar/receber, categorias/centros textuais, vencimentos, baixas parciais e efeitos de vendas/compras                                           | Cadastros estruturados, parcelas, conciliação, contas bancárias, fechamento mensal e fluxo especializado |
| Caixa                    | Abertura, dinheiro inicial, sangria, suprimento, recebimentos, fechamento, diferenças e justificativa                                                   | Ajustes autorizados após fechamento e múltiplos caixas por unidade                                       |
| Compras                  | Fornecedores, pedidos, recebimento parcial/total, estoque e contas a pagar vinculadas                                                                   | Aprovação separada, cancelamento de pedido e custo médio                                                 |
| Relatórios               | Vendas, estoque, financeiro, comissões, compras, clientes e devoluções; Excel/PDF com permissões                                                        | Curva ABC, inventário e demais relatórios especializados                                                 |
| Fidelização              | Pontos por venda, reversões, histórico e ajuste/resgate manual autorizado                                                                               | Cupons, campanhas, VIP, aniversários, benefícios e consentimentos promocionais                           |
| Notificações             | Central interna, avisos de estoque, leitura e histórico limitado                                                                                        | Preferências e geração dos demais eventos                                                                |
| Administração            | Empresa, fuso, limite de desconto, pontos, usuários, perfis novos, sessões e trilha de auditoria                                                        | Edição granular de perfis existentes, unidades, identidade/uploads, integrações e demais parâmetros      |
| Infraestrutura           | Migration aplicada, build local, CI declarada, Blueprint e documentação                                                                                 | GitHub remoto, publicação Render, plano validado, backup/restore ensaiado, treinamento e aceite          |

## Próximas etapas de aceitação

1. Criar o administrador real pelo assistente; nenhum usuário real foi inventado pelo agente.
2. Conectar GitHub/Render, confirmar custo/plano e publicar homologação a partir do pacote preparado.
3. Priorizar e implementar os itens avançados pendentes com critérios próprios.
4. Configurar SMTP, armazenamento persistente de uploads, retenção e responsáveis.
5. Ensaiar backup/restauração, revisar segurança e desempenho e homologar a operação com a loja.

Testes e documentação acompanham o desenvolvimento. A última etapa não deve ser o primeiro contato com validação.

## Caixa da empresa

Adicionado: saldo inicial informado pelo responsável, saldo consolidado de todas as lojas da empresa autorizada, extrato paginado com filtros e saldo acumulado, resumo por forma e lançamentos/estornos próprios auditados. Integra os movimentos já registrados sem regravar as operações anteriores. Contas bancárias individualizadas e conciliação externa continuam fora deste módulo. Regras em [TREASURY.md](TREASURY.md).

## Pagamento de compras e reembolso por falta

Novas compras registram pagamento integral e saida unica da empresa; recebimento posterior somente confere estoque. Confirmacao de reembolso recebido encerra a falta e devolve o valor ao saldo, com conta/baixa liquidadas e movimento imutavel. Compras anteriores preservadas sem presumir pagamento. Credito com fornecedor segue em acompanhamento, sem uso automatico; conciliacao de pagamentos legados e reembolso parcial da mesma tratativa nao foram automatizados. Consulte PURCHASES.md.

## Processamento e autoria

Indicador de processamento central compartilhado nas gravacoes, exportacoes e carregamento inicial de paginas. Fichas cadastrais (consulta e edicao), vendas, compras, financeiro, caixa aberto e configuracoes mostram autoria disponivel na auditoria: criador e ultima alteracao com usuario e horario. O resumo respeita acesso ao registro, sem conceder acesso a auditoria completa; historico ausente permanece explicitamente desconhecido.
