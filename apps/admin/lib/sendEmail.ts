/**
 * Send email via Resend API.
 * Used for password reset and other auth-related emails.
 * Avoid awaiting in auth callbacks to prevent timing attacks.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = process.env.EMAIL_FROM_NAME || "TrueKredit";
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS || "kredit-no-reply@send.truestack.my";

  if (!apiKey) {
    console.log("[sendEmail] RESEND_API_KEY not set, skipping:", params.to, params.subject);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend API error: ${err}`);
  }
}
