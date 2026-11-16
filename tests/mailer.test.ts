import { test, describe } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of keys) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function freshMailer(): Promise<typeof import("../lib/mailer")> {
  return import(`../lib/mailer.ts?case=${Date.now()}-${Math.random()}`) as any;
}

describe("lib/mailer.ts", () => {
  test("uses Gmail SMTP when EMAIL_USER/EMAIL_PASS are set outside test env", async () => {
    const snapshot = snapshotEnv(["NODE_ENV", "EMAIL_USER", "EMAIL_PASS"]);
    const originalCreateTransport = nodemailer.createTransport;
    let capturedOptions: any = null;
    (nodemailer as any).createTransport = (options: any) => {
      capturedOptions = options;
      return { sendMail: async () => ({ response: "250 OK" }) };
    };
    try {
      (process.env as any).NODE_ENV = "development";
      process.env.EMAIL_USER = "demo@example.com";
      process.env.EMAIL_PASS = "app-password";
      const mailer = await freshMailer();
      await mailer.sendMail("to@example.com", "Subject", "<p>Body</p>");
      assert.equal(capturedOptions.service, "gmail");
      assert.equal(capturedOptions.auth.user, "demo@example.com");
      assert.equal(capturedOptions.auth.pass, "app-password");
    } finally {
      (nodemailer as any).createTransport = originalCreateTransport;
      restoreEnv(snapshot);
    }
  });

  test("falls back to jsonTransport when EMAIL_USER is not set outside test env", async () => {
    const snapshot = snapshotEnv(["NODE_ENV", "EMAIL_USER", "EMAIL_PASS"]);
    const originalCreateTransport = nodemailer.createTransport;
    let capturedOptions: any = null;
    (nodemailer as any).createTransport = (options: any) => {
      capturedOptions = options;
      return { sendMail: async () => ({ response: "250 OK" }) };
    };
    try {
      (process.env as any).NODE_ENV = "development";
      delete process.env.EMAIL_USER;
      delete process.env.EMAIL_PASS;
      const mailer = await freshMailer();
      await mailer.sendMail("to@example.com", "Subject", "<p>Body</p>");
      assert.equal(capturedOptions.jsonTransport, true);
    } finally {
      (nodemailer as any).createTransport = originalCreateTransport;
      restoreEnv(snapshot);
    }
  });

  test("falls back to a disposable Ethereal inbox when EMAIL_USER is set without EMAIL_PASS", async () => {
    const snapshot = snapshotEnv(["NODE_ENV", "EMAIL_USER", "EMAIL_PASS"]);
    const originalCreateTransport = nodemailer.createTransport;
    const originalCreateTestAccount = nodemailer.createTestAccount;
    const originalGetTestMessageUrl = nodemailer.getTestMessageUrl;
    let capturedOptions: any = null;
    (nodemailer as any).createTestAccount = async () => ({
      user: "ethereal-user",
      pass: "ethereal-pass",
      smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
    });
    (nodemailer as any).createTransport = (options: any) => {
      capturedOptions = options;
      return { sendMail: async () => ({ response: "250 queued [STATUS=OK URL=https://ethereal.email/message/fake]" }) };
    };
    (nodemailer as any).getTestMessageUrl = () => "https://ethereal.email/message/fake";
    try {
      (process.env as any).NODE_ENV = "development";
      process.env.EMAIL_USER = "demo@example.com";
      delete process.env.EMAIL_PASS;
      const mailer = await freshMailer();
      const info = await mailer.sendMail("to@example.com", "Subject", "<p>Body</p>");
      assert.equal(capturedOptions.host, "smtp.ethereal.email");
      assert.equal(capturedOptions.auth.user, "ethereal-user");
      assert.equal(info.response, "250 queued [STATUS=OK URL=https://ethereal.email/message/fake]");
    } finally {
      (nodemailer as any).createTransport = originalCreateTransport;
      (nodemailer as any).createTestAccount = originalCreateTestAccount;
      (nodemailer as any).getTestMessageUrl = originalGetTestMessageUrl;
      restoreEnv(snapshot);
    }
  });

  test("reuses the same transporter promise across repeated sendMail calls", async () => {
    const snapshot = snapshotEnv(["NODE_ENV"]);
    let createCount = 0;
    const originalCreateTransport = nodemailer.createTransport;
    (nodemailer as any).createTransport = (options: any) => {
      createCount++;
      return { sendMail: async () => ({ response: "250 OK" }) };
    };
    try {
      (process.env as any).NODE_ENV = "test";
      const mailer = await freshMailer();
      await mailer.sendMail("a@example.com", "S1", "<p>1</p>");
      await mailer.sendMail("b@example.com", "S2", "<p>2</p>");
      assert.equal(createCount, 1);
    } finally {
      (nodemailer as any).createTransport = originalCreateTransport;
      restoreEnv(snapshot);
    }
  });
});
