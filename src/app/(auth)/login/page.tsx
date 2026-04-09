import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-16 text-sm text-zinc-500">
          A carregar…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
