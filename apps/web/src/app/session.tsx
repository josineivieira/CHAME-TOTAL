import { createContext, useContext } from 'react';
import type { AuthUser } from '@chame/shared';
export const Session = createContext<AuthUser | null>(null);
export function useSession() {
  const user = useContext(Session);
  if (!user) throw new Error('Sessão necessária.');
  return user;
}
export const can = (user: AuthUser, permission: string) => user.permissions.includes(permission);
