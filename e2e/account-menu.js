// The header's account area (name, Help, Log out) sits inline when it fits
// on one row, and inside the round avatar menu when it doesn't - on a phone,
// and on a computer in French or with a long name. These find the button
// either way, so a test doesn't depend on how wide the window is.

// The button called `name` ("Help", "Aide", "Log out"...), opening the
// account menu first if that's where it is. Opening it twice is harmless.
export async function accountButton(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible())) await page.locator(".app-header").getByRole("button", { name: /^(Account|Compte)$/ }).click();
  return button;
}

export async function openHelp(page, name = "Help") {
  await (await accountButton(page, name)).click();
}

// The FR | EN switch that's showing, wherever the header put it.
export function langSwitch(page) {
  return page.locator(".app-header .riso-lang-switch:visible");
}
