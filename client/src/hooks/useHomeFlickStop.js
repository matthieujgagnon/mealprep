import { useEffect, useRef } from "react";
import { flickStop } from "../lib/homeScreens.js";

// Home's flick stop (lib/homeScreens.js, HOME_FLICK_STOP): while the scroller
// doesn't snap (a phone, a short window), a flick never carries it across the
// join between the two screens. A finger on the screen is never stopped, so
// dragging and reading stay free. Once the finger lifts from a swipe, or while a
// wheel or trackpad turns, `flickStop` decides, and a stop puts the scroller
// exactly on the join:
// - after a swipe, scrolling is turned off for a moment, which ends the coasting;
// - with a wheel or trackpad (whose coasting is a stream of wheel events), the
//   scroller is held on the join while it keeps turning: the wheel events are
//   cancelled where the browser lets them be, and anything that still moves it
//   puts it back. Once the wheel pauses, the next turn carries on. (Turning
//   scrolling off would hand the rest of the turn to the page, which on Home
//   can't scroll, and Chrome then keeps the wheel there.)
//
// `on` is false while the scroller snaps, or with HOME_FLICK_STOP off. Returns a
// function that forgets any coast in progress: a dot's jump calls it, so the
// jump is never stopped.
const HOLD_MS = 80; // how long scrolling is off after a swipe's stop
const QUIET_MS = 200; // a coast, or a turn of the wheel, is over after this long without a scroll

export function useHomeFlickStop(scrollerRef, screen2Ref, on) {
  const forget = useRef(() => {});

  useEffect(() => {
    const scroller = scrollerRef.current;
    const second = screen2Ref.current;
    if (!on || !scroller || !second) return undefined;
    let touching = false; // a finger is down
    let swiped = false; // ... and has moved the scroller
    let coast = null; // { from, wheel } while a coast may still cross the join
    let held = null; // the join, while a wheel stopped there keeps turning
    let last = scroller.scrollTop;
    let quiet = 0;
    let release = 0;

    // Straight there, whatever the scroller's own scroll-behavior says.
    const jump = (top) => {
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = top;
      scroller.style.scrollBehavior = "";
      last = top;
    };
    const end = () => {
      coast = null;
      held = null;
    };
    const later = () => {
      clearTimeout(quiet);
      quiet = setTimeout(end, QUIET_MS);
    };
    const stopAt = (top, wheel) => {
      coast = null;
      if (wheel) {
        held = top;
        jump(top);
        return;
      }
      scroller.style.overflowY = "hidden";
      jump(top);
      clearTimeout(release);
      release = setTimeout(() => {
        if (!touching) jump(top);
        scroller.style.overflowY = "";
      }, HOLD_MS);
    };

    const onScroll = () => {
      const top = scroller.scrollTop;
      const step = top - last;
      last = top;
      if (touching) {
        if (step) swiped = true;
        return;
      }
      if (held != null) {
        if (Math.abs(top - held) > 0.5) jump(held);
        return;
      }
      if (!coast) return;
      later();
      const to = flickStop({ from: coast.from, top, step, screen2Top: second.offsetTop, clientHeight: scroller.clientHeight });
      if (to != null) stopAt(to, coast.wheel);
    };
    const onTouchStart = () => {
      touching = true;
      swiped = false;
      end();
    };
    const onTouchEnd = (e) => {
      if (e.touches.length) return; // another finger is still down
      touching = false;
      if (!swiped) return; // a tap
      coast = { from: scroller.scrollTop, wheel: false };
      later();
    };
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // zooming, or sideways
      later();
      if (held != null) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!coast) coast = { from: scroller.scrollTop, wheel: true };
    };

    forget.current = end;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      forget.current = () => {};
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("wheel", onWheel);
      clearTimeout(quiet);
      clearTimeout(release);
      scroller.style.overflowY = "";
    };
  }, [scrollerRef, screen2Ref, on]);

  return () => forget.current();
}
