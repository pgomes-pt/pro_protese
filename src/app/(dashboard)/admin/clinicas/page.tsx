"use client";

import type { ClinicStatus } from "@prisma/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type ClinicApiUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  clinicId: string | null;
};

type ClinicRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  nif: string | null;
  status: ClinicStatus;
  createdAt: string;
  users: ClinicApiUser[];
  _count: { orders: number };
};

function formatCreatedAt(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pt });
}

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

function ModalBackdrop({
  children,
  onClose,
  title,
  wide,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title-clinicas"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg ${
          wide ? "max-w-xl" : "max-w-md"
        }`}
      >
        <h2
          id="modal-title-clinicas"
          className="text-lg font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30";

const labelClass = "block text-xs font-medium text-zinc-600";

export default function AdminClinicasPage() {
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formC, setFormC] = useState({
    clinicName: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    nif: "",
    status: "NOVA" as ClinicStatus,
  });

  const [editRow, setEditRow] = useState<ClinicRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [formE, setFormE] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    nif: "",
    status: "NOVA" as ClinicStatus,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clinics");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao carregar clínicas."
        );
      }
      setClinics(Array.isArray(j) ? j : []);
    } catch (e) {
      setClinics([]);
      setError(e instanceof Error ? e.message : "Erro ao carregar clínicas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editRow) {
      setFormE({
        name: editRow.name,
        phone: editRow.phone ?? "",
        address: editRow.address ?? "",
        city: editRow.city ?? "",
        postalCode: editRow.postalCode ?? "",
        nif: editRow.nif ?? "",
        status: editRow.status,
      });
      setEditError(null);
    }
  }, [editRow]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) => {
      const name = c.name.toLowerCase();
      const nif = (c.nif ?? "").toLowerCase();
      return name.includes(q) || nif.includes(q);
    });
  }, [clinics, search]);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/clinics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: formC.clinicName.trim(),
          email: formC.email.trim(),
          password: formC.password,
          phone: formC.phone.trim() || undefined,
          address: formC.address.trim() || undefined,
          city: formC.city.trim() || undefined,
          postalCode: formC.postalCode.trim() || undefined,
          nif: formC.nif.trim(),
          status: formC.status,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao criar clínica."
        );
      }
      setCreateOpen(false);
      setFormC({
        clinicName: "",
        email: "",
        password: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
        nif: "",
        status: "NOVA",
      });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setCreateSaving(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/clinics/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formE.name.trim(),
          phone: formE.phone.trim() || null,
          address: formE.address.trim() || null,
          city: formE.city.trim() || null,
          postalCode: formE.postalCode.trim() || null,
          nif: formE.nif.trim(),
          status: formE.status,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao atualizar clínica."
        );
      }
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Clínicas
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Criar e gerir clínicas registadas
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Painel admin
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              Nova Clínica
            </button>
            <a
              href="/api/auth/logout"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Terminar sessão
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {error && (
          <div
            className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="shrink-0 rounded-lg bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div className="mb-6">
          <label htmlFor="search-clinicas" className={labelClass}>
            Pesquisar por nome ou NIF
          </label>
          <input
            id="search-clinicas"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar…"
            className={inputClass}
          />
        </div>

        {loading ? (
          <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
            A carregar…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-[880px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">NIF</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-zinc-600"
                    >
                      {clinics.length === 0
                        ? "Nenhuma clínica registada."
                        : "Nenhum resultado para a pesquisa."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="transition hover:bg-zinc-50/80">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-700">
                        {c.nif ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ClinicStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-700">
                        {c._count.orders}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                        {formatCreatedAt(c.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditRow(c)}
                          className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {createOpen && (
        <ModalBackdrop
          title="Nova clínica"
          wide
          onClose={() => !createSaving && setCreateOpen(false)}
        >
          <form onSubmit={(e) => void submitCreate(e)}>
            {createError && (
              <p className="mb-3 text-sm text-red-700" role="alert">
                {createError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="c-name" className={labelClass}>
                  Nome da clínica *
                </label>
                <input
                  id="c-name"
                  required
                  value={formC.clinicName}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, clinicName: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-email" className={labelClass}>
                  Email *
                </label>
                <input
                  id="c-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formC.email}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, email: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-pass" className={labelClass}>
                  Palavra-passe *
                </label>
                <input
                  id="c-pass"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={formC.password}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, password: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-phone" className={labelClass}>
                  Telefone
                </label>
                <input
                  id="c-phone"
                  value={formC.phone}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, phone: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-nif" className={labelClass}>
                  NIF *
                </label>
                <input
                  id="c-nif"
                  required
                  value={formC.nif}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, nif: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="c-addr" className={labelClass}>
                  Morada
                </label>
                <input
                  id="c-addr"
                  value={formC.address}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, address: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-city" className={labelClass}>
                  Localidade
                </label>
                <input
                  id="c-city"
                  value={formC.city}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, city: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="c-postal" className={labelClass}>
                  Código postal
                </label>
                <input
                  id="c-postal"
                  value={formC.postalCode}
                  onChange={(e) =>
                    setFormC((s) => ({ ...s, postalCode: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="c-status" className={labelClass}>
                  Estado
                </label>
                <select
                  id="c-status"
                  value={formC.status}
                  onChange={(e) =>
                    setFormC((s) => ({
                      ...s,
                      status: e.target.value as ClinicStatus,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="NOVA">NOVA</option>
                  <option value="ATIVA">ATIVA</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={createSaving}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createSaving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {createSaving ? "A criar…" : "Criar"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {editRow && (
        <ModalBackdrop
          title="Editar clínica"
          wide
          onClose={() => !editSaving && setEditRow(null)}
        >
          <form onSubmit={(e) => void submitEdit(e)}>
            {editError && (
              <p className="mb-3 text-sm text-red-700" role="alert">
                {editError}
              </p>
            )}
            <p className="mb-3 text-sm text-zinc-600">
              Email de acesso:{" "}
              <span className="font-medium text-zinc-900">{editRow.email}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="e-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="e-name"
                  required
                  value={formE.name}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, name: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="e-phone" className={labelClass}>
                  Telefone
                </label>
                <input
                  id="e-phone"
                  value={formE.phone}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, phone: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="e-nif" className={labelClass}>
                  NIF
                </label>
                <input
                  id="e-nif"
                  required
                  value={formE.nif}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, nif: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="e-addr" className={labelClass}>
                  Morada
                </label>
                <input
                  id="e-addr"
                  value={formE.address}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, address: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="e-city" className={labelClass}>
                  Localidade
                </label>
                <input
                  id="e-city"
                  value={formE.city}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, city: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="e-postal" className={labelClass}>
                  Código postal
                </label>
                <input
                  id="e-postal"
                  value={formE.postalCode}
                  onChange={(e) =>
                    setFormE((s) => ({ ...s, postalCode: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="e-status" className={labelClass}>
                  Estado
                </label>
                <select
                  id="e-status"
                  value={formE.status}
                  onChange={(e) =>
                    setFormE((s) => ({
                      ...s,
                      status: e.target.value as ClinicStatus,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="NOVA">NOVA</option>
                  <option value="ATIVA">ATIVA</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setEditRow(null)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {editSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}
