import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, me } from '../../services/api';
import { Feedback, Loading } from '../../components/ui';
export function SetupPage() {
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [token, setToken] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    navigate = useNavigate(),
    cache = useQueryClient();
  const status = useQuery({
    queryKey: ['bootstrap'],
    queryFn: () =>
      api<{ initialized: boolean; enabled: boolean; tokenRequired: boolean }>('bootstrap/status'),
    retry: false,
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('bootstrap', {
        method: 'POST',
        body: { name, email, password, ...(token ? { token } : {}) },
      });
      const login = await api<{ csrfToken: string }>('auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setCsrf(login.csrfToken);
      cache.setQueryData(['session'], await me());
      navigate('/security');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="brand large">
          CHAME <strong>TOTAL</strong>
        </div>
        <h1>Preparar primeiro acesso</h1>
        <p>Cadastre a pessoa responsável pelo sistema.</p>
        <Feedback error={error ?? status.error} />
        {status.isLoading ? (
          <Loading />
        ) : status.data?.initialized ? (
          <p>
            A preparação já foi concluída. <Link to="/login">Entrar no sistema</Link>
          </p>
        ) : !status.data?.enabled ? (
          <p>A preparação precisa ser habilitada pelo responsável pela implantação.</p>
        ) : (
          <form onSubmit={submit}>
            <label>
              Nome do administrador
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Senha inicial
              <input
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>12 caracteres, maiúscula, minúscula e número.</small>
            </label>
            {status.data.tokenRequired && (
              <label>
                Código de preparação
                <input
                  type="password"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? 'Preparando…' : 'Criar administrador'}
            </button>
          </form>
        )}
        <Link className="button" to="/login">
          Voltar ao acesso
        </Link>
      </section>
    </main>
  );
}
