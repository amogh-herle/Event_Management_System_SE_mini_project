import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendMail, resetMailTransportForTests } from "../lib/mailer";
import { getRecentLogs, clearRecentLogs } from "../lib/logger";

// NFR-007: notifications are core business logic, so every mail-transport
// branch in lib/mailer.ts is covered here. nodemailer itself is mocked, so
// these tests never open a network connection or send real email.

const ENV_KEYS = ["NODE_ENV", "EMAIL_USER", "EMAIL_PASS"] as const;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete env[key];
    else env[key] = values[key];
  }
}

/** Replaces nodemailer.createTransport with a fake that records its options. */
function fakeTransport(t: { mock: typeof test.mock }, previewUrl: string | false = false) {
  const created: any[] = [];
  const sent: any[] = [];
  t.mock.method(nodemailer, "createTransport", (options: any) => {
    created.push(options);
    return { sendMail: async (mail: any) => (sent.push(mail), { messageId: "fake-id" }) } as any;
  });
  t.mock.method(nodemailer, "getTestMessageUrl", () => previewUrl);
  return { created, sent };
}

test.beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  resetMailTransportForTests();
  clearRecentLogs();
});

test.afterEach(() => {
  const env = process.env as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete env[key];
    else env[key] = savedEnv[key];
  }
  resetMailTransportForTests();
});

test("mailer: test environment always uses the in-memory JSON transport", async (t) => {
  setEnv({ NODE_ENV: "test", EMAIL_USER: "real@gmail.com", EMAIL_PASS: "app-password" });
  const { created, sent } = fakeTransport(t);

  const info = await sendMail("a@test.com", "Hello", "<p>Hi</p>");

  assert.deepEqual(created, [{ jsonTransport: true }]);
  assert.equal(info.messageId, "fake-id");
  assert.equal(sent[0].to, "a@test.com");
  assert.equal(sent[0].subject, "Hello");
  assert.equal(sent[0].html, "<p>Hi</p>");
  assert.match(sent[0].from, /Event Management System/);
});

test("mailer: Gmail SMTP is used when EMAIL_USER and EMAIL_PASS are set", async (t) => {
  setEnv({ NODE_ENV: "production", EMAIL_USER: "real@gmail.com", EMAIL_PASS: "app-password" });
  const { created } = fakeTransport(t);

  await sendMail("a@test.com", "Hello", "<p>Hi</p>");

  assert.deepEqual(created, [
    { service: "gmail", auth: { user: "real@gmail.com", pass: "app-password" } },
  ]);
});

test("mailer: falls back to the JSON transport when no credentials are configured", async (t) => {
  setEnv({ NODE_ENV: "development" });
  const { created } = fakeTransport(t);

  await sendMail("a@test.com", "Hello", "<p>Hi</p>");

  assert.deepEqual(created, [{ jsonTransport: true }]);
});

test("mailer: uses an Ethereal inbox and logs a WARN when EMAIL_PASS is missing", async (t) => {
  setEnv({ NODE_ENV: "development", EMAIL_USER: "real@gmail.com" });
  t.mock.method(nodemailer, "createTestAccount", async () => ({
    user: "ethereal-user",
    pass: "ethereal-pass",
    smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
  }));
  const { created } = fakeTransport(t, "https://ethereal.email/message/abc");

  await sendMail("a@test.com", "Hello", "<p>Hi</p>");

  assert.deepEqual(created, [
    {
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: "ethereal-user", pass: "ethereal-pass" },
    },
  ]);
  const logs = getRecentLogs();
  assert.equal(logs[0].severity, "WARN");
  assert.equal(logs[0].source, "mailer");
  assert.equal(logs[1].severity, "INFO");
  assert.deepEqual(logs[1].context, { previewUrl: "https://ethereal.email/message/abc" });
});

test("mailer: the transport is created once and reused for later sends", async (t) => {
  setEnv({ NODE_ENV: "test" });
  const { created, sent } = fakeTransport(t);

  await sendMail("a@test.com", "One", "<p>1</p>");
  await sendMail("b@test.com", "Two", "<p>2</p>");

  assert.equal(created.length, 1);
  assert.equal(sent.length, 2);
});
