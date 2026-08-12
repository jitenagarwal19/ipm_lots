"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/utils";

/**
 * Email one-time-code sign-in.
 *
 * Two steps: ask for a code, then enter it. The server answers the first step
 * identically whether or not the address is authorized, so this screen must not
 * imply otherwise — "if it is authorized" is the honest wording, and saying more
 * would turn the form into a staff directory.
 */

const API_BASE_URL = getApiBaseUrl();

/** Only ever redirect to a path on this site. */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [next, setNext] = useState("/");
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  const requestCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);
      setInfo(null);
      setBusy(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/request-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not send a code.");
        setStep("code");
        setCooldown(data.resendInSeconds ?? 60);
        setInfo(data.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send a code.");
      } finally {
        setBusy(false);
      }
    },
    [email]
  );

  const verify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Wrong or expired code.");
        // Full reload, not client navigation: the session cookie has just been
        // set and every page needs to be fetched with it.
        window.location.href = next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Wrong or expired code.");
        setCode("");
        codeInput.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [email, code, next]
  );

  return (
    <div className="grid min-h-[80vh] place-items-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-xl">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-lg font-bold text-zinc-950">
          IPM
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-white">Traceability</h1>

        {step === "email" ? (
          <>
            <p className="mb-5 mt-1 text-sm text-zinc-400">
              Enter your work email to receive a one-time sign-in code.
            </p>
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <form onSubmit={requestCode} className="space-y-3">
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@sumanexport.in"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || !email}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Sending…" : "Email me a code"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-5 mt-1 text-sm text-zinc-400">
              {info || `If ${email} is authorized, a 6-digit code is on its way.`} It is valid for 10
              minutes.
            </p>
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <form onSubmit={verify} className="space-y-3">
              <input
                ref={codeInput}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-center text-2xl tracking-[0.35em] tabular-nums text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
            </form>
            <div className="mt-4 text-center text-xs">
              <button
                type="button"
                onClick={() => (cooldown > 0 ? undefined : requestCode())}
                disabled={cooldown > 0 || busy}
                className="text-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
              <span className="mx-2 text-zinc-700">·</span>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                  setInfo(null);
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
