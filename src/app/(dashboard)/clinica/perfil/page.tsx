"use client";

import type { ClinicStatus } from "@prisma/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ClinicProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  nif: string | null;
  status: ClinicStatus;
};

function ClinicStatusBadge({ status }: { status: ClinicStatus }) {
  if (status === "ATIVA") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
        ATIVA
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-800 ring-1 ring-inset ring-zinc-300">
      NOVA
    </span>
  );
}

function statusExplanation(status: ClinicStatus): string {
  if (status === "NOVA") {
    return "Acesso limitado — apenas trabalhos urgentes disponíveis";
  }
  return "Acesso completo a todos os serviços";
}

export default function ClinicaPerfilPage() {
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clinica/profile");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao carregar perfil."
        );
      }
      setClinic(j as ClinicProfile);
    } catch (e) {
      setClinic(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Perfil da clínica
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Dados da sua conta (consulta apenas)
            </p>
          </div>
          <Link
            href="/clinica"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            ← Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && (
          <div
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            role="alert"
          >
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-3 font-medium underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
            <div className="h-5 w-48 rounded bg-zinc-200" />
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full rounded bg-zinc-100" />
              <div className="h-4 w-full rounded bg-zinc-100" />
              <div className="h-4 w-2/3 rounded bg-zinc-100" />
            </div>
          </div>
        ) : clinic ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Identificação
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-zinc-500">Nome</dt>
                  <dd className="mt-0.5 font-medium text-zinc-900">
                    {clinic.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Email</dt>
                  <dd className="mt-0.5 font-medium text-zinc-900">
                    {clinic.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Telefone</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {clinic.phone?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">NIF</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-900">
                    {clinic.nif ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Estado</dt>
                  <dd className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <ClinicStatusBadge status={clinic.status} />
                    <span className="text-zinc-700">
                      {statusExplanation(clinic.status)}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Morada
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-zinc-500">Morada</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {clinic.address?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Localidade</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {clinic.city?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Código postal</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-900">
                    {clinic.postalCode?.trim() || "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-6">
              <h2 className="text-sm font-semibold text-zinc-900">
                Contactar administrador
              </h2>
              <p className="mt-2 text-sm text-zinc-700">
                Para atualizar os seus dados, contacte o laboratório.
              </p>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
