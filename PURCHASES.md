# Compras pagas, faltas e ajuste manual

## Nova compra

Para novas compras, informe fornecedor, itens, data do documento e forma de pagamento. Registrar compra e pagamento confirma a saida integral do Caixa da empresa na data/hora do registro. A data do documento e uma referencia, nao retroage o lancamento. O ERP registra o pagamento; nao efetua transferencia bancaria nem cobranca de cartao.

A mesma transacao cria pedido PREPAID, conta financeira liquidada, baixa e movimento imutavel PURCHASE_PAYMENT. A tesouraria soma somente este movimento; nao soma novamente a conta ou a baixa. A operacao exige purchases.manage e finance.manage. Idempotencia impede repeticao por reenvio. Nao exige caixa de atendimento aberto e nao altera seu saldo fisico.

Receber a mercadoria de uma compra PREPAID atualiza somente estoque e conferencia: nao gera outra conta nem repete o pagamento.

## Falta de mercadoria

Em Faltas e tratativas, selecione um item pendente e escolha aguardar entrega, solicitar reembolso ou manter credito com fornecedor. Quantidade e valor sao calculados no servidor a partir da falta atual e do custo. Um item admite uma tratativa aberta por vez; registros anteriores permanecem no historico.

Aguardar entrega encerra automaticamente quando o restante chega. Reembolso ou credito em acompanhamento bloqueiam recebimento do item ate alterar/encerrar a tratativa.

Solicitar reembolso nao movimenta dinheiro. Quando o fornecedor devolver o valor integral da falta registrada, use Confirmar reembolso recebido, informe forma e referencia/comprovante e confirme. A mesma transacao cria conta de entrada liquidada, baixa e movimento positivo PURCHASE_REFUND, encerra a tratativa e a quantidade faltante sem criar estoque. Uma mesma falta so pode ser reembolsada uma vez; o acumulado nao supera o valor pago. Recebido + faltas reembolsadas nunca pode superar o pedido. O pedido fica Encerrada com reembolso quando todos os itens foram recebidos ou tiveram a falta reembolsada.

Exemplo: saldo 1000, compra de duas pecas por 400 -> saldo 600. Receber uma peca mantem 600. Solicitar reembolso mantem 600. Confirmar 200 recebidos -> saldo 800; estoque entra somente uma peca.

Cancelar solicitacao ou Encerrar acompanhamento apenas documenta o acordo: nao representa dinheiro recebido. Credito com fornecedor permanece acompanhamento documental, sem entrada de dinheiro e sem utilizacao automatica em outro pedido. Reembolso parcial em dinheiro da mesma tratativa nao e suportado; a confirmacao usa o valor integral apresentado.

## Compras anteriores

A migracao marca pedidos existentes como LEGACY sem inventar pagamentos nem alterar valores. Esses pedidos mantem o recebimento com conta a pagar proporcional. Pagamentos existentes continuam no Financeiro e na tesouraria conforme os registros anteriores. O novo botao de reembolso financeiro nao se aplica a pedidos LEGACY: estes precisam de conciliacao manual do pagamento existente, evitando duplicidade. Nenhuma saida retroativa foi criada.

## Ajuste manual de estoque

Escolha Entrada ou Saida e informe sempre quantidade positiva. O servidor valida unidades inteiras para UN e impede estoque negativo. Use Compras para receber pedidos, evitando duplicar entradas.

Todos os endpoints respeitam empresa/loja, permissoes, CSRF, idempotencia, trava por compra e auditoria. Migracoes aditivas: 202610170002_purchase_issues e 202610170003_purchase_payment.
