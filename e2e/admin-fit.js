import bcrypt from "bcryptjs";
import { aiDay } from "../server/src/lib/aiLimit.js";
import { expect } from "./spec-clock.js";

// "The Admin page fits a phone, whatever the accounts' emails are." The Admin page shows people's emails in
// Members, AI usage, an invite code's "joined" line, the Ingredient names card ("Changed by <email>") and the
// Feedback inbox. A phone check of the Admin page used to pass or fail on whichever accounts the other specs had
// made at that moment (they run in parallel against one database). These make the worst case themselves, so the
// answer is the same every time:
//   - seedLongAccounts: accounts of its own with very long emails (one with no place to break a line), their use
//     of Gemini today (one at the limit), and their sign-up through an invite code when one is given;
//   - showLongChange / showLongFeedback: the page is handed a changed name and feedback from those emails by
//     intercepting the answer, so nothing is written to the changes list or the inbox that every other spec counts;
//   - expectAdminFits: the page, and every Admin card on it, is no wider than the screen, with every card loaded.

// A different tag on every call, so two runs (or a retry) never meet. The clock is only a name here.
export const newTag = () => `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

// 80 letters, the longest an invite note can be, with nowhere to break a line.
export const LONG_NOTE = "pourEmilieTremblayGagnonEtSesAmisDuClubDeCuisineDeLaRiveSudDeMontrealQuebecCanadaXY";

export const longEmails = (tag) => [
  `${"abcdefghij".repeat(8)}-${tag}@example.com`, // 80 letters and no dot to break at
  `a.long.address.with.dots+tag.${tag}.1234567890@subdomain.example-company-name.example.com`,
  `émilie.tremblay-gagnon.${tag}@courriel-de-la-famille-tremblay-gagnon.exemple.qc.ca`,
];

// Makes the accounts and returns { emails, remove }. `remove` takes them away again with what hangs off them
// (their use of Gemini today goes with the account).
export async function seedLongAccounts(prisma, tag, { locale = "fr", inviteCodeId = null } = {}) {
  const passwordHash = await bcrypt.hash("longmail-pass123", 4); // nobody logs in as these
  const emails = longEmails(tag);
  const day = aiDay();
  for (const [i, email] of emails.entries()) {
    const user = await prisma.user.create({ data: { email, passwordHash, locale, inviteCodeId, name: "Nom ".repeat(30) } });
    // The last one is past any daily limit, so its "limit reached" pill is on its row too.
    await prisma.aiUsage.create({ data: { userId: user.id, day, count: i === emails.length - 1 ? 999 : i } });
  }
  return { emails, remove: () => prisma.user.deleteMany({ where: { email: { in: emails } } }) };
}

// The Ingredient names card lists every changed name with who changed it. The page gets one more, changed by
// `email`, in the answer to GET /api/ingredient-names. Take it off again with page.unroute(ROUTE_NAMES).
export const ROUTE_NAMES = "**/api/ingredient-names";
export async function showLongChange(page, tag, email) {
  await page.route(ROUTE_NAMES, async (route) => {
    const response = await route.fetch();
    const rows = await response.json();
    rows.push({
      id: `long-change-${tag}`,
      replaces: null,
      hidden: false,
      enOne: `long mail ${tag}`,
      enOther: "",
      frOne: `courriel long ${tag}`,
      frOther: "",
      gender: "m",
      updatedAt: "2026-10-26T15:00:00.000Z",
      updatedBy: email,
    });
    await route.fulfill({ response, json: rows });
  });
}

// The Feedback inbox gets one feedback from each email in the Inbox tab and one in the Archive tab, the first with
// a message of 300 letters in a row. Take it off again with page.unroute(ROUTE_FEEDBACK).
export const ROUTE_FEEDBACK = "**/api/admin/feedback?*";
export async function showLongFeedback(page, emails) {
  const item = (email, i, extra = {}) => ({
    id: `long-feedback-${i}`,
    email,
    kind: ["wrong", "idea", "other"][i % 3],
    message: i === 0 ? "Z".repeat(300) : "Un message ordinaire, assez long pour passer sur plusieurs lignes dans la boîte de réception.",
    page: "home",
    locale: i % 2 ? "en" : "fr",
    device: "phone",
    screen: "390x844",
    browser: "Chrome 140 on Android 15 SamsungGalaxyS24UltraWithAnUnbrokenName",
    appVersion: "abcdef1234567890abcdef1234567890abcdef12",
    errorName: i === 0 ? "TypeErrorWithAnExtremelyLongNameThatNeverBreaksAnywhereAtAll" : null,
    createdAt: "2026-10-26T15:00:00.000Z",
    doneAt: null,
    archivedAt: null,
    ...extra,
  });
  await page.route(ROUTE_FEEDBACK, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const archive = new URL(route.request().url()).searchParams.get("box") === "archive";
    const items = emails.map((email, i) => item(email, i, archive ? { archivedAt: "2026-10-26T16:00:00.000Z" } : {}));
    await route.fulfill({ json: { items, nextCursor: null, counts: { inbox: emails.length, archive: emails.length, notDone: emails.length } } });
  });
}

// Waits until the Admin page has drawn what it loads (a card that is still "Loading…" is not the worst case).
export async function adminLoaded(page) {
  await expect(page.locator(".riso-admin-members .riso-admin-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".riso-admin-ai .riso-admin-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".riso-admin-invites .riso-admin-code").first()).toBeVisible();
  await expect(page.locator(".riso-admin-names .riso-admin-namesearch")).toBeVisible();
}

// The page and every Admin card on it (Admin: Project HQ, Members, AI usage, Ingredient names, Invite codes; the
// Feedback inbox: its one card) are no wider than the screen, and nothing inside a card sticks out of it.
// `cards` is how many Admin cards the page must have (5 on Admin, 1 on the Feedback inbox), and `seen` are texts
// that must be on the page, so a check can't pass on a page that lost a card or that the worst case never reached.
// Returns the cards' titles.
export async function expectAdminFits(page, { cards, seen = [] }) {
  for (const text of seen) await expect(page.locator(".riso-admin").first()).toContainText(text);
  const max = page.viewportSize().width;
  const report = await page.evaluate((limit) => {
    const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : ""}`;
    const out = { page: document.documentElement.scrollWidth, titles: [], wide: [] };
    for (const card of document.querySelectorAll(".riso-admin-card")) {
      const title = (card.querySelector("h2")?.textContent || "").trim();
      out.titles.push(title);
      const box = card.getBoundingClientRect();
      if (box.left < -1 || box.right > limit + 1 || card.scrollWidth > card.clientWidth + 1) {
        out.wide.push(`${title}: the card ends at ${Math.round(box.right)}px and its content is ${card.scrollWidth}px wide`);
      }
      for (const el of card.querySelectorAll("*")) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > limit + 1 || r.left < -1)) {
          out.wide.push(`${title}: ${name(el)} ends at ${Math.round(r.right)}px: "${(el.textContent || "").trim().slice(0, 50)}"`);
        }
      }
    }
    return out;
  }, max);
  expect(report.titles.length, `the Admin cards on the page: ${report.titles.join(", ")}`).toBe(cards);
  expect(report.wide, `what is wider than the ${max}px screen`).toEqual([]);
  expect(report.page, `the page is wider than the ${max}px screen`).toBeLessThanOrEqual(max);
  return report.titles;
}
