import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../i18n/format.js";
import { KIND_TONES, pageKey } from "../lib/admin.js";
import { Heading, NotAllowed, dayText } from "./Admin.jsx";
import { CountPill, Pill } from "./RisoPills.jsx";

// The Feedback inbox (address /admin/feedback), for admins only: everything
// testers sent from the Feedback form, newest first, with who sent it, the details
// the app attached and Matt's Done tick. Built from the Admin page's own pieces
// (its heading, cards and denied card) and the shared pills and buttons.
// That is only what the screen shows: the server checks ADMIN_EMAILS on every
// /api/admin call (GET and PATCH /api/admin/feedback), so a non-admin gets 403.

const clock = (date) => formatDate(date, { hour: "numeric", minute: "2-digit" });

function Details({ item }) {
  const unknown = (value) => (value && value !== "unknown" ? value : t("admin.feedback.unknown"));
  const page = pageKey(item.page);
  const device = item.device === "unknown" ? t("admin.feedback.unknown") : t(item.device === "phone" ? "admin.feedback.phone" : "admin.feedback.computer");
  const rows = [
    [t("same.page"), page ? t(page) : unknown(item.page)],
    [t("admin.feedback.details.language"), item.locale === "en" ? t("same.en") : t("same.fr")],
    [t("admin.feedback.details.device"), `${device}${item.screen && item.screen !== "unknown" ? ` · ${item.screen.replace("x", "×")}` : ""}`],
    [t("admin.feedback.details.browser"), unknown(item.browser)],
    [t("admin.feedback.details.version"), unknown(item.appVersion)],
    ...(item.errorName ? [[t("admin.feedback.details.error"), item.errorName]] : []),
  ];
  return (
    <dl className="riso-fbi-details">
      {rows.map(([label, value]) => (
        <div key={label} className="riso-fbi-detail">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FeedbackInbox({ user, onHome }) {
  // Turns to "Not allowed" if the server refuses, whatever this page was told.
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function load() {
    setError(false);
    api
      .adminFeedback()
      .then(setData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(true);
      });
  }
  useEffect(() => {
    if (user.isAdmin) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleDone(item) {
    setBusyId(item.id);
    setSaveError(false);
    try {
      const updated = await api.adminSetFeedbackDone(item.id, !item.doneAt);
      setData((current) => ({
        ...current,
        items: current.items.map((row) => (row.id === updated.id ? updated : row)),
        // One more or one fewer to do, according to which way the tick went.
        notDone: current.notDone + (item.doneAt ? 1 : 0) - (updated.doneAt ? 1 : 0),
      }));
    } catch (err) {
      if (err.status === 403) setForbidden(true);
      else setSaveError(true);
    } finally {
      setBusyId(null);
    }
  }

  if (!user.isAdmin || forbidden) return <NotAllowed onHome={onHome} />;

  return (
    <div className="riso-theme riso-admin" data-theme="light">
      <Heading start={t("admin.feedback.titleStart")} accent={t("admin.feedback.titleAccent")} />
      <p className="riso-admin-intro">{t("admin.feedback.intro")}</p>
      <section className="riso-admin-card riso-fbi" aria-labelledby="admin-feedback-title">
        <div className="riso-admin-card-head">
          <h2 id="admin-feedback-title" className="riso-admin-card-title">
            {t("admin.feedback.title")}
          </h2>
          {data && <CountPill count={data.notDone} tone="yellow" aria-label={t("admin.feedback.notDone", { count: data.notDone })} />}
        </div>
        {saveError && (
          <p className="riso-admin-status" role="alert">
            {t("admin.feedback.saveFailed")}
          </p>
        )}
        {error ? (
          <p className="riso-admin-status" role="alert">
            {t("admin.feedback.error")}{" "}
            <button type="button" className="riso-btn small" onClick={load}>
              {t("app.tryAgain")}
            </button>
          </p>
        ) : !data ? (
          <p className="riso-admin-status">{t("admin.feedback.loading")}</p>
        ) : data.items.length === 0 ? (
          <p className="riso-admin-status">{t("admin.feedback.empty")}</p>
        ) : (
          <>
            <ul className="riso-fbi-list">
              {data.items.map((item) => (
                <li key={item.id} className={`riso-fbi-item${item.doneAt ? " done" : ""}`}>
                  <div className="riso-fbi-top">
                    <Pill size="tag" tone={KIND_TONES[item.kind]}>
                      {t(`feedback.kinds.${item.kind}`)}
                    </Pill>
                    <span className="riso-fbi-from">{t("admin.feedback.from", { email: item.email ?? "?" })}</span>
                    <time className="riso-fbi-time" dateTime={new Date(item.createdAt).toISOString()}>
                      {dayText(item.createdAt)} · {clock(item.createdAt)}
                    </time>
                  </div>
                  <p className="riso-fbi-message">{item.message}</p>
                  <Details item={item} />
                  <div className="riso-fbi-actions">
                    <button
                      type="button"
                      className={`riso-btn small${item.doneAt ? " primary" : ""}`}
                      aria-pressed={Boolean(item.doneAt)}
                      aria-label={t(item.doneAt ? "admin.feedback.undoneLabel" : "admin.feedback.doneLabel", { email: item.email ?? "?" })}
                      disabled={busyId === item.id}
                      onClick={() => toggleDone(item)}
                    >
                      {item.doneAt ? "✓ " : ""}
                      {t("admin.feedback.done")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {data.total > data.items.length && (
              <p className="riso-admin-status">{t("admin.feedback.showing", { shown: data.items.length, total: data.total })}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
