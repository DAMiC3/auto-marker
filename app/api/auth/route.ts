import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // If no auth secret is set, allow through (dev mode)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("am_auth", "dev", { httpOnly: true, sameSite: "strict", path: "/" });
    return res;
  }

  if (password !== secret) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("am_auth", secret, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

// Sign out — clear the auth cookie
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("am_auth", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
