import { useEffect, useState } from "react";
import { api } from "../api.js";

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
      <div className="auth-page">
        <div className="card auth-card">
          <h1 className="wordmark auth-wordmark">
            The Matt Mo <span>Cookbook</span>
          </h1>
          {forgotSent ? (
            <p className="auth-hint">
              If that email has an account, we've sent a link to reset the password — check your inbox.
            </p>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="form-label">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? "…" : "Send reset link"}
              </button>
              {error && <p className="auth-error">{error}</p>}
            </form>
          )}
          <button type="button" className="btn subtle auth-back-link" onClick={() => switchMode("login")}>
            ← Back to log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="wordmark auth-wordmark">
          The Matt Mo <span>Cookbook</span>
        </h1>
        <div className="auth-mode-tabs">
          <button
            type="button"
            className={`auth-mode-tab${mode === "login" ? " active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-mode-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="form-label">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Matt"
              />
            </label>
          )}
          <label className="form-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="form-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "signup" && <p className="auth-hint">At least 8 characters.</p>}
          {mode === "login" && (
            <button type="button" className="btn subtle auth-forgot-link" onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          )}
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </div>
    </div>
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
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="wordmark auth-wordmark">
          The Matt Mo <span>Cookbook</span>
        </h1>
        {done ? (
          <>
            <p className="auth-hint">Password updated — you can log in now.</p>
            <a className="btn primary" href="/">
              Go to log in
            </a>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-label">
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label className="form-label">
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <p className="auth-hint">At least 8 characters.</p>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "…" : "Set new password"}
            </button>
            {error && <p className="auth-error">{error}</p>}
          </form>
        )}
      </div>
    </div>
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
