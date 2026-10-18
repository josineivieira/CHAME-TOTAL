import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { permissions } from '@chame/shared';
import { api } from '../../services/api';
import { Title, Feedback } from '../../components/ui';
export function RoleForm() {
  const [name, setName] = useState(''),
    [keys, setKeys] = useState<string[]>([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('users/roles', { method: 'POST', body: { name, permissions: keys } });
      navigate('/users/roles');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title="Novo perfil de acesso" />
      <Feedback error={error} />
      <form className="record-form" onSubmit={save}>
        <section className="form-section">
          <label>
            Nome do perfil
            <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </section>
        <section className="form-section">
          <h2>Permissões explícitas</h2>
          <div className="permission-grid">
            {permissions.map((p) => (
              <label className="check-label" key={p}>
                <input
                  type="checkbox"
                  checked={keys.includes(p)}
                  onChange={(e) =>
                    setKeys((v) => (e.target.checked ? [...v, p] : v.filter((k) => k !== p)))
                  }
                />
                {p}
              </label>
            ))}
          </div>
        </section>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            Criar perfil
          </button>
        </div>
      </form>
    </>
  );
}
