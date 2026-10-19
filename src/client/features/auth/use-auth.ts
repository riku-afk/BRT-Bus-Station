import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiGet, apiPost } from '@/lib/api/client';
import type { Role } from '@shared/rbac/roles';

export type CurrentUser = { id: string; email: string; fullName: string; role: Role };

export const ME_KEY = ['auth', 'me'] as const;

export const fetchMe = () => apiGet<CurrentUser | null>('/auth/me');
export const login = (body: { email: string; password: string }) => apiPost<CurrentUser>('/auth/login', body);
export const register = (body: { email: string; password: string; fullName: string }) => apiPost<CurrentUser>('/auth/register', body);
export const logout = () => apiPost<{ ok: true }>('/auth/logout');

/** The signed-in user, or null. `isLoading` is true only on the very first check. */
export function useCurrentUser() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: login, onSuccess: (user) => qc.setQueryData(ME_KEY, user) });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: register, onSuccess: (user) => qc.setQueryData(ME_KEY, user) });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'system' });
    },
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError || error instanceof Error ? error.message : 'Something went wrong';
}
