import { type NextRequest, NextResponse } from "next/server";
import {
  dashboardPathForRole,
  getRoleFromUser,
  type UserRole,
} from "@/lib/auth-roles";
import { createMiddlewareClient } from "@/lib/supabase-middleware";

function redirectWithCookies(
  request: NextRequest,
  sessionResponse: NextResponse,
  path: string,
  searchParams?: Record<string, string>
) {
  const url = new URL(path, request.url);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    const { name, value, ...options } = cookie;
    redirect.cookies.set(name, value, options);
  });
  return redirect;
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin")
  );
}

function isAllowedForRole(pathname: string, role: UserRole): boolean {
  if (role === "ADMIN") {
    return pathname.startsWith("/admin");
  }
  if (role === "CLINICA") {
    return pathname.startsWith("/dashboard/clinica");
  }
  if (role === "ESTAFETA") {
    return pathname.startsWith("/dashboard/estafeta");
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (user) {
      const role = getRoleFromUser(user);
      if (role) {
        return redirectWithCookies(
          request,
          response,
          dashboardPathForRole(role)
        );
      }
    }
    return response;
  }

  if (pathname === "/" || pathname === "") {
    return response;
  }

  if (!isProtectedPath(pathname)) {
    return response;
  }

  if (!user) {
    return redirectWithCookies(request, response, "/login", { next: pathname });
  }

  const role = getRoleFromUser(user);
  if (!role) {
    await supabase.auth.signOut();
    return redirectWithCookies(request, response, "/login", {
      error: "role",
    });
  }

  if (!isAllowedForRole(pathname, role)) {
    return redirectWithCookies(
      request,
      response,
      dashboardPathForRole(role)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
