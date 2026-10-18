import { Component, useState } from "react";
import { t, useLang } from "../i18n/index.js";
import { ERROR_KIND, errorNameOf, getCurrentPage } from "../lib/feedback.js";
import { FeedbackForm } from "./Feedback.jsx";
import { Toast } from "./Toast.jsx";

// What shows when the app itself breaks while drawing a page: a calm "Something went
// wrong" with Reload and, for someone signed in, "Report a problem". Without it a
// React error leaves a blank page with nothing to press.
//
// The report is the Feedback form with "Something's wrong" chosen. It carries the
// page and the error's NAME ("TypeError"), never its text, which can hold anything
// (lib/feedback.js errorNameOf). There is no personal data in it.
//
//   <CrashBoundary canReport>   around the signed-in app
//   <CrashBoundary>             around everything, including the login page (Reload only)
export class CrashBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The app stopped:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} canReport={Boolean(this.props.canReport)} />;
  }
}

function CrashScreen({ error, canReport }) {
  useLang();
  const [form, setForm] = useState(false);
  const [toast, setToast] = useState(null);

  return (
    <div className="riso-theme riso-crash" data-theme="light">
      <section className="riso-help-card riso-crash-card" role="alert" aria-labelledby="crash-title">
        <div className="riso-eyebrow">{t("app.documentTitle")}</div>
        <h1 id="crash-title" className="riso-recipes-title">
          {t("crash.titleStart")} <span className="accent">{t("crash.titleAccent")}</span>
        </h1>
        <p className="riso-crash-text">{t("crash.text")}</p>
        <div className="riso-crash-actions">
          <button type="button" className="riso-btn primary" onClick={() => window.location.reload()}>
            {t("crash.reload")}
          </button>
          {canReport && (
            <button type="button" className="riso-btn" onClick={() => setForm(true)}>
              {t("feedback.reportProblem")}
            </button>
          )}
        </div>
      </section>
      {form && (
        <FeedbackForm
          preset={{ kind: ERROR_KIND, errorName: errorNameOf(error) }}
          page={getCurrentPage()}
          onClose={() => setForm(false)}
          onSent={() => {
            setForm(false);
            setToast({ id: Date.now(), message: t("feedback.thanks") });
          }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
