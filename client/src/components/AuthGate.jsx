import { useEffect, useState } from "react";
import { api } from "../api.js";

// Full-page login/signup form, shown instead of the app until there's a
// valid session. Each account is entirely its own cookbook/planner/grocery
// list/flyer deals - nothing is shared between accounts.
function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
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
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-mode-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => setMode("signup")}
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
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

// Gates the whole app behind a session check: shows nothing meaningful
// while checking, the login/signup form if there's no session, and renders
// its children (the real app) once there is one.
export function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out, object = logged in

  useEffect(() => {
    api.me().then(setUser);
  }, []);

  if (user === undefined) return null;
  if (user === null) return <AuthForm onAuthed={setUser} />;
  return children(user, () => setUser(null));
}
