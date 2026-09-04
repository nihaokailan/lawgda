export async function sendSigningInvitationEmail({
  to,
  signerName,
  documentName,
  signingLink,
}) {
  const fromAddress = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'Lawgda <noreply@lawgda.local>';
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.info(`[signing-email] Fallback email delivery for ${to}`);
    console.info(`[signing-email] Signer link: ${signingLink}`);
    return {
      ok: false,
      reason: 'No email provider configured. Link was logged to the server console.',
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [String(to).trim()],
      subject: `You are invited to sign ${documentName || 'a document'}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1f1f;">
          <p>Hello ${signerName || 'there'},</p>
          <p>You have been invited to review and sign a document in Lawgda.</p>
          <p><strong>Document:</strong> ${documentName || 'Untitled document'}</p>
          <p>
            <a href="${signingLink}" target="_blank" rel="noreferrer"
              style="display: inline-block; background: #6a0f1a; color: #fff; padding: 12px 18px; border-radius: 999px; text-decoration: none; font-weight: 600;">
              Review and sign document
            </a>
          </p>
          <p>If the button does not work, use this link:</p>
          <p><a href="${signingLink}" target="_blank" rel="noreferrer">${signingLink}</a></p>
          <p>Thanks,<br />Lawgda</p>
        </div>
      `,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = payload?.message || 'Unable to send invitation email.';
    console.error('[signing-email] Resend error:', reason);
    return {
      ok: false,
      reason,
    };
  }

  return {
    ok: true,
    id: payload?.id || null,
  };
}
