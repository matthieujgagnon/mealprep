import { Resend } from "resend";

// Same "just ask the app owner to configure it" pattern as GEMINI_API_KEY in
// routes/flyers.js - no key means the feature can't work, but everything
// else in the app should keep working regardless.
const FROM_ADDRESS = process.env.RESET_EMAIL_FROM || "Matt Mo Cookbook <onboarding@resend.dev>";

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Server is missing a valid RESEND_API_KEY. Ask the app owner to configure it.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: "Reset your password",
    html: `
      <p>Someone (hopefully you) asked to reset the password for this account.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a>. This link works once and expires in an hour.</p>
      <p>If you didn't ask for this, you can safely ignore this email — your password won't change.</p>
    `,
  });
  if (error) {
    throw new Error(`Failed to send reset email: ${error.message || error}`);
  }
}
