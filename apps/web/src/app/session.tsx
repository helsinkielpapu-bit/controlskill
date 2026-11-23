import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionCompany, SessionUser } from '@controlskill/contracts';
import { endpoints, setUnauthorizedHandler } from './api';

interface Session {
  user: SessionUser | null; company: SessionCompany | null; ready: boolean; expired: boolean;
  signIn: (s: { user: SessionUser; company: SessionCompany }) => void;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<{ user: SessionUser | null; company: SessionCompany | null; ready: boolean; expired: boolean }>({ user: null, company: null, ready: false, expired: false });

  useEffect(() => {
    endpoints.me().then(r => setState({ ...r, ready: true, expired: false })).catch(() => setState(s => ({ ...s, ready: true })));
    // RF-009: sesión vencida → volver al acceso con aviso
    setUnauthorizedHandler(() => { qc.clear(); setState({ user: null, company: null, ready: true, expired: true }); });
  }, [qc]);

  const signIn = useCallback((s: { user: SessionUser; company: SessionCompany }) => setState({ ...s, ready: true, expired: false }), []);
  const signOut = useCallback(async () => {
    await endpoints.logout().catch(() => {});
    qc.clear();
    setState({ user: null, company: null, ready: true, expired: false });
  }, [qc]);

  return <Ctx.Provider value={{ ...state, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuera de SessionProvider');
  return s;
}
