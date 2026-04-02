/**
 * Send email via Resend API.
 * Used for password reset and other auth-related emails.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = process.env.EMAIL_FROM_NAME || "TrueKredit";
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS || "kredit-no-reply@send.truestack.my";

  if (!apiKey) {
    console.error(
      "[sendEmail] RESEND_API_KEY is not set in apps/admin env. Auth emails will not be sent until RESEND_API_KEY is configured."
    );
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
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

    const body = await response.text();

    if (!response.ok) {
      console.error(
        `[sendEmail] Resend API error (${response.status}):`,
        body
      );
      return {
        ok: false,
        error: `Resend API ${response.status}: ${body}`,
      };
    }

    console.log(`[sendEmail] Sent "${params.subject}" to ${params.to}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] Failed to send:", msg);
    return { ok: false, error: msg };
  }
}
