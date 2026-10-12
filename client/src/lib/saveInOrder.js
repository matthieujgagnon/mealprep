import { noteSave } from "./pendingSaves.js";

// Saves for one thing go out one at a time, in the order they were made, so
// the last change is the one the server keeps whatever the network does. Quick
// taps on a slow phone used to send their saves together, and the server could
// finish them in another order than the taps (the screen said "queued", a
// reload said "bought").
//
// `run(key, save)` queues `save` (a function returning a promise) behind the
// saves already queued for `key`, and resolves with { ok, error, latest }:
// `latest` is true when no later save was queued for the same key, so only
// the newest tap undoes its change when it fails. With `area`, the whole queue
// counts as one save in progress for pendingSaves from the moment it is made,
// so a read waits for saves that haven't started yet too.
export function saveInOrder({ area } = {}) {
  const chains = new Map(); // key -> the promise of its last save
  const tickets = new Map(); // key -> the number of the newest save
  return {
    run(key, save) {
      const ticket = (tickets.get(key) || 0) + 1;
      tickets.set(key, ticket);
      const latest = () => tickets.get(key) === ticket;
      const done = (chains.get(key) || Promise.resolve()).then(() => save()).then(
        () => ({ ok: true, latest: latest() }),
        (error) => ({ ok: false, error, latest: latest() })
      );
      chains.set(key, done);
      done.then(() => {
        if (chains.get(key) === done) chains.delete(key);
      });
      if (area) noteSave(area, done);
      return done;
    },
  };
}
