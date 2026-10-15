"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { FieldError } from "@/components/ui/Misc";
import { loginSchema } from "@/lib/validations/auth";

type FieldErrors = { email?: string; password?: string };

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verPassword, setVerPassword] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión");
        setLoading(false);
        return;
      }
      router.replace(data.redirectTo);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          <CircleAlert className="icon" aria-hidden />
          <div className="alert-body">{error}</div>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <div className="input-group">
          <Mail className="icon" aria-hidden />
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            placeholder="nombre@uade.edu.ar"
            autoFocus
          />
        </div>
        {fieldErrors.email && <FieldError mensaje={fieldErrors.email} />}
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <div className="input-group">
          <Lock className="icon" aria-hidden />
          <input
            id="password"
            className="input"
            type={verPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            style={{ paddingRight: "2.6rem" }}
          />
          <button
            type="button"
            className="input-action"
            onClick={() => setVerPassword((v) => !v)}
            aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={verPassword}
          >
            {verPassword ? <EyeOff width={16} height={16} aria-hidden /> : <Eye width={16} height={16} aria-hidden />}
          </button>
        </div>
        {fieldErrors.password && <FieldError mensaje={fieldErrors.password} />}
      </div>
      <button className="btn btn-block btn-lg" type="submit" disabled={loading}>
        {loading && <span className="spinner" aria-hidden />}
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
