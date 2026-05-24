import { createCookieSessionStorage } from "@remix-run/node";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__printlab_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET ?? "printlab-secret-key-2026"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
});

export async function getShopFromSession(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return (session.get("shop") as string | undefined) ?? null;
}

export async function createShopSession(shop: string): Promise<string> {
  const session = await sessionStorage.getSession();
  session.set("shop", shop);
  return sessionStorage.commitSession(session);
}

export async function destroyShopSession(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return sessionStorage.destroySession(session);
}
