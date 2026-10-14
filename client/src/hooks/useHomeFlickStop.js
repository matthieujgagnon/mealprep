import { useEffect, useRef } from "react";
import { flickStop } from "../lib/homeScreens.js";

// Home's flick stop on a phone (lib/homeScreens.js, HOME_FLICK_STOP; Home turns
// it on only in scrollMode "flick-stop"): a flick never carries the scroller
// across the join between the two screens. A finger on the screen is never
// stopped, so dragging and reading stay free. Once the finger lifts from a swipe,
// `flickStop` decides, and a stop puts the scroller exactly on the join and holds
// it there until the coasting is over: scrolling is turned off (that ends the
// coasting) until the scroller has been still for a moment; on a slow device the
// coasting can run on for a few frames before that takes hold, and what it moves
// past the join is put back. It listens to touch only: a mouse wheel or a
// trackpad never meets it (a computer scrolls Home freely).
//
// It only ever catches a coast. A scroll the person or the app asks for is never
// stopped: anything the person does (a finger or the mouse pressed, a key, the
// focus moving: a link, a card, a dot, scrollIntoView after a tap) ends the
// coast and the hold at once, and the hold only puts back movement past the join
// in the coast's own direction (anything else ends it).
//
// Returns a function that forgets any coast in progress: a dot's jump calls it too.
const QUIET_MS = 200; // a coast is over after this long without a scroll
const STILL_MS = 100; // after a stop, scrolling comes back once still this long
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

export function useHomeFlickStop(scrollerRef, screen2Ref, on) {
  const forget = useRef(() => {});

  useEffect(() => {
    const scroller = scrollerRef.current;
    const second = screen2Ref.current;
    if (!on || !scroller || !second) return undefined;
    let touching = false; // a finger is down
    let swiped = false; // ... and has moved the scroller
    let coastFrom = null; // where the finger lifted, while the coast may still cross the join
    let stopped = null; // { top, dir } while held on the join after a stop
    let last = scroller.scrollTop;
    let quiet = 0;
    let still = 0;

    // Straight there, whatever the scroller's own scroll-behavior says.
    const jump = (top) => {
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = top;
      scroller.style.scrollBehavior = "";
      last = top;
    };
    const release = () => {
      clearTimeout(still);
      stopped = null;
      scroller.style.overflowY = "";
    };
    const end = () => {
      coastFrom = null;
      release();
    };
    const later = () => {
      clearTimeout(quiet);
      quiet = setTimeout(end, QUIET_MS);
    };
    // A stop holds until the scroller has been still a moment.
    const stillLater = () => {
      clearTimeout(still);
      still = setTimeout(release, STILL_MS);
    };
    const stopAt = (top, dir) => {
      coastFrom = null;
      stopped = { top, dir };
      scroller.style.overflowY = "hidden";
      stillLater();
      jump(top);
    };

    const onScroll = () => {
      const top = scroller.scrollTop;
      const step = top - last;
      last = top;
      if (touching) {
        if (step) swiped = true;
        return;
      }
      if (stopped) {
        if (Math.abs(top - stopped.top) <= 0.5) return; // where it was put
        const past = stopped.dir > 0 ? top > stopped.top : top < stopped.top;
        if (past) {
          jump(stopped.top); // the coasting, still running on: back to the join
          stillLater();
          return;
        }
        end(); // something else moved it: leave it where it goes
        return;
      }
      if (coastFrom == null) return;
      later();
      const to = flickStop({ from: coastFrom, top, step, screen2Top: second.offsetTop, clientHeight: scroller.clientHeight });
      if (to != null) stopAt(to, Math.sign(step));
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
      coastFrom = scroller.scrollTop;
      later();
    };
    const onKey = (e) => {
      if (!MODIFIERS.has(e.key)) end();
    };

    forget.current = end;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    // Anywhere on the page, before anything else sees it.
    document.addEventListener("pointerdown", end, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", end, true);
    return () => {
      forget.current = () => {};
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("pointerdown", end, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", end, true);
      clearTimeout(quiet);
      release();
    };
  }, [scrollerRef, screen2Ref, on]);

  return () => forget.current();
}
