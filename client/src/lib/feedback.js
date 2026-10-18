import { getLang } from "../i18n/index.js";
import { PHONE_QUERY } from "../hooks/useIsPhone.js";
import { APP_VERSION } from "./appVersion.js";

// The Feedback form (components/Feedback.jsx). The server checks the same limits
// (server/src/lib/feedback.js); feedback.test.js keeps the two in step.

export const FEEDBACK_KINDS = ["wrong", "idea", "other"];
export const FEEDBACK_MAX_LENGTH = 2000;
// The count under the box shows from here, so it only appears when it matters.
export const COUNTER_FROM = 1800;

// What a kind starts as: "Other" from the menu and Help (the least wrong label if
// the tester never touches it), "Something's wrong" from an error message.
export const DEFAULT_KIND = "other";
export const ERROR_KIND = "wrong";

// The fixed label sent with a "Report a problem" link beside an error message, so
// Matt knows which message the person was looking at. Labels, never the message's text.
export const ERROR_LABELS = {
  load: "LoadError",
  cooked: "CookedError",
  itemForm: "ItemFormError",
  recipeForm: "RecipeFormError",
};

export const showCounter = (text) => text.length >= COUNTER_FROM;
export const canSend = (text, busy = false) => !busy && text.trim().length > 0 && text.length <= FEEDBACK_MAX_LENGTH;

// The page the person is on, kept here so the crash screen (which draws when the app
// itself has stopped) can still say which page it was. App.jsx sets it on every page.
let currentPage = "home";
export function setCurrentPage(page) {
  currentPage = String(page || "home");
}
export function getCurrentPage() {
  return currentPage;
}

// A name the server accepts for an error: only its name ("TypeError"), never its
// text, which can hold anything (an email, a recipe's name). Anything else is "Error".
export function errorNameOf(error) {
  const name = String(error?.name ?? "");
  return /^[A-Za-z][A-Za-z0-9_$.-]{0,59}$/.test(name) ? name : "Error";
}

// What the app attaches to a feedback by itself, and nothing more: the page, the
// language, phone or computer, the window size and the app's version. The browser
// is read by the server from the request, and the time is the server's.
export function feedbackContext({ page = getCurrentPage(), errorName, win = typeof window !== "undefined" ? window : null } = {}) {
  const phone = win?.matchMedia ? win.matchMedia(PHONE_QUERY).matches : false;
  return {
    page,
    locale: getLang(),
    device: phone ? "phone" : "computer",
    screen: `${Math.round(win?.innerWidth ?? 0)}x${Math.round(win?.innerHeight ?? 0)}`,
    appVersion: APP_VERSION,
    ...(errorName ? { errorName } : {}),
  };
}
