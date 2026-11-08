// Waits until something that moves has stopped. A swipe leaves momentum (a list keeps scrolling after the finger
// lifts), and a sheet slides up when it opens: read a position or a scroll while that is still going and a finger
// put there lands where the thing WAS. A finger put on a list that is still flinging stops the fling and never
// becomes a press-and-hold; one put on a tile that is still sliding misses it. So a spec that touches or measures
// right after one of those waits here first.
//
// `read` returns what to watch: a number (a scroll position), a string, or an array of numbers (the boxes of
// the things the finger will go on). It is read every 100 ms until it has been the same three times in a row
// (300 ms), and the wait gives up after 6 seconds with an error that says what it was still doing.
export async function waitUntilStill(page, read, { every = 100, times = 3, tries = 60 } = {}) {
  let last = JSON.stringify(await read());
  let still = 0;
  for (let n = 0; still < times; n++) {
    if (n >= tries) throw new Error(`it never stopped moving; it was still changing at ${last}`);
    await page.waitForTimeout(every);
    const now = JSON.stringify(await read());
    still = now === last ? still + 1 : 0;
    last = now;
  }
}
