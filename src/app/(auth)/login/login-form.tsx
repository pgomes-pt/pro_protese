"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Tooth } from "lucide-react";
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
  if (role === "CLINICA" && next.startsWith("/clinica")) return next;
  if (
    role === "CLINICA" &&
    (next.startsWith("/dashboard/clinica") || next === "/dashboard/clinica")
  ) {
    return next.replace(/^\/dashboard\/clinica/, "/clinica") || "/clinica";
  }
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0f172a] px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(37,99,235,0.18),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-600/20 ring-1 ring-blue-400/40">
            <Tooth className="size-8 text-blue-300" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-white">
            Pro Prótese
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Inicie sessão na sua conta
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-white/10 bg-white/95 p-8 shadow-xl shadow-black/30 backdrop-blur-sm"
        >
          {searchParams.get("error") === "role" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200/80">
              Sessão inválida. Volte a iniciar sessão.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200/80">
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
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
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
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
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/30 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
                A entrar…
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
