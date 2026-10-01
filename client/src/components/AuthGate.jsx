import { useEffect, useState } from "react";
import { api } from "../api.js";

// The page around every auth card: a "MEAL PREP" pill and the title above
// a cream card with a blue offset shadow (Riso Login handoff).
function AuthShell({ children }) {
  return (
    <div className="auth-page riso-theme riso-auth">
      <div className="riso-auth-col">
        <div className="riso-auth-head">
          <span className="riso-auth-eyebrow">MEAL PREP</span>
          <h1 className="riso-auth-title">The Matt Mo Cookbook</h1>
        </div>
        <div className="auth-card riso-auth-card">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, ...input }) {
  return (
    <label className="riso-auth-field">
      {label}
      <input {...input} />
    </label>
  );
}

// Full-page login/signup form, shown instead of the app until there's a
// valid session. Each account is entirely its own cookbook/planner/grocery
// list/flyer deals - nothing is shared between accounts.
function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await api.forgotPassword(email.trim());
        setForgotSent(true);
        return;
      }
      const user =
        mode === "login"
          ? await api.login(email.trim(), password)
          : await api.signup(email.trim(), password, name.trim());
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
    setForgotSent(false);
  }

  if (mode === "forgot") {
    return (
      <AuthShell>
        {forgotSent ? (
          <p className="auth-hint">
            If that email has an account, we've sent a link to reset the password — check your inbox.
          </p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="riso-auth-submit" disabled={loading}>
              {loading ? "…" : "Send reset link"}
            </button>
          </form>
        )}
        <button type="button" className="riso-auth-link" onClick={() => switchMode("login")}>
          ← Back to log in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-mode-tabs" role="group" aria-label="Log in or sign up">
        {[
          ["login", "Log in"],
          ["signup", "Sign up"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`auth-mode-tab${mode === value ? " active" : ""}`}
            aria-pressed={mode === value}
            onClick={() => switchMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "signup" && (
          <Field label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Matt" />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "signup" && <p className="auth-hint">At least 8 characters.</p>}
        {error && <p className="auth-error">{error}</p>}
        <div className="riso-auth-actions">
          <button type="submit" className="riso-auth-submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
          {mode === "login" && (
            <button type="button" className="riso-auth-link" onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}

// Shown instead of the login form when the URL is a password-reset link
// (?token=... from the emailed link) - works whether or not there's an
// existing session, since resetting is exactly what someone needs when
// they're locked out.
function ResetPasswordForm({ token }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {done ? (
        <>
          <p className="auth-hint">Password updated — you can log in now.</p>
          <a className="riso-auth-submit" href="/">
            Go to log in
          </a>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="auth-hint">At least 8 characters.</p>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="riso-auth-submit" disabled={loading}>
            {loading ? "…" : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

// Gates the whole app behind a session check: shows nothing meaningful
// while checking, the login/signup form if there's no session, and renders
// its children (the real app) once there is one. A password-reset link's
// ?token= is checked first, ahead of the session check, since resetting a
// password needs to work whether or not the visitor happens to already be
// logged in on this browser.
export function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out, object = logged in
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("token"));

  useEffect(() => {
    if (resetToken) return; // no need to check a session just to show the reset form
    api.me().then(setUser);
  }, [resetToken]);

  if (resetToken) return <ResetPasswordForm token={resetToken} />;

  if (user === undefined) return null;
  if (user === null) return <AuthForm onAuthed={setUser} />;
  return children(user, () => setUser(null));
}
