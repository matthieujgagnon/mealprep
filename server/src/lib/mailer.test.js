import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Resend is never called: the mailer gets this stand-in, which answers (or
// fails) as each test says.
const resend = vi.hoisted(() => ({ send: null, sent: [] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (message) => {
        resend.sent.push(message);
        return resend.send(message);
      },
    };
  },
}));

const { EMAIL_FAILURE_MEMORY_MS, emailConfigured, emailFrom, emailStatus, forgetEmailFailure, sendEmail, sendFeedbackEmail, sendPasswordResetEmail } =
  await import("./mailer.js");

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "RESET_EMAIL_FROM"];

describe("the shared sender", () => {
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
    resend.sent.length = 0;
    resend.send = async () => ({ data: { id: "email-1" }, error: null });
    forgetEmailFailure();
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    forgetEmailFailure();
  });

  const setUp = () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Matt Mo Cookbook <noreply@example.com>";
  };

  describe("is set up only with a key and a sender address", () => {
    it("has no built-in sender, so Resend's test address is never used", () => {
      process.env.RESEND_API_KEY = "re_test";
      expect(emailFrom()).toBe("");
      expect(emailConfigured()).toBe(false);
      expect(emailStatus()).toBe("notSetUp");
    });

    it("needs the key as well as the address", () => {
      process.env.EMAIL_FROM = "noreply@example.com";
      expect(emailStatus()).toBe("notSetUp");
      process.env.RESEND_API_KEY = "   ";
      expect(emailStatus()).toBe("notSetUp");
      process.env.RESEND_API_KEY = "re_test";
      expect(emailStatus()).toBe("ready");
    });

    it("still reads RESET_EMAIL_FROM, its old name, when EMAIL_FROM isn't set", () => {
      process.env.RESEND_API_KEY = "re_test";
      process.env.RESET_EMAIL_FROM = "old@example.com";
      expect(emailFrom()).toBe("old@example.com");
      process.env.EMAIL_FROM = "new@example.com";
      expect(emailFrom()).toBe("new@example.com");
    });
  });

  it("sends from EMAIL_FROM", async () => {
    setUp();
    await sendEmail({ to: "friend@example.com", subject: "Hello", html: "<p>Hi</p>" });
    expect(resend.sent).toEqual([
      { from: "Matt Mo Cookbook <noreply@example.com>", to: "friend@example.com", subject: "Hello", html: "<p>Hi</p>" },
    ]);
  });

  it("refuses to send, without calling Resend, when it isn't set up", async () => {
    await expect(sendEmail({ to: "friend@example.com", subject: "Hello", html: "" })).rejects.toThrow(/RESEND_API_KEY and EMAIL_FROM/);
    expect(resend.sent).toEqual([]);
  });

  describe("when Resend refuses", () => {
    const testingMode = {
      message: "You can only send testing emails to your own email address (owner@example.com). Please verify a domain at resend.com/domains.",
    };

    it("throws Resend's reason, and counts as failing for 10 minutes, then ready again", async () => {
      setUp();
      resend.send = async () => ({ data: null, error: testingMode });
      await expect(sendEmail({ to: "friend@example.com", subject: "s", html: "" })).rejects.toThrow(/You can only send testing emails/);

      const now = Date.now();
      expect(emailStatus(now)).toBe("failing");
      expect(emailStatus(now + EMAIL_FAILURE_MEMORY_MS - 1000)).toBe("failing");
      expect(emailStatus(now + EMAIL_FAILURE_MEMORY_MS + 1000)).toBe("ready");
    });

    it("counts a network error the same way", async () => {
      setUp();
      resend.send = async () => {
        throw new Error("fetch failed");
      };
      await expect(sendEmail({ to: "friend@example.com", subject: "s", html: "" })).rejects.toThrow("fetch failed");
      expect(emailStatus()).toBe("failing");
    });

    it("forgets the failure after a send that works", async () => {
      setUp();
      resend.send = async () => ({ data: null, error: testingMode });
      await expect(sendEmail({ to: "a@example.com", subject: "s", html: "" })).rejects.toThrow();
      resend.send = async () => ({ data: { id: "email-2" }, error: null });
      await sendEmail({ to: "a@example.com", subject: "s", html: "" });
      expect(emailStatus()).toBe("ready");
    });
  });

  describe("the reset email", () => {
    const url = "https://cookbook.example.com/reset-password?token=abc123";

    it("comes in English, with the link", async () => {
      setUp();
      await sendPasswordResetEmail("friend@example.com", url, "en");
      const [message] = resend.sent;
      expect(message.to).toBe("friend@example.com");
      expect(message.subject).toBe("Reset your password");
      expect(message.html).toContain('lang="en"');
      expect(message.html).toContain(`href="${url}"`);
      expect(message.html).toContain("This link works once and expires in an hour.");
    });

    it("comes in Quebec French, with « vous », and the link", async () => {
      setUp();
      await sendPasswordResetEmail("ami@example.com", url, "fr");
      const [message] = resend.sent;
      expect(message.subject).toBe("Réinitialisez votre mot de passe");
      expect(message.html).toContain('lang="fr"');
      expect(message.html).toContain(`href="${url}"`);
      expect(message.html).toContain("Ce lien ne fonctionne qu'une fois");
      expect(message.html).toContain("vous pouvez ignorer ce courriel");
    });

    it("escapes the link", async () => {
      setUp();
      await sendPasswordResetEmail("a@example.com", 'https://x.example/?a=1&b="2"', "en");
      expect(resend.sent[0].html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
    });
  });

  describe("an email that says nothing about the reset links (remember: false)", () => {
    it("neither marks email as failing when it fails, nor ready again when it works", async () => {
      setUp();
      resend.send = async () => ({ data: null, error: { message: "testing mode" } });
      await expect(sendEmail({ to: "a@example.com", subject: "s", html: "", remember: false })).rejects.toThrow(/testing mode/);
      expect(emailStatus()).toBe("ready");

      // A real reset failure stays remembered even when a feedback email goes out after it.
      await expect(sendEmail({ to: "a@example.com", subject: "s", html: "" })).rejects.toThrow();
      expect(emailStatus()).toBe("failing");
      resend.send = async () => ({ data: { id: "email-3" }, error: null });
      await sendEmail({ to: "matt@example.com", subject: "s", html: "", remember: false });
      expect(emailStatus()).toBe("failing");
    });
  });

  describe("the feedback email", () => {
    const row = {
      kind: "wrong",
      message: "The <b>list</b> & the \"cart\" are empty\nSecond line",
      page: "grocery",
      locale: "fr",
      device: "phone",
      screen: "390x844",
      browser: "Safari 17 on iOS",
      appVersion: "a1b2c3d",
      errorName: null,
      createdAt: new Date("2026-10-18T15:00:00Z"),
    };

    it("tells Matt in English: who, what kind, the words, the details and a link to the inbox", async () => {
      setUp();
      await sendFeedbackEmail({ to: "matt@example.com", row, senderEmail: "friend@example.com", lang: "en", appUrl: "https://cookbook.example.com/" });
      const [message] = resend.sent;
      expect(message.to).toBe("matt@example.com");
      expect(message.subject).toBe("New feedback: something's wrong");
      expect(message.html).toContain('lang="en"');
      expect(message.html).toContain("friend@example.com");
      expect(message.html).toContain("Page: grocery");
      expect(message.html).toContain("Language: Français");
      expect(message.html).toContain("Device: phone, 390x844");
      expect(message.html).toContain("Browser: Safari 17 on iOS");
      expect(message.html).toContain("App version: a1b2c3d");
      expect(message.html).toContain("Sent: Oct 18, 2026");
      expect(message.html).toContain('href="https://cookbook.example.com/admin/feedback"');
      expect(message.html).not.toContain("Error:");
    });

    it("tells Matt in Quebec French", async () => {
      setUp();
      await sendFeedbackEmail({ to: "matt@example.com", row: { ...row, kind: "idea", locale: "en", device: "computer" }, senderEmail: "ami@example.com", lang: "fr", appUrl: "" });
      const [message] = resend.sent;
      expect(message.subject).toBe("Nouveau commentaire : une idée");
      expect(message.html).toContain('lang="fr"');
      expect(message.html).toContain("Appareil: ordinateur, 390x844");
      expect(message.html).toContain("Langue: English");
      expect(message.html).not.toContain("admin/feedback"); // no APP_URL, no link
    });

    it("escapes every word the tester typed, and keeps them out of the subject", async () => {
      setUp();
      await sendFeedbackEmail({ to: "matt@example.com", row, senderEmail: "a<i>@example.com", lang: "en" });
      const [message] = resend.sent;
      expect(message.html).toContain("The &lt;b&gt;list&lt;/b&gt; &amp; the &quot;cart&quot; are empty");
      expect(message.html).not.toContain("<b>list</b>");
      expect(message.html).toContain("a&lt;i&gt;@example.com");
      expect(message.subject).not.toContain("list");
    });

    it("names the error when it came from the crash screen", async () => {
      setUp();
      await sendFeedbackEmail({ to: "matt@example.com", row: { ...row, errorName: "TypeError" }, senderEmail: "a@example.com", lang: "en" });
      expect(resend.sent[0].html).toContain("Error: TypeError");
    });

    it("doesn't change whether reset emails are tried", async () => {
      setUp();
      resend.send = async () => ({ data: null, error: { message: "testing mode" } });
      await expect(sendFeedbackEmail({ to: "friend@example.com", row, senderEmail: "a@example.com", lang: "en" })).rejects.toThrow();
      expect(emailStatus()).toBe("ready");
    });
  });
});
