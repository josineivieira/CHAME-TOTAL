# Caixa da empresa

Acesso: Gestão → Caixa da empresa (`/treasury`). É um controle contínuo do saldo registrado da empresa, separado da abertura e do fechamento do caixa de atendimento.

## Primeiro uso

Informe o saldo total que a empresa tinha **no início da data escolhida**, antes dos movimentos daquele dia. Nenhum saldo é presumido. Antes dessa configuração, o histórico aparece, mas o saldo permanece não informado.

O saldo inicial é preservado. Correções posteriores são feitas por lançamentos de ajuste com motivo, sem reescrever o histórico. A data usa o fuso configurado da empresa, atualmente Brasília.

## Composição do saldo

Saldo registrado = saldo inicial + entradas − saídas posteriores à referência. Inclui todas as lojas da empresa autorizada.

- Vendas recebidas, devoluções/cancelamentos, baixas financeiras e comissões pagas são lidas do registro original de movimentos, uma única vez.
- Contas em aberto e compras ainda não pagas não entram no saldo.
- Fundo de abertura, suprimentos e sangrias do caixa de atendimento são movimentos internos: não geram receita/despesa da empresa.
- Valores anteriores à data de referência continuam no extrato, mas não entram no saldo atual.
- Dinheiro, Pix, cartões e banco são formas registradas no ERP. Não há conexão nem conciliação automática com banco ou adquirente; recebimentos de cartão seguem o registro atual do sistema.

Use Novo lançamento somente para entradas e saídas ainda não registradas nos outros módulos, como aporte ou retirada do proprietário. Diferenças físicas do caixa de atendimento não ajustam automaticamente o caixa empresarial: uma correção deve ser registrada com motivo.

## Extrato e segurança

Filtros por período, forma, origem e descrição; paginação e saldo acumulado em cada linha. Filtrar não recalcula o saldo da empresa apenas pelas linhas visíveis. Totais de entradas/saídas e resumo por forma acompanham o extrato filtrado; não são lucro nem saldos bancários por conta.

Lançamentos próprios podem ser estornados uma única vez. O original permanece e o estorno registra uma compensação de sinal contrário, com motivo. Entradas automáticas são corrigidas no módulo de origem.

Permissões próprias: `treasury.read` e `treasury.manage`. A migração libera o módulo somente aos perfis existentes que já têm administração de usuários, configurações e financeiro. Demais perfis precisam receber autorização explícita para consultar o consolidado de toda a empresa.

A migração `202610170001_company_treasury` cria tabelas independentes e um índice de leitura. Não cria saldo inicial e não altera valores, baixas, vendas nem caixas existentes.

## Compras pagas e reembolsos

Novas compras PREPAID criam movimento negativo PURCHASE_PAYMENT na confirmacao de compra e pagamento. O recebimento de mercadoria nao repete a saida. A solicitacao de reembolso nao soma dinheiro; somente Confirmar reembolso recebido cria movimento positivo PURCHASE_REFUND. Contas e baixas correspondentes ficam liquidadas, sem serem somadas novamente no extrato. Compras LEGACY nao recebem cobranca retroativa. Regras, permissoes e limites em PURCHASES.md.

## Pagamentos de colaboradores e resultado gerencial

Em Gestão, Pagamentos de colaboradores registra salário, adiantamento, benefício, reembolso e outros. O lançamento tem competência, vencimento, valor e pagamentos parciais. Criar a obrigação não movimenta dinheiro; registrar seu pagamento gera uma saída única no Caixa da empresa. Não efetua transferência bancária nem calcula folha legal, encargos ou tributos automaticamente. Comissões permanecem no módulo próprio.

Adiantamento pago fica disponível para compensar um salário da mesma pessoa, empresa e loja. A compensação reduz o saldo a pagar sem nova saída de dinheiro. Alocações são imutáveis e protegidas contra reutilização concorrente. Só obrigações sem pagamento ou compensação podem ser canceladas, com justificativa.

A interface de baixas financeiras, comissões e pessoal usa as rotas company-payments e não exige caixa de loja aberto. Rotas antigas continuam disponíveis para compatibilidade; seus movimentos históricos continuam no extrato sem duplicidade. As operações de venda da loja mantêm suas regras de caixa.

Caixa da empresa > Resultado apresenta o resultado gerencial mensal separado do fluxo de dinheiro. Receita de vendas e descontos seguem a data da venda; devoluções e cancelamentos ajustam o mês do evento. CMV usa o custo unitário registrado no item na venda e estorna apenas estoque reposto. Compras pagas aparecem no fluxo de caixa; seu valor não é novamente abatido do lucro que já desconta CMV.

Pessoal, exceto adiantamentos, entra na competência informada; comissões entram quando geradas e compensadas. Outros lançamentos manuais operacionais seguem o vencimento. A classificação permite excluir estoque, capital e financiamentos do resultado. Movimentos avulsos do extrato não substituem o registro de receitas/despesas. Encargos, impostos e demais despesas precisam ser registrados para que o resultado líquido gerencial reflita esses custos. Não é uma demonstração contábil fiscal.

Permissões payroll.read e payroll.manage protegem o pessoal; pagamento exige também finance.manage. A migração concede pessoal aos perfis existentes com leitura e gestão financeira. Nenhum valor financeiro anterior é recalculado pela migração.
