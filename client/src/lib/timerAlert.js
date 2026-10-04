// What happens when a step's timer runs out, the same on the recipe card and
// in Cook mode: a short beep and, when allowed, a notification.
import { t } from "../i18n/index.js";

// A short beep, synthesized so there's no audio asset to ship. Silently
// no-ops if Web Audio is unavailable or blocked.
export function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // Audio unavailable - the TIME'S UP label is the fallback signal.
  }
}

// Asked once, on the first timer start, so "time's up" can notify.
export function askForNotifications() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notifyTimeUp(body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(t("cookMode.timeUp"), { body });
  } catch {
    // Some contexts need a service worker; the beep already fired.
  }
}
