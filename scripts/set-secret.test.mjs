// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { validateSecretShape } from "./set-secret.mjs";

test("test-mode credentials pass and live credentials demand a deliberate --prod", () => {
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "sk_test_abc123").ok, true);
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "rk_test_abc123").ok, true);
  assert.equal(validateSecretShape("STRIPE_WEBHOOK_SECRET", "whsec_abc123").ok, true);
  assert.equal(validateSecretShape("RESEND_API_KEY", "re_abc123").ok, true);

  const live = validateSecretShape("STRIPE_SECRET_KEY", "sk_live_abc123");
  assert.equal(live.ok, false);
  assert.match(live.reason, /prod deployment env/);
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "sk_live_abc123", { prod: true }).ok, true);
});

test("malformed values are refused before anything is stored", () => {
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "").ok, false);
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "sk_test with space").ok, false);
  assert.equal(validateSecretShape("STRIPE_SECRET_KEY", "pk_test_wrong_class").ok, false);
  assert.equal(validateSecretShape("SOME_OTHER_NAME", "anything-goes-when-unknown").ok, true);
});
