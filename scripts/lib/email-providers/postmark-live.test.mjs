// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { verifyPostmarkLive } from "./postmark-live.mjs";

const secret = ["fixture", "postmark", "webhook", "value"].join("-");
const serverToken = ["fixture", "postmark", "server", "value"].join("-");
const testToken = ["POSTMARK", "API", "TEST"].join("_");

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function workingFetch() {
  return vi.fn(async (url, options = {}) => {
    if (url.endsWith("/message-streams/outbound")) {
      return response({ ID: "outbound", MessageStreamType: "Transactional", ArchivedAt: null });
    }
    if (url.includes("/webhooks?")) {
      return response({
        Webhooks: [{
          Url: "https://project.convex.site/postmark/webhook",
          Status: "verified",
          HttpHeaders: [{ Name: "X-Postmark-Secret", Value: secret }],
          Triggers: {
            Delivery: { Enabled: true },
            Bounce: { Enabled: true },
            SpamComplaint: { Enabled: true },
          },
        }],
      });
    }
    if (url.endsWith("/email") && options.method === "POST") {
      return response({ ErrorCode: 0, MessageID: "message-fixture-id", Message: "OK" });
    }
    return response({}, 404);
  });
}

function options(overrides = {}) {
  return {
    serverToken,
    webhookSecret: secret,
    from: "Product <support@product.com>",
    fetchImpl: workingFetch(),
    ...overrides,
  };
}

describe("Postmark production verification", () => {
  it("verifies the stream, webhook, and safe live send", async () => {
    const input = options();
    await expect(verifyPostmarkLive(input)).resolves.toMatchObject({ status: "PASS" });
    const send = input.fetchImpl.mock.calls.find(([url]) => url.endsWith("/email"));
    expect(JSON.parse(send[1].body).To).toBe("test@blackhole.postmarkapp.com");
    expect(send[1].headers["X-Postmark-Server-Token"]).toBe(serverToken);
  });

  it("rejects the non-delivery test token for production", async () => {
    await expect(verifyPostmarkLive(options({ serverToken: testToken }))).rejects.toThrow(/live server token/);
  });

  it("requires an active transactional stream", async () => {
    const fetchImpl = workingFetch();
    fetchImpl.mockResolvedValueOnce(response({ ID: "outbound", MessageStreamType: "Broadcasts", ArchivedAt: null }));
    await expect(verifyPostmarkLive(options({ fetchImpl }))).rejects.toThrow(/transactional/);
  });

  it("requires a verified webhook with every lifecycle trigger", async () => {
    const fetchImpl = workingFetch();
    fetchImpl
      .mockResolvedValueOnce(response({ ID: "outbound", MessageStreamType: "Transactional", ArchivedAt: null }))
      .mockResolvedValueOnce(response({ Webhooks: [] }));
    await expect(verifyPostmarkLive(options({ fetchImpl }))).rejects.toThrow(/verified HTTPS webhook/);
  });

  it("rejects a webhook whose authentication does not match", async () => {
    const fetchImpl = workingFetch();
    fetchImpl
      .mockResolvedValueOnce(response({ ID: "outbound", MessageStreamType: "Transactional", ArchivedAt: null }))
      .mockResolvedValueOnce(response({
        Webhooks: [{
          Url: "https://project.convex.site/postmark/webhook",
          Status: "verified",
          HttpAuth: { Username: "postmark", Password: "wrong" },
          Triggers: {
            Delivery: { Enabled: true },
            Bounce: { Enabled: true },
            SpamComplaint: { Enabled: true },
          },
        }],
      }));
    await expect(verifyPostmarkLive(options({ fetchImpl }))).rejects.toThrow(/authentication/);
  });

  it("rejects an unverified sender through the live send response", async () => {
    const fetchImpl = workingFetch();
    fetchImpl.mockResolvedValueOnce(response({ ID: "outbound", MessageStreamType: "Transactional", ArchivedAt: null }));
    fetchImpl.mockResolvedValueOnce(response({
      Webhooks: [{
        Url: "https://project.convex.site/postmark/webhook",
        Status: "verified",
        HttpHeaders: [{ Name: "X-Postmark-Secret", Value: secret }],
        Triggers: {
          Delivery: { Enabled: true },
          Bounce: { Enabled: true },
          SpamComplaint: { Enabled: true },
        },
      }],
    }));
    fetchImpl.mockResolvedValueOnce(response({ ErrorCode: 300, Message: "Invalid From" }, 422));
    await expect(verifyPostmarkLive(options({ fetchImpl }))).rejects.toThrow(/HTTP 422/);
  });

  it("does not expose the token in remote failures", async () => {
    const fetchImpl = vi.fn(async () => response({ Message: "bad token" }, 401));
    await expect(verifyPostmarkLive(options({ fetchImpl }))).rejects.not.toThrow(new RegExp(serverToken));
  });
});
