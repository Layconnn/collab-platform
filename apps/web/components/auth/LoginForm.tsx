"use client";

import { Button, FormControl, FormLabel, Input } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { loginInputSchema, type LoginInput } from "@repo/validators/auth";

import { useAuth } from "@/hooks/useAuth";

export function LoginForm() {
  const { login } = useAuth();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await login.mutateAsync(values);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormControl>
        <FormLabel>Email</FormLabel>
        <Input type="email" {...form.register("email")} />
      </FormControl>
      <FormControl>
        <FormLabel>Password</FormLabel>
        <Input type="password" {...form.register("password")} />
      </FormControl>
      <Button type="submit" colorScheme="teal" isLoading={login.isPending}>
        Sign in
      </Button>
      {login.error ? (
        <p className="text-sm text-red-600">Login failed: {login.error.message}</p>
      ) : null}
    </form>
  );
}
