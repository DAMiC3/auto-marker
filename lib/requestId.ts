// Short per-request correlation id (P4-6). Generated at the top of a route so the
// same token appears in the server log AND in the error response shown to the user;
// when a user reports a failure they can quote the ref and we jump straight to their
// log line instead of guessing. 8 hex chars is plenty to disambiguate within a day.
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}
