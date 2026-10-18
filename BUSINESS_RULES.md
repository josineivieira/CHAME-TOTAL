# Regras comerciais implementadas

O proprietário definiu Brasília (`America/Sao_Paulo`) e autorizou avançar com o projeto completo. A operação inicial usa uma empresa/loja, estoque negativo proibido e pagamentos apenas registrados. O modelo mantém escopo explícito de empresa/unidade.

## Vendas

Uma venda confirmada preserva SKU, descrição, preço e custo históricos. Produto atual não altera venda anterior. Itens duplicados devem ser agrupados. Produtos UN exigem quantidade inteira em venda, compra, movimentação e devolução. Após existir movimentação, a unidade não é alterada; cadastre outro SKU. Valores são decimais e arredondados em centavos com metade para cima.

O desconto geral é distribuído proporcionalmente após descontos por item, com resíduo em centavos e desempate estável. Todos os pagamentos devem ser positivos e somar o total exato. O dinheiro registrado já deve excluir troco. Desconto requer `sales.discount` e respeita o limite da empresa; não existe bypass oculto de administrador.

A vendedora deve estar ativa. Usuário sem `sales.assign` só registra para a colaboradora vinculada e só acessa as próprias vendas conforme o escopo. Confirmação exige caixa aberto. Venda, itens, pagamentos, estoque, financeiro, comissão, pontos e auditoria são gravados na mesma transação serializável.

Idempotência liga empresa, usuário, operação, chave e hash do payload. Repetição igual devolve resultado anterior; conteúdo diferente resulta em conflito. Chaves não são removidas automaticamente nesta versão.

## Cancelamento e devolução

Cancelamento exige permissão/motivo e caixa aberto, preserva o documento e repõe estoque, financeiro, comissão e pontos por compensação. Uma venda que já tem devoluções não é cancelada: devolva os itens restantes.

Devolução exige itens da venda original e não excede a quantidade disponível. Valores são calculados pela diferença entre parcelas cumulativas arredondadas, fechando o total original sem perda de centavos. Reposição depende da condição escolhida. Sem reposição, o custo perdido continua no lucro bruto estimado. Reembolso é registrado, sem processamento bancário automático.

A devolução não muda o status CONFIRMED do documento original; seu valor líquido pode ser zero. Contagens consideram todos os documentos confirmados, inclusive totalmente devolvidos. Ticket médio divide receita líquida por essa contagem. Relatórios identificam as devoluções separadamente.

## Comissões, metas e pontos

Comissão percentual é congelada na venda e calculada sobre o total líquido. Cancelamentos e devoluções geram lançamentos negativos. Se já paga, a reversão permanece para compensar saldo futuro. Negativos pendentes bloqueiam pagamento até aprovação. Liquidação paga o saldo aprovado integral da vendedora, uma única vez; não escolhe somente créditos e ignora débitos.

Metas mensais consideram vendas confirmadas, líquidas das devoluções vinculadas. Datas obedecem ao fuso da empresa. A referência de período é a data da venda original: devoluções posteriores recalculam o resultado desse período. Os dias usados são dias corridos, não calendário de expediente.

Pontos usam a regra da empresa no momento da venda; reversão usa os pontos históricos, não a regra atual. Resgate manual exige motivo, permissão e saldo suficiente. Campanhas promocionais ainda não foram implementadas.

## Financeiro e caixa

Faturamento não é recebimento, caixa ou lucro. A confirmação registra o recebimento informado; contas manuais/compras permanecem em aberto até baixa. Baixas parciais não excedem a conta. Sangria e outras saídas em dinheiro não excedem o saldo esperado do caixa.

Despesas do dashboard usam vencimento e fontes MANUAL/COMMISSION. Compras não são somadas de novo ao custo vendido; devoluções já afetam a receita. Custo de venda vem do cadastro/snapshot: custo médio automático ainda não existe. Fechamento preserva esperado, contado e diferença; divergência exige justificativa. Caixa fechado não recebe mutações pelo fluxo comum.

## Decisões e validações restantes

Confirmar limites comerciais finais, política de troca/crédito, calendário de metas, comissões especiais, parcelamento/taxas, retenção de dados, LGPD operacional, consentimentos, plano Render, custos, RPO/RTO e responsáveis. Essas decisões impedem declarar o sistema completo e homologado para produção.
