import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../i18n/format.js";
import { KIND_TONES, pageKey } from "../lib/admin.js";
import { Heading, NotAllowed, dayText } from "./Admin.jsx";
import { Segmented } from "./RisoControls.jsx";
import { CountPill, Pill } from "./RisoPills.jsx";

// The Feedback inbox (address /admin/feedback), for admins only: everything
// testers sent from the Feedback form, newest first, with who sent it, the details
// the app attached, Matt's Done tick and his Archive. Built from the Admin page's own
// pieces (its heading, cards and denied card) and the shared pills, buttons, switch
// (`Segmented`) and toast (`onToast`, with Undo).
// Done and Archive are separate: Done = handled, Archive = out of sight (the Inbox tab
// and the Archive tab). Archiving never deletes anything and doesn't tick Done, and the
// "to do" pill counts the inbox only. Each tab lists 200 at a time ("Show older").
// That is only what the screen shows: the server checks ADMIN_EMAILS on every
// /api/admin call (every /api/admin/feedback route), so a non-admin gets 403.

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

export function FeedbackInbox({ user, onHome, onToast }) {
  // Turns to "Not allowed" if the server refuses, whatever this page was told.
  const [forbidden, setForbidden] = useState(false);
  const [box, setBox] = useState("inbox");
  // The page of the tab on screen ({ items, nextCursor }); null while it loads.
  const [data, setData] = useState(null);
  // { inbox, archive, notDone }: over everything, from the server, so a tab's number
  // is right whichever tab is open and however much of it is loaded.
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [busyId, setBusyId] = useState(null); // the row being saved, or "all"
  const [loadingMore, setLoadingMore] = useState(false);
  // The newest read of the list: an answer that comes back after a newer read (a tab
  // switch, an Undo) is dropped. boxRef is the tab on screen now, which an Undo reloads.
  const reads = useRef(0);
  const boxRef = useRef("inbox");

  function load(which = boxRef.current) {
    const read = ++reads.current;
    setError(false);
    setMoreError(false);
    api
      .adminFeedback({ box: which })
      .then((res) => {
        if (read !== reads.current) return;
        setData({ items: res.items, nextCursor: res.nextCursor });
        setCounts(res.counts);
      })
      .catch((err) => {
        if (read !== reads.current) return;
        if (err.status === 403) setForbidden(true);
        else setError(true);
      });
  }
  useEffect(() => {
    if (user.isAdmin) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything on screen was archived (or moved back) but older ones are still to come:
  // read the tab again instead of showing an empty list that isn't.
  useEffect(() => {
    if (data && data.items.length === 0 && data.nextCursor) load();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function showBox(next) {
    if (next === boxRef.current) return;
    boxRef.current = next;
    setBox(next);
    setData(null);
    setSaveError(false);
    load(next);
  }

  function failed(err) {
    if (err.status === 403) setForbidden(true);
    else setSaveError(true);
  }

  const without = (ids) => (current) => current && { ...current, items: current.items.filter((row) => !ids.has(row.id)) };

  async function toggleDone(item) {
    setBusyId(item.id);
    setSaveError(false);
    try {
      const { item: updated, counts: fresh } = await api.adminSetFeedbackDone(item.id, !item.doneAt);
      setData((current) => current && { ...current, items: current.items.map((row) => (row.id === updated.id ? updated : row)) });
      setCounts(fresh);
    } catch (err) {
      failed(err);
    } finally {
      setBusyId(null);
    }
  }

  // Archive (archived: true) and Back to inbox (false). The row leaves the tab at once; the
  // toast's Undo moves it the other way, and the tab is read again so it lands where it was.
  async function move(item, archived) {
    setBusyId(item.id);
    setSaveError(false);
    try {
      const { counts: fresh } = await api.adminSetFeedbackArchived(item.id, archived);
      setData(without(new Set([item.id])));
      setCounts(fresh);
      onToast(t(archived ? "admin.feedback.archivedToast" : "admin.feedback.backToast"), () => undo(() => api.adminSetFeedbackArchived(item.id, !archived)));
    } catch (err) {
      failed(err);
    } finally {
      setBusyId(null);
    }
  }

  // "Archive all done": every done one in the inbox, even those not loaded yet. Its Undo
  // puts back exactly the ones it moved, not what was archived before.
  async function archiveAllDone() {
    setBusyId("all");
    setSaveError(false);
    try {
      const { ids, counts: fresh } = await api.adminArchiveDoneFeedback();
      setData(without(new Set(ids)));
      setCounts(fresh);
      if (ids.length > 0) onToast(t("admin.feedback.archivedMany", { count: ids.length }), () => undo(() => api.adminUnarchiveFeedback(ids)));
    } catch (err) {
      failed(err);
    } finally {
      setBusyId(null);
    }
  }

  // The toast doesn't wait for Undo, so it answers for itself: a failure is a message.
  async function undo(send) {
    try {
      await send();
      load();
    } catch (err) {
      if (err.status === 403) setForbidden(true);
      else onToast(t("admin.feedback.saveFailed"));
    }
  }

  async function showOlder() {
    const read = reads.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await api.adminFeedback({ box: boxRef.current, before: data.nextCursor });
      if (read !== reads.current) return;
      setData((current) => ({ items: [...current.items, ...res.items], nextCursor: res.nextCursor }));
      setCounts(res.counts);
    } catch (err) {
      if (err.status === 403) setForbidden(true);
      else setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!user.isAdmin || forbidden) return <NotAllowed onHome={onHome} />;

  const doneCount = counts ? counts.inbox - counts.notDone : 0;
  const tab = (id, key) => ({
    id,
    label: (
      <>
        {t(key)}
        {counts && <CountPill count={counts[id]} />}
      </>
    ),
  });

  return (
    <div className="riso-theme riso-admin" data-theme="light">
      <Heading start={t("admin.feedback.titleStart")} accent={t("admin.feedback.titleAccent")} />
      <p className="riso-admin-intro">{t("admin.feedback.intro")}</p>
      <section className="riso-admin-card riso-fbi" aria-labelledby="admin-feedback-title">
        <div className="riso-admin-card-head">
          <h2 id="admin-feedback-title" className="riso-admin-card-title">
            {t("admin.feedback.title")}
          </h2>
          {counts && <CountPill count={counts.notDone} tone="yellow" aria-label={t("admin.feedback.notDone", { count: counts.notDone })} />}
        </div>
        <div className="riso-fbi-bar">
          <Segmented
            className="riso-fbi-tabs"
            ariaLabel={t("admin.feedback.tabsLabel")}
            value={box}
            onChange={showBox}
            options={[tab("inbox", "admin.feedback.tabInbox"), tab("archive", "admin.feedback.tabArchive")]}
          />
          {box === "inbox" && (
            <button type="button" className="riso-btn small" disabled={doneCount === 0 || busyId === "all"} onClick={archiveAllDone}>
              {t("admin.feedback.archiveAll", { count: doneCount })}
            </button>
          )}
        </div>
        {saveError && (
          <p className="riso-admin-status" role="alert">
            {t("admin.feedback.saveFailed")}
          </p>
        )}
        {error ? (
          <p className="riso-admin-status" role="alert">
            {t("admin.feedback.error")}{" "}
            <button type="button" className="riso-btn small" onClick={() => load()}>
              {t("app.tryAgain")}
            </button>
          </p>
        ) : !data ? (
          <p className="riso-admin-status">{t("admin.feedback.loading")}</p>
        ) : data.items.length === 0 ? (
          <p className="riso-admin-status">{t(box === "inbox" ? "admin.feedback.empty" : "admin.feedback.emptyArchive")}</p>
        ) : (
          <>
            <ul className="riso-fbi-list">
              {data.items.map((item) => {
                const archived = Boolean(item.archivedAt);
                return (
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
                      <button
                        type="button"
                        className="riso-btn small"
                        aria-label={t(archived ? "admin.feedback.backLabel" : "admin.feedback.archiveLabel", { email: item.email ?? "?" })}
                        disabled={busyId === item.id}
                        onClick={() => move(item, !archived)}
                      >
                        {t(archived ? "admin.feedback.back" : "admin.feedback.archive")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {data.nextCursor && (
              <div className="riso-fbi-more">
                <p className="riso-admin-status">{t("admin.feedback.showing", { shown: data.items.length, total: counts?.[box] ?? data.items.length })}</p>
                {moreError && (
                  <p className="riso-admin-status" role="alert">
                    {t("admin.feedback.error")}
                  </p>
                )}
                <button type="button" className="riso-btn small" disabled={loadingMore} onClick={showOlder}>
                  {t("admin.feedback.showOlder")}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
