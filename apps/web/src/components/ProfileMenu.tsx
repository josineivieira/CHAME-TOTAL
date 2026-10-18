import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Camera } from 'lucide-react';
import { api } from '../services/api';
import { useSession } from '../app/session';

type Photo = { avatarData: string | null };
export function ProfileMenu() {
  const user = useSession(),
    cache = useQueryClient(),
    input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const photo = useQuery({
    queryKey: ['profile-photo', user.id],
    queryFn: () => api<Photo>('auth/photo'),
  });
  async function save(image: string | null) {
    const result = await api<Photo>('auth/photo', { method: 'POST', body: { image } });
    cache.setQueryData(['profile-photo', user.id], result);
  }
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    setBusy(true);
    let image: ImageBitmap | undefined;
    try {
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)
        throw new Error('Escolha uma foto JPG ou PNG de até 5 MB.');
      image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível preparar a foto.');
      const side = Math.min(image.width, image.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 160, 160);
      ctx.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        160,
        160,
      );
      await save(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
    } finally {
      image?.close();
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <details className="profile-menu">
      <summary aria-label="Abrir perfil">
        <span className="profile-avatar">
          {photo.data?.avatarData ? (
            <img src={photo.data.avatarData} alt="Sua foto de perfil" />
          ) : (
            user.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((n) => n[0])
              .join('')
              .toLocaleUpperCase('pt-BR')
          )}
        </span>
        <span className="profile-name">{user.name}</span>
        <ChevronDown size={13} />
      </summary>
      <div className="profile-popover">
        <strong>{user.name}</strong>
        <span className="profile-email">{user.email}</span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          aria-label="Selecionar foto de perfil"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <button disabled={busy} onClick={() => input.current?.click()}>
          <Camera size={14} />
          {busy ? 'Salvando foto...' : photo.data?.avatarData ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        <small>JPG ou PNG, até 5 MB. Corte central.</small>
        {photo.data?.avatarData && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await save(null);
              } catch {
                setError('Não foi possível remover a foto.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Remover foto
          </button>
        )}
        {(error || photo.error) && (
          <p role="alert">{error || 'Não foi possível carregar sua foto.'}</p>
        )}
        <Link to="/security">Segurança da conta</Link>
      </div>
    </details>
  );
}
