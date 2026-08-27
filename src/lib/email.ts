import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "InvoiceGuard <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: "Reset your InvoiceGuard password",
      html: `
        <p>We received a request to reset your InvoiceGuard password.</p>
        <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 45 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return false;
    }
    return true;
  } catch (err) {
    // Resend's SDK returns { error } for API-level failures (bad/missing key,
    // unverified domain), but network-level failures (DNS, timeout) can still
    // throw. This path must never throw uncaught — forgot-password always
    // returns its generic response regardless of email delivery outcome.
    console.error("Failed to send password reset email (network error):", err);
    return false;
  }
}
