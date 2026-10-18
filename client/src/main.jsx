import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthGate } from "./components/AuthGate.jsx";
import { CrashBoundary } from "./components/CrashScreen.jsx";
import "./index.css";

// The outer boundary covers the login page too (Reload only: nobody is signed in to
// report anything); the inner one is the signed-in app, which can also report.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CrashBoundary>
      <AuthGate>
        {(user, onLogout) => (
          <CrashBoundary canReport>
            <App user={user} onLogout={onLogout} />
          </CrashBoundary>
        )}
      </AuthGate>
    </CrashBoundary>
  </React.StrictMode>
);
