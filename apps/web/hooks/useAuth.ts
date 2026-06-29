"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useAuth() {
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const logout = trpc.auth.logout.useMutation();
  const changePassword = trpc.auth.changePassword.useMutation();

  return {
    login,
    register,
    logout,
    changePassword,
  };
}
