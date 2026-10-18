import { Resend } from "resend";
import { msg } from "./i18n.js";

// Every email the app sends goes out through sendEmail below, from one
// sender: the EMAIL_FROM setting on Render (an address on a domain verified at
// resend.com/domains, for example `Matt Mo Cookbook <noreply@example.com>`).
// RESET_EMAIL_FROM, the name this setting had before, is still read if
// EMAIL_FROM isn't set. There is no built-in sender: Resend's own test address
// (onboarding@resend.dev) only delivers to the Resend account's owner, so
// falling back to it just made every other reset email fail.
export function emailFrom() {
  return String(process.env.EMAIL_FROM || process.env.RESET_EMAIL_FROM || "").trim();
}

// Email can only go out with both a Resend key and a sender address. Without
// either the app says so (routes/auth.js) instead of pretending to send.
export function emailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim() && emailFrom());
}

// When a send fails, email counts as "failing" for this long: people asking
// for a reset in that time are told, without trying again, so the answer is the
// same whichever email they typed (a real send is only tried for emails that
// have an account, so trying would tell the two apart).
export const EMAIL_FAILURE_MEMORY_MS = 10 * 60 * 1000;

let lastFailureAt = null;

// "notSetUp" (a key or the sender is missing), "failing" (a send failed in the
// last EMAIL_FAILURE_MEMORY_MS) or "ready".
export function emailStatus(now = Date.now()) {
  if (!emailConfigured()) return "notSetUp";
  if (lastFailureAt !== null && now - lastFailureAt < EMAIL_FAILURE_MEMORY_MS) return "failing";
  return "ready";
}

export function forgetEmailFailure() {
  lastFailureAt = null;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Sends one email through Resend. Throws when email isn't set up or Resend
// refuses (an unverified domain, testing mode, an outage), and remembers the
// refusal for emailStatus. `remember: false` is for an email that is not about
// the reset links (the feedback email to Matt): in Resend's testing mode it can
// only reach Matt, so what happens to it says nothing about whether a friend's
// reset email would be delivered, and it must not change emailStatus either way.
export async function sendEmail({ to, subject, html, remember = true }) {
  if (!emailConfigured()) {
    throw new Error("Email isn't set up: it needs RESEND_API_KEY and EMAIL_FROM.");
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: emailFrom(), to, subject, html });
    if (error) throw new Error(`Resend refused the email: ${error.message || error}`);
  } catch (err) {
    if (remember) lastFailureAt = Date.now();
    throw err;
  }
  if (remember) lastFailureAt = null;
}

// In the account's language ("fr" | "en").
export async function sendPasswordResetEmail(toEmail, resetUrl, lang = "fr") {
  await sendEmail({
    to: toEmail,
    subject: msg(lang, "email.resetSubject"),
    html: `
      <html lang="${lang === "en" ? "en" : "fr"}"><body>
      <p>${escapeHtml(msg(lang, "email.resetBody1"))}</p>
      <p><a href="${escapeHtml(resetUrl)}">${escapeHtml(msg(lang, "email.resetLink"))}</a>. ${escapeHtml(msg(lang, "email.resetBody2"))}</p>
      <p>${escapeHtml(msg(lang, "email.resetBody3"))}</p>
      </body></html>
    `,
  });
}

// The short email to Matt when a tester sends feedback (lib/feedback.js decides
// whether to send it). `row` is the saved Feedback row, `senderEmail` the
// tester's account email, `lang` the language of the person reading it. Every
// word the tester typed is escaped. The subject has none of it.
export async function sendFeedbackEmail({ to, row, senderEmail, lang = "fr", appUrl = process.env.APP_URL }) {
  const kind = msg(lang, `email.feedbackKind.${row.kind}`);
  const known = (value) => (value && value !== "unknown" ? value : msg(lang, "email.feedbackUnknown"));
  const device = row.device === "unknown" ? known(null) : msg(lang, row.device === "phone" ? "email.feedbackPhone" : "email.feedbackComputer");
  const sent = new Date(row.createdAt).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const details = [
    [msg(lang, "email.feedbackPage"), known(row.page)],
    [msg(lang, "email.feedbackLanguage"), row.locale === "en" ? "English" : "Français"],
    [msg(lang, "email.feedbackDevice"), `${device}${row.screen && row.screen !== "unknown" ? `, ${row.screen}` : ""}`],
    [msg(lang, "email.feedbackBrowser"), known(row.browser)],
    [msg(lang, "email.feedbackVersion"), known(row.appVersion)],
    [msg(lang, "email.feedbackSent"), sent],
    ...(row.errorName ? [[msg(lang, "email.feedbackError"), row.errorName]] : []),
  ];
  const base = String(appUrl || "").replace(/\/+$/, "");
  await sendEmail({
    to,
    subject: msg(lang, "email.feedbackSubject", { kind }),
    remember: false,
    html: `
      <html lang="${lang === "en" ? "en" : "fr"}"><body>
      <p><strong>${escapeHtml(kind)}</strong> · ${escapeHtml(senderEmail)}</p>
      <blockquote style="margin:0 0 16px;padding:8px 14px;border-left:4px solid #888;white-space:pre-wrap">${escapeHtml(row.message)}</blockquote>
      <p style="color:#555">${details.map(([label, value]) => `${escapeHtml(label)}: ${escapeHtml(value)}`).join("<br>")}</p>
      ${base ? `<p><a href="${escapeHtml(`${base}/admin/feedback`)}">${escapeHtml(msg(lang, "email.feedbackOpen"))}</a></p>` : ""}
      </body></html>
    `,
  });
}
