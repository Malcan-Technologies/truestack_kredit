export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = process.env.EMAIL_FROM_NAME || "TrueKredit";
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS || "kredit-no-reply@send.pinjocep.my";

  if (!apiKey) {
    console.error(
      "[sendEmail] RESEND_API_KEY is not set in borrower_pro env."
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
      console.error(`[sendEmail] Resend API error (${response.status}):`, body);
      return {
        ok: false,
        error: `Resend API ${response.status}: ${body}`,
      };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sendEmail] Failed to send:", message);
    return { ok: false, error: message };
  }
}
