import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../i18n/format.js";
import { dayKind } from "../lib/admin.js";
import { CountPill, Pill } from "./RisoPills.jsx";

// The Admin page (address /admin), for running the beta: Project HQ, the
// Members list, and Invite codes and AI usage to come. Only admins get here
// from the avatar menu; anyone else who opens the address sees "Not allowed".
// That is only what the screen shows: the server checks ADMIN_EMAILS on every
// /api/admin call and refuses everyone else (server/src/lib/admin.js).

const HQ_URL = "https://claude.ai/artifact/S6zZyugUt88RSg4SXM8V2Y";

function Heading() {
  return (
    <div className="riso-recipes-heading">
      <div className="riso-eyebrow">{t("admin.eyebrow")}</div>
      <h1 className="riso-recipes-title riso-admin-title">
        {t("admin.titleStart")} <span className="accent">{t("admin.titleAccent")}</span>
      </h1>
    </div>
  );
}

function NotAllowed({ onHome }) {
  return (
    <div className="riso-theme riso-admin" data-theme="light">
      <Heading />
      <section className="riso-admin-card riso-admin-denied" role="alert">
        <h2 className="riso-admin-card-title">{t("admin.notAllowed.title")}</h2>
        <p className="riso-admin-card-text">{t("admin.notAllowed.text")}</p>
        <button type="button" className="riso-btn primary" onClick={onHome}>
          {t("admin.notAllowed.home")}
        </button>
      </section>
    </div>
  );
}

function dayText(date) {
  const kind = dayKind(date);
  if (kind === "never") return t("admin.members.never");
  if (kind === "today") return t("admin.members.today");
  if (kind === "yesterday") return t("admin.members.yesterday");
  return formatDate(date, { year: "numeric", month: "short", day: "numeric" });
}

function Members({ me, onForbidden }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    api
      .adminMembers()
      .then((res) => setMembers(res.members))
      .catch((err) => {
        if (err.status === 403) onForbidden();
        else setError(true);
      });
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="riso-admin-card riso-admin-members" aria-labelledby="admin-members-title">
      <div className="riso-admin-card-head">
        <h2 id="admin-members-title" className="riso-admin-card-title">
          {t("admin.members.title")}
        </h2>
        {members && <CountPill count={members.length} tone="blue" aria-label={t("admin.members.count", { count: members.length })} />}
      </div>
      <p className="riso-admin-card-text">{t("admin.members.intro")}</p>
      {error ? (
        <p className="riso-admin-status">
          {t("admin.members.error")}{" "}
          <button type="button" className="riso-btn small" onClick={load}>
            {t("app.tryAgain")}
          </button>
        </p>
      ) : !members ? (
        <p className="riso-admin-status">{t("admin.members.loading")}</p>
      ) : (
        <table className="riso-admin-table">
          <thead>
            <tr>
              <th scope="col">{t("admin.members.email")}</th>
              <th scope="col">{t("admin.members.signedUp")}</th>
              <th scope="col">{t("admin.members.lastActive")}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.email}>
                <th scope="row" className="riso-admin-email">
                  <span>{member.email}</span>
                  {member.email === me && (
                    <Pill size="tag" tone="ink">
                      {t("admin.members.you")}
                    </Pill>
                  )}
                </th>
                <td data-label={t("admin.members.signedUp")}>{dayText(member.signedUpAt)}</td>
                <td data-label={t("admin.members.lastActive")}>{dayText(member.lastActiveAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ComingSoon({ id }) {
  return (
    <section className={`riso-admin-card riso-admin-soon riso-admin-${id}`} aria-labelledby={`admin-${id}-title`}>
      <div className="riso-admin-card-head">
        <h2 id={`admin-${id}-title`} className="riso-admin-card-title">
          {t(`admin.${id}.title`)}
        </h2>
        <Pill size="tag" tone="pink" sticker>
          {t("admin.soon")}
        </Pill>
      </div>
      <p className="riso-admin-card-text">{t(`admin.${id}.text`)}</p>
    </section>
  );
}

export function Admin({ user, onHome }) {
  // Turns to "Not allowed" if the server refuses, whatever this page was told.
  const [forbidden, setForbidden] = useState(false);
  if (!user.isAdmin || forbidden) return <NotAllowed onHome={onHome} />;

  return (
    <div className="riso-theme riso-admin" data-theme="light">
      <Heading />
      <p className="riso-admin-intro">{t("admin.intro")}</p>
      <div className="riso-admin-grid">
        <section className="riso-admin-card riso-admin-hq" aria-labelledby="admin-hq-title">
          <div className="riso-eyebrow on-accent">{t("admin.hq.eyebrow")}</div>
          <h2 id="admin-hq-title" className="riso-admin-card-title">
            {t("admin.hq.title")}
          </h2>
          <p className="riso-admin-card-text">{t("admin.hq.text")}</p>
          <a className="riso-btn hot" href={HQ_URL} target="_blank" rel="noopener noreferrer">
            {t("admin.hq.open")}
            <span aria-hidden="true">↗</span>
          </a>
        </section>
        <Members me={user.email} onForbidden={() => setForbidden(true)} />
        <ComingSoon id="invites" />
        <ComingSoon id="ai" />
      </div>
    </div>
  );
}
