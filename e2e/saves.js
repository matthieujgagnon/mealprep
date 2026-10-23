// A change shows on screen at once and is saved behind it. A test that reloads the page, or reads
// the server, right after a tap has to wait for that save first, or on a slow runner it sees the
// state from before the tap.

// Starts waiting for the answer to a save: a POST, PUT or DELETE whose address contains `path` and
// (when given) whose body contains `body`. Call it BEFORE the tap that sends the save, and `await`
// the result after the tap. For a state that comes back to where it began (a box tapped three
// times), this is the way to know the last save has landed: the saves of one item go one after
// another, so the answer to the last one means the earlier ones are in too.
export function saveAnswered(page, method, path, body) {
  const answered = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === method && response.url().includes(path) && (!body || (request.postData() || "").includes(body));
  });
  answered.catch(() => {}); // if the test fails before it awaits, this is not a second failure
  return answered;
}
