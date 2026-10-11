import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../i18n/format.js";
import {
  DEFAULT_INVITE_DAYS,
  DEFAULT_INVITE_USES,
  INVITE_DAYS,
  INVITE_TONES,
  INVITE_USES,
  canSwitch,
  dayKind,
  limitReached,
  parseAiLimit,
  usableCount,
} from "../lib/admin.js";
import { CountPill, Pill } from "./RisoPills.jsx";
import { Segmented } from "./RisoControls.jsx";

// The Admin page (address /admin), for running the beta: Project HQ, the
// Members list, Invite codes (make, list and switch off the codes signup
// needs) and AI usage (the daily limit on reading flyers and receipts, and
// what each account used today). Only admins get here from the avatar menu;
// anyone else who opens the address sees "Not allowed".
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

// "✓ Copied" on the button for a moment. If the browser won't copy, nothing
// changes: the code is also shown selectable on its own line.
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className="riso-btn small" aria-label={label} onClick={copy}>
      {copied ? t("admin.invites.copied") : t("admin.invites.copy")}
    </button>
  );
}

function InviteRow({ invite, fresh, busy, onSwitch }) {
  const { code, note, state, usedCount, maxUses, expiresAt, active, usedBy } = invite;
  return (
    <li className={`riso-admin-code${fresh ? " fresh" : ""}`} data-state={state}>
      <div className="riso-admin-code-main">
        <code className="riso-admin-code-text">{code}</code>
        <Pill size="tag" tone={INVITE_TONES[state]}>
          {t(`admin.invites.state.${state}`)}
        </Pill>
      </div>
      <div className={`riso-admin-code-note${note ? "" : " empty"}`}>{note || t("admin.invites.noNote")}</div>
      <div className="riso-admin-code-meta">
        <span>{t("admin.invites.usedOf", { used: usedCount, max: maxUses })}</span>
        <span>
          {expiresAt
            ? t(state === "expired" ? "admin.invites.expiredOn" : "admin.invites.expiresOn", {
                date: formatDate(expiresAt, { year: "numeric", month: "short", day: "numeric" }),
              })
            : t("admin.invites.neverExpires")}
        </span>
      </div>
      {usedBy.length > 0 && <div className="riso-admin-code-joined">{t("admin.invites.joined", { emails: usedBy.join(", ") })}</div>}
      {canSwitch(invite) && (
        <div className="riso-admin-code-actions">
          {state === "active" && <CopyButton text={code} label={t("admin.invites.copyLabel", { code })} />}
          <button
            type="button"
            className="riso-btn small"
            disabled={busy}
            aria-label={t(active ? "admin.invites.switchOffLabel" : "admin.invites.switchOnLabel", { code })}
            onClick={() => onSwitch(invite)}
          >
            {t(active ? "admin.invites.switchOff" : "admin.invites.switchOn")}
          </button>
        </div>
      )}
    </li>
  );
}

function Invites({ onForbidden }) {
  const [invites, setInvites] = useState(null);
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");
  const [uses, setUses] = useState(DEFAULT_INVITE_USES);
  const [days, setDays] = useState(DEFAULT_INVITE_DAYS);
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    setError(false);
    api
      .adminInvites()
      .then((res) => setInvites(res.invites))
      .catch((err) => {
        if (err.status === 403) onForbidden();
        else setError(true);
      });
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function make(e) {
    e.preventDefault();
    setMaking(true);
    setMakeError(null);
    try {
      const invite = await api.adminCreateInvite({ note: note.trim(), maxUses: uses, expiresInDays: days });
      setInvites((list) => [invite, ...(list ?? [])]);
      setFreshId(invite.id);
      setNote("");
    } catch (err) {
      if (err.status === 403) onForbidden();
      else setMakeError(err.message || t("admin.invites.makeError"));
    } finally {
      setMaking(false);
    }
  }

  async function switchCode(invite) {
    setBusyId(invite.id);
    setMakeError(null);
    try {
      const updated = await api.adminSetInviteActive(invite.id, !invite.active);
      setInvites((list) => list.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      if (err.status === 403) onForbidden();
      else setMakeError(err.message || t("admin.invites.switchError"));
    } finally {
      setBusyId(null);
    }
  }

  const usable = invites ? usableCount(invites) : 0;

  return (
    <section className="riso-admin-card riso-admin-invites" aria-labelledby="admin-invites-title">
      <div className="riso-admin-card-head">
        <h2 id="admin-invites-title" className="riso-admin-card-title">
          {t("admin.invites.title")}
        </h2>
        {invites && <CountPill count={usable} tone="green" aria-label={t("admin.invites.count", { count: usable })} />}
      </div>
      <p className="riso-admin-card-text">{t("admin.invites.intro")}</p>

      <form className="riso-admin-form" onSubmit={make}>
        <label className="riso-import-field">
          <span>{t("admin.invites.noteLabel")}</span>
          <input
            name="invite-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("admin.invites.notePlaceholder")}
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <div className="riso-import-field" role="group" aria-label={t("admin.invites.usesLabel")}>
          <span>{t("admin.invites.usesLabel")}</span>
          <div className="riso-admin-choices">
            <Segmented
              options={INVITE_USES.map((n) => ({ id: n, label: t("admin.invites.uses", { count: n }) }))}
              value={uses}
              onChange={setUses}
            />
          </div>
        </div>
        <div className="riso-import-field" role="group" aria-label={t("admin.invites.expiresLabel")}>
          <span>{t("admin.invites.expiresLabel")}</span>
          <div className="riso-admin-choices">
            <Segmented
              options={INVITE_DAYS.map((n) => ({
                id: n ?? "never",
                label: n === null ? t("admin.invites.never") : t("admin.invites.days", { count: n }),
              }))}
              value={days ?? "never"}
              onChange={(id) => setDays(id === "never" ? null : id)}
            />
          </div>
        </div>
        <button type="submit" className="riso-btn primary riso-admin-make" disabled={making}>
          {making ? t("admin.invites.making") : t("admin.invites.make")}
        </button>
        {makeError && (
          <p className="riso-admin-status" role="alert">
            {makeError}
          </p>
        )}
      </form>

      {error ? (
        <p className="riso-admin-status">
          {t("admin.invites.error")}{" "}
          <button type="button" className="riso-btn small" onClick={load}>
            {t("app.tryAgain")}
          </button>
        </p>
      ) : !invites ? (
        <p className="riso-admin-status">{t("admin.invites.loading")}</p>
      ) : invites.length === 0 ? (
        <p className="riso-admin-status">{t("admin.invites.empty")}</p>
      ) : (
        <ul className="riso-admin-codes" aria-label={t("admin.invites.listLabel")}>
          {invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} fresh={invite.id === freshId} busy={busyId === invite.id} onSwitch={switchCode} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AiUsage({ me, onForbidden }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(false);
  const [limitText, setLimitText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [limitError, setLimitError] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  function load() {
    setError(false);
    api
      .adminAiUsage()
      .then((res) => {
        setUsage(res);
        setLimitText(String(res.limit));
      })
      .catch((err) => {
        if (err.status === 403) onForbidden();
        else setError(true);
      });
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault();
    setSaved(false);
    const limit = parseAiLimit(limitText, usage.maxLimit);
    if (limit === null) {
      setLimitError(t("admin.ai.limitError", { max: usage.maxLimit }));
      return;
    }
    setLimitError(null);
    setSaving(true);
    try {
      await api.adminSetAiLimit(limit);
      setUsage((current) => ({ ...current, limit }));
      setLimitText(String(limit));
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      if (err.status === 403) onForbidden();
      else setLimitError(err.message || t("admin.ai.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="riso-admin-card riso-admin-ai" aria-labelledby="admin-ai-title">
      <div className="riso-admin-card-head">
        <h2 id="admin-ai-title" className="riso-admin-card-title">
          {t("admin.ai.title")}
        </h2>
      </div>
      <p className="riso-admin-card-text">{t("admin.ai.intro")}</p>
      {error ? (
        <p className="riso-admin-status">
          {t("admin.ai.error")}{" "}
          <button type="button" className="riso-btn small" onClick={load}>
            {t("app.tryAgain")}
          </button>
        </p>
      ) : !usage ? (
        <p className="riso-admin-status">{t("admin.ai.loading")}</p>
      ) : (
        <>
          <form className="riso-admin-limit" onSubmit={save} noValidate>
            <label className="riso-import-field">
              <span>{t("admin.ai.limitLabel")}</span>
              <input
                name="ai-limit"
                type="number"
                inputMode="numeric"
                min={0}
                max={usage.maxLimit}
                step={1}
                value={limitText}
                onChange={(e) => {
                  setLimitText(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <button type="submit" className="riso-btn primary" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
            {saved && (
              <span className="riso-admin-saved" role="status">
                {t("admin.ai.saved")}
              </span>
            )}
          </form>
          <p className="riso-admin-hint">{t("admin.ai.limitHint")}</p>
          {limitError && (
            <p className="riso-admin-status" role="alert">
              {limitError}
            </p>
          )}
          {usage.limit === 0 && (
            <p className="riso-admin-status" role="status">
              {t("admin.ai.paused")}
            </p>
          )}
          <h3 className="riso-admin-subtitle">{t("admin.ai.todayTitle")}</h3>
          <table className="riso-admin-table riso-admin-usage">
            <thead>
              <tr>
                <th scope="col">{t("admin.members.email")}</th>
                <th scope="col">{t("admin.ai.today")}</th>
              </tr>
            </thead>
            <tbody>
              {usage.members.map((member) => (
                <tr key={member.email}>
                  <th scope="row" className="riso-admin-email">
                    <span>{member.email}</span>
                    {member.email === me && (
                      <Pill size="tag" tone="ink">
                        {t("admin.members.you")}
                      </Pill>
                    )}
                  </th>
                  <td data-label={t("admin.ai.today")}>
                    <span className="riso-admin-used">{t("admin.ai.of", { used: member.used, limit: usage.limit })}</span>
                    {limitReached(member.used, usage.limit) && (
                      <Pill size="tag" tone="pink">
                        {t("admin.ai.reached")}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
        <div className="riso-admin-col">
          <Members me={user.email} onForbidden={() => setForbidden(true)} />
          <AiUsage me={user.email} onForbidden={() => setForbidden(true)} />
        </div>
        <div className="riso-admin-col">
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
          <Invites onForbidden={() => setForbidden(true)} />
        </div>
      </div>
    </div>
  );
}
