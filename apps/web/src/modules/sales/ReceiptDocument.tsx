import { useEffect, useRef } from 'react';
import { Printer, X, FileText } from 'lucide-react';
import { Decimal } from '@chame/shared';
import type { Row } from '../../services/api';
import { brl, date, text, statusLabels } from '../../utilities/format';
export type SaleRecord = Row & {
  items: Row[];
  payments: Row[];
  returns: Row[];
  merchant?: {
    companyName?: string;
    legalName?: string;
    document?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
};
export const quantity = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value ?? 0));
export const netSale = (sale: SaleRecord) =>
  sale.status === 'CANCELLED'
    ? '0'
    : new Decimal(String(sale.total)).minus(String(sale.returnedTotal ?? 0)).toString();
export function ReceiptDocument({ sale, format }: { sale: SaleRecord; format: 'a4' | 'thermal' }) {
  const merchant = sale.merchant;
  return (
    <article className={'receipt-document receipt-' + format}>
      <header className="document-header">
        <img src="/brand/charme-total-transparent.webp" alt="Charme Total" />
        <div>
          <h1>{merchant?.companyName || text(sale.companyName)}</h1>
          {merchant?.legalName && <p>{merchant.legalName}</p>}
          {merchant?.document && <p>CNPJ: {merchant.document}</p>}
          {merchant?.address && <p>{merchant.address}</p>}
          {(merchant?.phone || merchant?.email) && (
            <p>{[merchant.phone, merchant.email].filter(Boolean).join(' | ')}</p>
          )}
          {!!sale.storeName && <p>{text(sale.storeName)}</p>}
        </div>
      </header>
      <div className="document-title">
        <div>
          <h2>Comprovante de venda</h2>
          <span>DOCUMENTO NÃO FISCAL</span>
        </div>
        <strong>Nº {text(sale.code)}</strong>
      </div>
      <dl className="document-parties">
        <div>
          <dt>Emissão</dt>
          <dd>{date(sale.createdAt, String(sale.timezone ?? 'America/Sao_Paulo'))}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{statusLabels[String(sale.status)] ?? text(sale.status)}</dd>
        </div>
        <div>
          <dt>Cliente</dt>
          <dd>{text(sale.customerName || 'Consumidor não identificado')}</dd>
        </div>
        <div>
          <dt>Vendedora</dt>
          <dd>{text(sale.employeeName)}</dd>
        </div>
      </dl>
      <table className="document-items">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd.</th>
            <th>Unitário</th>
            <th>Desc.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{text(item.name)}</strong>
                <small>SKU {text(item.sku)}</small>
                {Number(item.discount) > 0 && (
                  <small className="document-item-discount">Desc. {brl(item.discount)}</small>
                )}
              </td>
              <td>{quantity(item.quantity)}</td>
              <td>{brl(item.unitPrice)}</td>
              <td>{brl(item.discount)}</td>
              <td>{brl(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="document-settlement">
        <section>
          <h3>Pagamento</h3>
          {sale.payments.map((payment) => (
            <div className="document-payment" key={payment.id}>
              <span>{statusLabels[String(payment.method)] ?? text(payment.method)}</span>
              <strong>{brl(payment.amount)}</strong>
            </div>
          ))}
        </section>
        <dl className="document-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{brl(sale.subtotal)}</dd>
          </div>
          <div>
            <dt>Descontos</dt>
            <dd>{brl(sale.discount)}</dd>
          </div>
          <div className="document-grand-total">
            <dt>Total da venda</dt>
            <dd>{brl(sale.total)}</dd>
          </div>
          {Number(sale.returnedTotal) > 0 && (
            <>
              <div>
                <dt>Devoluções</dt>
                <dd>{brl(sale.returnedTotal)}</dd>
              </div>
              <div>
                <dt>Total líquido</dt>
                <dd>{brl(netSale(sale))}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      {!!sale.notes && (
        <section className="document-notes">
          <h3>Observações</h3>
          <p>{text(sale.notes)}</p>
        </section>
      )}
      {sale.status === 'CANCELLED' && (
        <div className="document-cancelled">
          <strong>VENDA CANCELADA</strong>
          {!!sale.cancelReason && <p>{text(sale.cancelReason)}</p>}
        </div>
      )}
      {sale.returns.length > 0 && (
        <section className="document-returns">
          <h3>Devoluções registradas</h3>
          {sale.returns.map((item) => (
            <p key={item.id}>
              {date(item.createdAt)} ? {brl(item.total)} ? {text(item.reason)}
            </p>
          ))}
        </section>
      )}
      <footer className="document-footer">
        <span>Venda nº {text(sale.code)}</span>
        <span>Comprovante não fiscal</span>
      </footer>
    </article>
  );
}
export function ReceiptPreview({
  sale,
  format,
  onFormat,
  onClose,
}: {
  sale: SaleRecord;
  format: 'a4' | 'thermal';
  onFormat: (value: 'a4' | 'thermal') => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.showModal();
    return () => {
      node?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="receipt-preview no-print"
      aria-labelledby="receipt-preview-title"
      onCancel={onClose}
    >
      <header className="receipt-preview-toolbar">
        <h2 id="receipt-preview-title">
          <FileText size={15} />
          Comprovante
        </h2>
        <label>
          Formato
          <select
            aria-label="Formato do comprovante"
            value={format}
            onChange={(e) => onFormat(e.target.value as 'a4' | 'thermal')}
          >
            <option value="a4">Folha A4</option>
            <option value="thermal">Bobina 80 mm</option>
          </select>
        </label>
        <button
          className="primary"
          onClick={() => {
            ref.current?.close();
            onClose();
            window.setTimeout(() => window.print(), 50);
          }}
        >
          <Printer size={14} />
          Imprimir
        </button>
        <button aria-label="Fechar comprovante" className="icon-button" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="receipt-preview-paper">
        <ReceiptDocument sale={sale} format={format} />
      </div>
    </dialog>
  );
}
