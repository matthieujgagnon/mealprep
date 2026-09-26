import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Verifies the actual reset mechanism end-to-end - not real email delivery
// (nothing in CI has a working RESEND_API_KEY), but everything downstream of
// "the user clicked the link in their email": the token, the new password,
// and that every other session for the account gets signed out.
const prisma = new PrismaClient();

function uniqueEmail() {
  return `smoke-reset+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test("reset link sets a new password and signs out other sessions", async ({ page }) => {
  const email = uniqueEmail();
  const oldPassword = "originalpass123";
  const newPassword = "brandnewpass456";

  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', oldPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();

  // Stands in for "the link mailed by /api/auth/forgot-password" - same
  // token shape (a PasswordResetToken row's id), just created directly
  // instead of waiting on a real inbox.
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const resetToken = await prisma.passwordResetToken.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await page.goto(`/reset-password?token=${resetToken.id}`);
  const passwordInputs = page.locator('input[autocomplete="new-password"]');
  await passwordInputs.nth(0).fill(newPassword);
  await passwordInputs.nth(1).fill(newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible();

  // The signup session should be dead now - reloading the (cookie-holding)
  // app root should bounce back to the login form, not stay signed in.
  // ("Log in" is ambiguous here - it's both the mode tab and the submit
  // button - so this checks for the form shell instead of that text.)
  await page.goto("/");
  await expect(page.locator(".auth-mode-tabs")).toBeVisible();

  const submitButton = page.locator(".auth-form button[type='submit']");

  // Old password no longer works.
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', oldPassword);
  await submitButton.click();
  await expect(page.getByText("Incorrect email or password")).toBeVisible();

  // New password does.
  await page.fill('input[type="password"]', newPassword);
  await submitButton.click();
  await expect(page.getByText(email)).toBeVisible();
});

test("a used reset link can't be replayed", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "originalpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const resetToken = await prisma.passwordResetToken.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await page.goto(`/reset-password?token=${resetToken.id}`);
  const firstInputs = page.locator('input[autocomplete="new-password"]');
  await firstInputs.nth(0).fill("firstnewpass123");
  await firstInputs.nth(1).fill("firstnewpass123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible();

  // Same link again - should be rejected as already used, not silently
  // change the password a second time.
  await page.goto(`/reset-password?token=${resetToken.id}`);
  const secondInputs = page.locator('input[autocomplete="new-password"]');
  await secondInputs.nth(0).fill("secondnewpass456");
  await secondInputs.nth(1).fill("secondnewpass456");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});
