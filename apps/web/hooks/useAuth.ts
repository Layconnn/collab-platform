"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useAuth() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const login = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      sessionStorage.setItem("csrf_token", result.csrfToken);
      await utils.notification.listForUser.reset();
      await utils.auth.me.invalidate();
    },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: async (result) => {
      sessionStorage.setItem("csrf_token", result.csrfToken);
      await utils.notification.listForUser.reset();
      await utils.auth.me.invalidate();
    },
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      sessionStorage.removeItem("csrf_token");
      await utils.notification.listForUser.reset();
      await utils.auth.me.invalidate();
    },
  });
  const changePassword = trpc.auth.changePassword.useMutation();

  return {
    login,
    register,
    logout,
    changePassword,
    me,
    user: me.data,
    isLoading: me.isLoading,
    isAuthenticated: Boolean(me.data),
  };
}
