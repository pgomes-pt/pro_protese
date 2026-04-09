export default function EstafetaDashboardPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900">Estafeta</h1>
      <p className="mt-2 text-zinc-600">Painel do estafeta.</p>
      <form className="mt-8" action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Terminar sessão
        </button>
      </form>
    </div>
  );
}
