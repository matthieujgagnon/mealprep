import { useEffect, useState } from "react";
import { askForNotifications, notifyTimeUp, playBeep } from "../lib/timerAlert.js";

// The step timers of one recipe, shared by the recipe card and Cook mode so
// both behave the same: start, pause, resume, reset, a minute more, and the
// time itself can be edited. Timers are kept by `key` (a step's place in the
// recipe), keep ticking while you look at another step, and beep when one
// runs out.
//
//   timers[key]    { remaining, total, running, justFinished } once started
//   durations[key] a time the user set; otherwise the step's own time is used
//
// `stateFor(key, stepSeconds)` is everything a timer needs to draw itself.
export function useStepTimers({ title, recipeId }) {
  const [timers, setTimers] = useState({});
  const [durations, setDurations] = useState({});
  // Another recipe opens in the same card: its steps start fresh.
  const [owner, setOwner] = useState(recipeId);
  if (owner !== recipeId) {
    setOwner(recipeId);
    setTimers({});
    setDurations({});
  }

  // One interval ticks every running timer.
  useEffect(() => {
    const id = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = {};
        for (const [key, timer] of Object.entries(prev)) {
          if (timer.running && timer.remaining > 0) {
            changed = true;
            const remaining = timer.remaining - 1;
            next[key] = remaining <= 0 ? { ...timer, remaining: 0, running: false, justFinished: true } : { ...timer, remaining };
          } else {
            next[key] = timer;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const done = Object.entries(timers).filter(([, timer]) => timer.justFinished);
    if (done.length === 0) return;
    playBeep();
    notifyTimeUp(title);
    setTimers((prev) => {
      const next = { ...prev };
      for (const [key] of done) next[key] = { ...next[key], justFinished: false };
      return next;
    });
  }, [timers, title]);

  function stateFor(key, stepSeconds) {
    const total = durations[key] ?? stepSeconds;
    const timer = timers[key];
    const remaining = timer ? timer.remaining : total;
    return {
      total,
      remaining,
      running: !!timer?.running,
      finished: !!timer && timer.remaining === 0,
      // Started and then paused part-way: "Resume" rather than "Start".
      paused: !!timer && !timer.running && timer.remaining > 0 && timer.remaining < timer.total,
      changed: remaining !== total,
    };
  }

  // Start; pause or resume once started; start over when it has run out.
  function toggle(key, stepSeconds) {
    askForNotifications();
    const total = durations[key] ?? stepSeconds;
    setTimers((prev) => {
      const timer = prev[key];
      if (!timer || timer.remaining <= 0) return { ...prev, [key]: { remaining: total, total, running: true } };
      return { ...prev, [key]: { ...timer, running: !timer.running } };
    });
  }

  function addSeconds(key, stepSeconds, seconds) {
    const total = durations[key] ?? stepSeconds;
    setTimers((prev) => {
      const timer = prev[key] || { remaining: total, total, running: false };
      return { ...prev, [key]: { ...timer, remaining: timer.remaining + seconds } };
    });
  }

  // Back to the full time, stopped.
  function reset(key) {
    setTimers((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // A new time for this timer: it stops and shows the new time.
  function setDuration(key, seconds) {
    const total = Math.max(1, Math.round(seconds));
    setDurations((prev) => ({ ...prev, [key]: total }));
    reset(key);
  }

  const anyRunning = Object.values(timers).some((timer) => timer.running);
  // Timers running now, as [key, remaining] pairs.
  const running = Object.entries(timers)
    .filter(([, timer]) => timer.running)
    .map(([key, timer]) => ({ key: Number(key), remaining: timer.remaining }));

  return { stateFor, toggle, addSeconds, reset, setDuration, anyRunning, running };
}
