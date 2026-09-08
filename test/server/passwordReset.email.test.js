import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what would be handed to SMTP without sending anything.
const sendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail, options: { host: "smtp.test" } }) },
}));
vi.mock("../../server/services/configService.js", () => ({
  default: {
    getSettingsEncryptionKey: () => "0".repeat(32),
    get: () => null,
    isInitialized: () => true,
  },
}));
vi.mock("../../server/models/database.js", () => ({
  default: { getType: () => "sqlite", get: vi.fn(), all: vi.fn(), run: vi.fn() },
}));

const { default: emailService } = await import("../../server/services/emailService.js");

/** Pull the composed mail out of the sendMail spy. */
async function compose(...args) {
  sendMail.mockClear();
  await emailService.sendPasswordReset(...args);
  return sendMail.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({ messageId: "test-id" });
});

describe("sendPasswordReset wording", () => {
  it("uses self-service wording when the user asked", async () => {
    const mail = await compose("u@example.com", "Rita", "tok-1", { selfInitiated: true });

    expect(mail.html).toContain("We received a request to reset the password");
    expect(mail.text).toContain("We received a request to reset the password");
    // Telling a user an admin reset their password when they clicked the link
    // themselves reads like an account compromise.
    expect(mail.html).not.toContain("An administrator has initiated");
    expect(mail.text).not.toContain("An administrator has initiated");
    expect(mail.html).not.toContain("initiated by an administrator");
  });

  it("keeps admin wording when an admin triggered it", async () => {
    const mail = await compose("u@example.com", "Rita", "tok-2", { selfInitiated: false });

    expect(mail.html).toContain("An administrator has initiated");
    expect(mail.text).toContain("An administrator has initiated");
    expect(mail.html).toContain("initiated by an administrator");
  });

  it("defaults to admin wording, preserving the existing admin call site", async () => {
    // routes/admin.js calls this positionally with no options object.
    const mail = await compose("u@example.com", "Rita", "tok-3");

    expect(mail.html).toContain("An administrator has initiated");
  });
});

describe("sendPasswordReset content", () => {
  it("embeds the token in a reset link, in both html and text", async () => {
    const mail = await compose("u@example.com", "Rita", "abc-123", { selfInitiated: true });

    expect(mail.html).toContain("/reset-password?token=abc-123");
    expect(mail.text).toContain("/reset-password?token=abc-123");
  });

  it("addresses the recipient and states the expiry", async () => {
    const mail = await compose("u@example.com", "Rita", "tok", { selfInitiated: true });

    expect(mail.to).toBe("u@example.com");
    expect(mail.html).toContain("Rita");
    expect(mail.html).toMatch(/expire in 1 hour/i);
  });

  it("always sends a plain-text alternative", async () => {
    const mail = await compose("u@example.com", "Rita", "tok", { selfInitiated: true });

    expect(mail.text).toBeTruthy();
    expect(mail.text).not.toContain("<");
  });

  it("reports success back to the caller", async () => {
    const result = await emailService.sendPasswordReset("u@example.com", "R", "t", {
      selfInitiated: true,
    });

    expect(result.success).toBe(true);
  });

  it("falls back to console logging in development when SMTP rejects", async () => {
    sendMail.mockRejectedValue(new Error("mailbox unavailable"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await emailService.sendPasswordReset("u@example.com", "R", "t", {
      selfInitiated: true,
    });

    // Deliberate: in development a broken SMTP config must not block the
    // flow, so the reset URL goes to the console and the call reports success.
    expect(result.success).toBe(true);
    expect(log.mock.calls.flat().join(" ")).toContain("PASSWORD RESET EMAIL");
  });

  it("reports failure in production when SMTP rejects", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    sendMail.mockRejectedValue(new Error("mailbox unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Resolves with { success: false } rather than throwing -- that is the
      // contract routes/auth.js relies on, so it can log for operators while
      // still returning the same non-enumerable response to the client.
      const result = await emailService.sendPasswordReset("u@example.com", "R", "t", {
        selfInitiated: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/mailbox unavailable/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
