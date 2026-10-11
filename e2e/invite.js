// The invite code the browser tests sign up with. Signup needs a code, so
// global-setup.js (run once before the tests, against the test database only)
// makes this one: it never expires and has uses for every test account.
// "E2E2-TEST" is written the way codes are stored (4 letters/digits, a dash,
// 4 more).
export const E2E_INVITE = "E2E2-TEST";
