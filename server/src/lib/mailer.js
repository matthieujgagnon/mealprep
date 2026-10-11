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

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Sends one email through Resend. Throws when email isn't set up or Resend
// refuses (an unverified domain, testing mode, an outage), and remembers the
// refusal for emailStatus.
export async function sendEmail({ to, subject, html }) {
  if (!emailConfigured()) {
    throw new Error("Email isn't set up: it needs RESEND_API_KEY and EMAIL_FROM.");
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: emailFrom(), to, subject, html });
    if (error) throw new Error(`Resend refused the email: ${error.message || error}`);
  } catch (err) {
    lastFailureAt = Date.now();
    throw err;
  }
  lastFailureAt = null;
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
