import { useSystemDialog } from '../../components/SystemDialog';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, me, type Row } from '../../services/api';
import { useSession } from '../../app/session';
import { Title, Feedback, DataTable } from '../../components/ui';
import { date } from '../../utilities/format';
export function SecurityPage() {
  const { confirm } = useSystemDialog();
  const user = useSession(),
    cache = useQueryClient(),
    [setup, setSetup] = useState<{ secret: string; uri: string }>(),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState<string[]>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Row[]>('auth/sessions') });
  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      setSetup(await api('auth/mfa/setup', { method: 'POST', body: {} }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ recoveryCodes: string[] }>('auth/mfa/enable', {
        method: 'POST',
        body: { code },
      });
      const refreshed = await me();
      cache.setQueryData(['session'], refreshed);
      setRecovery(result.recoveryCodes);
      setSetup(undefined);
      setCode('');
      await cache.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!(await confirm('Revogar esta sessão?'))) return;
    try {
      await api('auth/sessions/' + id + '/revoke', { method: 'POST', body: {} });
      await cache.invalidateQueries({ queryKey: ['sessions'] });
      await cache.invalidateQueries({ queryKey: ['session'] });
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div className="security-page notranslate" translate="no">
      <Title title="Segurança e sessões" />
      <Feedback error={error ?? sessions.error} />
      {user.mfaRequired && !user.mfaEnabled && (
        <div className="message warning">
          Seu perfil exige MFA. Configure-o para acessar os módulos operacionais.
        </div>
      )}
      <section className="panel">
        <h2>Autenticação em duas etapas</h2>
        <p>
          {user.mfaEnabled
            ? 'MFA ativo. Para substituir o dispositivo, confirme o novo autenticador.'
            : 'Escaneie o QR Code ou cadastre a chave em um aplicativo autenticador.'}
        </p>
        <button disabled={busy} onClick={start}>
          {user.mfaEnabled ? 'Configurar novo autenticador' : 'Configurar MFA'}
        </button>
        {setup && (
          <form className="mfa-setup" onSubmit={enable}>
            <p>Abra seu aplicativo autenticador, escolha adicionar conta e escaneie o QR Code.</p>
            <QRCodeSVG
              value={setup.uri}
              size={224}
              marginSize={4}
              level="M"
              title="QR Code para configurar o autenticador do CHAME TOTAL"
              style={{ maxWidth: '100%', height: 'auto', background: '#fff' }}
            />
            <label>
              Chave para o autenticador<code>{setup.secret}</code>
            </label>
            <p className="muted">
              Se preferir configurar manualmente, escolha adicionar conta por chave. Nome: CHAME
              TOTAL; tipo: baseado em tempo.
            </p>
            <label>
              Código de 6 dígitos
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <button className="primary" disabled={busy}>
              Validar e ativar
            </button>
          </form>
        )}
        {recovery && (
          <div className="recovery">
            <h3>Códigos de recuperação</h3>
            <p>
              Guarde em local seguro. Cada código pode ser usado uma única vez; esta lista é exibida
              apenas agora.
            </p>
            <pre>{recovery.join('\n')}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(recovery.join('\n')).catch(setError);
              }}
            >
              Copiar códigos
            </button>
            <button onClick={() => setRecovery(undefined)}>Já guardei</button>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Sessões ativas</h2>
        <DataTable
          rows={sessions.data ?? []}
          columns={[
            { key: 'createdAt', label: 'Início', render: (r) => date(r.createdAt) },
            { key: 'lastSeenAt', label: 'Última atividade', render: (r) => date(r.lastSeenAt) },
            { key: 'expiresAt', label: 'Expiração', render: (r) => date(r.expiresAt) },
            {
              key: 'action',
              label: 'Ação',
              render: (r) => <button onClick={() => revoke(r.id)}>Revogar sessão</button>,
            },
          ]}
        />
      </section>
    </div>
  );
}
