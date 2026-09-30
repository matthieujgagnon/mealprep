import Layer from "express/lib/router/layer.js";

// Express 4 doesn't notice a rejected promise from an async route handler,
// so a thrown database error (a unique-constraint race, say) became an
// unhandled rejection that took the whole server down. Every handler
// registered after this module loads passes its rejections to next(err)
// instead, which the error handler in index.js turns into a 500 response.
// (The same trick as the express-async-errors package.)
function wrap(fn) {
  const wrapped = function (...args) {
    const result = fn.apply(this, args);
    const next = args.length === 5 ? args[2] : args[args.length - 1];
    if (result && typeof result.catch === "function" && typeof next === "function") {
      result.catch((err) => next(err));
    }
    return result;
  };
  // Express tells error handlers (4 arguments) apart by arity.
  Object.defineProperty(wrapped, "length", { value: fn.length });
  return wrapped;
}

Object.defineProperty(Layer.prototype, "handle", {
  enumerable: true,
  configurable: true,
  get() {
    return this.__handle;
  },
  set(fn) {
    this.__handle = wrap(fn);
  },
});
