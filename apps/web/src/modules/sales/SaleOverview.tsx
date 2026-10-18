import { RecordActivity } from '../../components/RecordActivity';
import { FileText, CreditCard } from 'lucide-react';
import { Badge } from '../../components/ui';
import { brl, date, text, statusLabels } from '../../utilities/format';
import { quantity, netSale, type SaleRecord } from './ReceiptDocument';
export function SaleOverview({ sale: d }: { sale: SaleRecord }) {
  return (
    <article className="sale-record no-print">
      <header className="sale-record-bar">
        <span>
          <FileText size={15} />
          Registro de venda
        </span>
        <Badge value={d.status} />
      </header>
      <dl className="sale-identification">
        <div>
          <dt>Data e hora</dt>
          <dd>{date(d.createdAt, String(d.timezone ?? 'America/Sao_Paulo'))}</dd>
        </div>
        <div>
          <dt>Vendedora</dt>
          <dd>{text(d.employeeName)}</dd>
        </div>
        <div>
          <dt>Cliente</dt>
          <dd>{text(d.customerName || 'Consumidor não identificado')}</dd>
        </div>
        <div>
          <dt>Loja</dt>
          <dd>{text(d.storeName || d.companyName)}</dd>
        </div>
      </dl>
      <div className="sale-section-title">
        <h2>Itens da venda</h2>
        <span>
          {d.items.length} {d.items.length === 1 ? 'produto' : 'produtos'}
        </span>
      </div>
      <div className="sale-items-scroll">
        <table className="sale-items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Valor unitário</th>
              <th>Desconto</th>
              <th>Total</th>
              <th>Devolvido</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((item, index) => (
              <tr key={item.id}>
                <td className="sale-line-number">{String(index + 1).padStart(2, '0')}</td>
                <td>
                  <strong>{text(item.name)}</strong>
                  <small>SKU {text(item.sku)}</small>
                </td>
                <td>{quantity(item.quantity)}</td>
                <td>{brl(item.unitPrice)}</td>
                <td>{brl(item.discount)}</td>
                <td className="sale-line-total">{brl(item.total)}</td>
                <td>{quantity(item.returnedQuantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sale-settlement">
        <section className="sale-payments">
          <h3>
            <CreditCard size={15} />
            Pagamentos registrados
          </h3>
          {d.payments.map((payment) => (
            <div className="sale-payment" key={payment.id}>
              <span>{statusLabels[String(payment.method)] ?? text(payment.method)}</span>
              <strong>{brl(payment.amount)}</strong>
            </div>
          ))}
        </section>
        <dl className="sale-amounts">
          <div>
            <dt>Subtotal dos produtos</dt>
            <dd>{brl(d.subtotal)}</dd>
          </div>
          <div>
            <dt>Descontos</dt>
            <dd>{brl(d.discount)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>Total da venda</dt>
            <dd>{brl(d.total)}</dd>
          </div>
          {Number(d.returnedTotal) > 0 && (
            <>
              <div>
                <dt>Devoluções</dt>
                <dd>{brl(d.returnedTotal)}</dd>
              </div>
              <div className="sale-net-total">
                <dt>Total líquido</dt>
                <dd>{brl(netSale(d))}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      {!!d.notes && (
        <section className="sale-notes">
          <h3>Observações</h3>
          <p>{text(d.notes)}</p>
        </section>
      )}
      {d.status === 'CANCELLED' && (
        <section className="sale-cancellation">
          <strong>Venda cancelada</strong>
          {!!d.cancelReason && <p>{text(d.cancelReason)}</p>}
        </section>
      )}
      <RecordActivity value={d.activity} />
      <footer className="sale-record-footer">
        <span>Venda nº {text(d.code)}</span>
        <span>Documento não fiscal</span>
      </footer>
    </article>
  );
}
