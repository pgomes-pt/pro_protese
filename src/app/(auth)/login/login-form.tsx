"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  dashboardPathForRole,
  getRoleFromUser,
  type UserRole,
} from "@/lib/auth-roles";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-config";

function safeRedirectPath(role: UserRole, next: string | null): string {
  const home = dashboardPathForRole(role);
  if (!next) return home;
  if (next === "/dashboard" || next === "/dashboard/") return home;
  if (role === "ADMIN" && next.startsWith("/admin")) return next;
  if (role === "CLINICA" && next.startsWith("/dashboard/clinica")) return next;
  if (role === "ESTAFETA" && next.startsWith("/dashboard/estafeta")) return next;
  return home;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const supabase = useMemo(
    () => createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey()),
    []
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signError } = await supabase.auth.signInWithPassword(
      {
        email: email.trim(),
        password,
      }
    );

    if (signError) {
      setError(
        signError.message === "Invalid login credentials"
          ? "Email ou palavra-passe incorretos."
          : signError.message
      );
      setLoading(false);
      return;
    }

    const role = data.user ? getRoleFromUser(data.user) : undefined;
    if (!role) {
      await supabase.auth.signOut();
      setError(
        "A sua conta não tem um perfil válido. Contacte o administrador."
      );
      setLoading(false);
      return;
    }

    router.push(safeRedirectPath(role, next));
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
            Iniciar sessão
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-600">
            Introduza o seu email e palavra-passe
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm"
        >
          {searchParams.get("error") === "role" ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sessão inválida. Volte a iniciar sessão.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700"
            >
              Palavra-passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
