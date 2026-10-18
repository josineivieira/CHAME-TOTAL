import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import './brand-access.css';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, me } from '../../services/api';
import { Feedback } from '../../components/ui';
export function AuthPage({ reset = false }: { reset?: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [opening, setOpening] = useState(
    () => !reset && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => setOpening(false), 2700);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => setOpening(false);
    media.addEventListener('change', stop);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener('change', stop);
    };
  }, [opening]);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [otp, setOtp] = useState(''),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    cache = useQueryClient();
  const options = useQuery({
    queryKey: ['auth-options'],
    queryFn: () => api<{ passwordRecovery: boolean }>('auth/options'),
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (reset) {
        const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
        await api('auth/reset-password', { method: 'POST', body: { token, password } });
        history.replaceState(null, '', '/reset');
        setMessage('Senha atualizada. Entre com a nova senha.');
      } else {
        const d = await api<{ csrfToken: string }>('auth/login', {
          method: 'POST',
          body: { email, password, ...(otp ? { otp } : {}) },
        });
        setCsrf(d.csrfToken);
        const user = await me();
        cache.setQueryData(['session'], user);
        navigate('/');
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function forgot() {
    setBusy(true);
    try {
      const r = await api<{ message: string }>('auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(r.message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="brand-access cinema-access" data-opening={opening}>
      {opening && (
        <div className="brand-opening" aria-hidden="true" onPointerDown={() => setOpening(false)}>
          <div className="opening-light" />
          <img
            className="opening-logo"
            src="/brand/charme-total-transparent.webp"
            alt=""
            fetchPriority="high"
            draggable={false}
          />
        </div>
      )}
      <div className="login-composition" onFocusCapture={() => setOpening(false)}>
        <div className="login-signature">
          <img
            src="/brand/charme-total-transparent.webp"
            alt="Charme Total"
            fetchPriority="high"
            draggable={false}
          />
        </div>
        <section className="access-side">
          <div className="access-content">
            <header className="access-heading">
              <h1>{reset ? 'Nova senha' : 'Entrar'}</h1>
              <div className="access-heading-line" />
            </header>
            <Feedback error={error} success={message} />
            <form onSubmit={submit} className="access-form">
              {!reset && (
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </label>
              )}
              <label>
                {reset ? 'Nova senha' : 'Senha'}
                <span className="access-password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={reset ? 12 : 1}
                    autoComplete={reset ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="access-eye"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {!reset && (
                <label>
                  Código MFA ou de recuperação
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    autoComplete="one-time-code"
                    placeholder="Código do autenticador"
                  />
                </label>
              )}
              <button className="access-submit" disabled={busy}>
                <span>{busy ? 'Aguarde...' : reset ? 'Salvar senha' : 'Entrar'}</span>
                <ArrowRight size={19} aria-hidden />
              </button>
            </form>
            {reset ? (
              <Link to="/login">Voltar ao acesso</Link>
            ) : options.data?.passwordRecovery ? (
              <button className="link" disabled={busy || !email} onClick={forgot}>
                Recuperar acesso
              </button>
            ) : null}
            <Link to="/setup" className="link">
              Preparar primeiro acesso
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
