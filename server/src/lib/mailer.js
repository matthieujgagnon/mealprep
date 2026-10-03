import { Resend } from "resend";
import { msg } from "./i18n.js";

// Same "just ask the app owner to configure it" pattern as GEMINI_API_KEY in
// routes/flyers.js - no key means the feature can't work, but everything
// else in the app should keep working regardless.
const FROM_ADDRESS = process.env.RESET_EMAIL_FROM || "Matt Mo Cookbook <onboarding@resend.dev>";

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// In the account's language ("fr" | "en").
export async function sendPasswordResetEmail(toEmail, resetUrl, lang = "fr") {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(msg(lang, "email.missingKey"));
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
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
  if (error) {
    throw new Error(`Failed to send reset email: ${error.message || error}`);
  }
}
