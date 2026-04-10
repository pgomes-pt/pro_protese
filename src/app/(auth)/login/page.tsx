import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-1 items-center justify-center bg-[#0f172a] px-4 py-16 text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span
              className="size-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
              aria-hidden
            />
            A carregar…
          </span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
