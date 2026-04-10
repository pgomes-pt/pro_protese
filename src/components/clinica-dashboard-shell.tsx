"use client";

import type { ClinicStatus } from "@prisma/client";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Sparkles,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function ClinicStatusBadge({ status }: { status: ClinicStatus }) {
  if (status === "ATIVA") {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/30">
        Ativa
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/25">
      Nova
    </span>
  );
}

const nav = [
  { href: "/clinica", label: "Painel", icon: LayoutDashboard },
  { href: "/clinica/novo-pedido", label: "Novo pedido", icon: PlusCircle },
  { href: "/clinica/perfil", label: "Perfil", icon: User },
] as const;

function navActive(pathname: string, href: string): boolean {
  if (href === "/clinica") {
    return pathname === "/clinica" || pathname.startsWith("/clinica/pedidos");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClinicaDashboardShell({
  clinicName,
  clinicStatus,
  userName,
  userEmail,
  children,
}: {
  clinicName: string;
  clinicStatus: ClinicStatus;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarInner = (
    <>
      <div className="relative border-b border-white/10 px-4 py-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 ring-1 ring-blue-400/30">
            <Sparkles className="size-5 text-blue-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-semibold leading-tight text-white">
              {clinicName}
            </p>
            <div className="mt-2">
              <ClinicStatusBadge status={clinicStatus} />
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-blue-300"
              }`}
            >
              <Icon
                className={`size-[18px] shrink-0 transition-transform duration-200 ${
                  active ? "text-white" : "text-slate-500 group-hover:text-blue-300"
                }`}
                aria-hidden
              />
              <span className="font-heading">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <p className="truncate text-xs font-medium text-white">{userName}</p>
          <p className="truncate text-[11px] text-slate-500">{userEmail}</p>
        </div>
        <a
          href="/api/auth/logout"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-red-400/30 hover:bg-red-950/30 hover:text-red-200"
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </a>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white">
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[260px] lg:flex-col">
        <div className="relative flex h-full flex-col overflow-hidden border-r border-slate-800/80 bg-[#0f172a] shadow-2xl shadow-black/40">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage: `radial-gradient(ellipse 120% 80% at 20% 0%, rgba(37, 99, 235, 0.12) 0%, transparent 55%),
                linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, #1e293b 100%)`,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
            aria-hidden
          />
          <div className="relative flex min-h-0 flex-1 flex-col">{sidebarInner}</div>
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Sparkles className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold text-slate-900">
              {clinicName}
            </p>
            <div className="mt-0.5">
              <ClinicStatusBadge status={clinicStatus} />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileOpen ? (
            <X className="size-5" aria-hidden />
          ) : (
            <Menu className="size-5" aria-hidden />
          )}
        </button>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(280px,88vw)] transform border-r border-slate-800/80 bg-[#0f172a] shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage: `radial-gradient(ellipse 120% 80% at 20% 0%, rgba(37, 99, 235, 0.12) 0%, transparent 55%),
                linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, #1e293b 100%)`,
            }}
            aria-hidden
          />
          <div className="relative flex min-h-0 flex-1 flex-col">{sidebarInner}</div>
        </div>
      </aside>

      <main className="min-h-[calc(100vh-57px)] bg-white lg:ml-[260px] lg:min-h-screen">
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
