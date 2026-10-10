// Saves that are still on their way, by part of the app ("area").
//
// A change shows on screen at once and is saved in the background. If the next
// screen asks the server for the same data before that save has landed, it gets
// the old answer and shows it. So `api.js` keeps every save here, and a read of
// the same area first waits for the saves already sent (`afterSaves`).
//
// A screen that loads several things together can also ask whether anything was
// saved while it was loading (`savesVersion` changes when a save starts and
// when it ends), and load again if so.
const inFlight = new Map(); // area -> Set of promises that settle when a save ends
const versions = new Map(); // area -> number

const bump = (area) => versions.set(area, (versions.get(area) || 0) + 1);

// Remembers `promise` (a save) until it ends, whether it worked or not. Gives the same promise back.
export function noteSave(area, promise) {
  bump(area);
  const set = inFlight.get(area) || new Set();
  inFlight.set(area, set);
  const ended = promise
    .then(
      () => undefined,
      () => undefined
    )
    .then(() => {
      set.delete(ended);
      bump(area);
    });
  set.add(ended);
  return promise;
}

// Resolves once no save is on its way for this area.
export async function afterSaves(area) {
  const set = inFlight.get(area);
  while (set && set.size > 0) await Promise.all([...set]);
}

export function savesVersion(area) {
  return versions.get(area) || 0;
}
