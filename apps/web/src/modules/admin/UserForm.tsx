import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Row } from '../../services/api';
import { RemoteSelect } from '../../components/RemoteSelect';
import { Title, Feedback, Loading } from '../../components/ui';
export function UserForm() {
  const { id } = useParams(),
    navigate = useNavigate(),
    cache = useQueryClient(),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [active, setActive] = useState(true),
    [employeeId, setEmployee] = useState(''),
    [roleIds, setRoles] = useState<string[]>([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Row[]>('users/roles') }),
    users = useQuery({ queryKey: ['users'], queryFn: () => api<Row[]>('users'), enabled: !!id });
  useEffect(() => {
    const user = users.data?.find((u) => u.id === id);
    if (user) {
      setName(String(user.name));
      setEmail(String(user.email));
      setActive(Boolean(user.active));
      setEmployee(String(user.employeeId ?? ''));
      setRoles(user.roleIds as string[]);
    }
  }, [users.data, id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api('users' + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        body: {
          name,
          email,
          active,
          employeeId: employeeId || null,
          roleIds,
          ...(password ? { password } : {}),
        },
      });
      await cache.invalidateQueries({ queryKey: ['users'] });
      navigate('/users');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title={id ? 'Editar usuário' : 'Novo usuário'} />
      <Feedback error={error ?? roles.error ?? users.error} />
      {roles.isLoading ? (
        <Loading />
      ) : (
        <form className="record-form" onSubmit={save}>
          <section className="form-section">
            <h2>Identificação e acesso</h2>
            <div className="form-grid">
              <label>
                Nome
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
                {id ? 'Nova senha (opcional)' : 'Senha inicial'}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required={!id}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small>12 caracteres, maiúscula, minúscula e número.</small>
              </label>
              <label>
                Colaboradora vinculada
                <RemoteSelect
                  resource="employees"
                  label="Colaboradora"
                  value={employeeId}
                  onChange={setEmployee}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />{' '}
                Usuário ativo
              </label>
            </div>
          </section>
          <section className="form-section">
            <h2>Perfis e permissões</h2>
            <p className="muted">
              Alterações revogam as sessões do usuário. Perfis administrativos exigem MFA.
            </p>
            {roles.data?.map((role) => (
              <label className="check-label" key={role.id}>
                <input
                  type="checkbox"
                  checked={roleIds.includes(role.id)}
                  onChange={(e) =>
                    setRoles((v) =>
                      e.target.checked ? [...v, role.id] : v.filter((id) => id !== role.id),
                    )
                  }
                />
                {String(role.name)}
              </label>
            ))}
          </section>
          <div className="form-actions">
            <button className="primary" disabled={busy || !roleIds.length}>
              Salvar usuário
            </button>
            <button type="button" onClick={() => navigate('/users')}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </>
  );
}
