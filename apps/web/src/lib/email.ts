type Mail = { to: string; subject: string; text: string; url?: string };

/**
 * Delivery is stubbed until a sending domain exists. In development the link
 * is printed to the server console, which is enough to complete every flow.
 * Swap the body of `deliver` for Resend/Postmark and nothing else changes.
 */
async function deliver(mail: Mail) {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Aptivus <hello@aptivus.dev>",
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`email send failed: ${res.status}`);
    return;
  }
  console.log("\n─── email (dev, not sent) ───────────────────────────");
  console.log(`to:      ${mail.to}`);
  console.log(`subject: ${mail.subject}`);
  if (mail.url) console.log(`link:    ${mail.url}`);
  console.log("─────────────────────────────────────────────────────\n");
}

export const sendMagicLink = (to: string, url: string) =>
  deliver({
    to,
    url,
    subject: "Your Aptivus sign-in link",
    text: `Sign in to Aptivus:\n\n${url}\n\nThis link works once and expires in 15 minutes.`,
  });

export const sendPasswordReset = (to: string, url: string) =>
  deliver({
    to,
    url,
    subject: "Reset your Aptivus password",
    text: `Reset your password:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
  });

export const sendVerifyEmail = (to: string, url: string) =>
  deliver({
    to,
    url,
    subject: "Confirm your email",
    text: `Confirm your email address:\n\n${url}`,
  });
