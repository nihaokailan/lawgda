export async function sendSigningInvitationEmail({
  to,
  signerName,
  documentName,
  signingLink,
}) {
  const hasRefreshCredentials = Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN
  );
  let accessToken = hasRefreshCredentials ? '' : process.env.GMAIL_ACCESS_TOKEN;
  let authorizationError = '';
  if (hasRefreshCredentials) {
    for (let attempt = 0; attempt < 2 && !accessToken; attempt += 1) {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GMAIL_CLIENT_ID,
          client_secret: process.env.GMAIL_CLIENT_SECRET,
          refresh_token: process.env.GMAIL_REFRESH_TOKEN,
          grant_type: 'refresh_token',
        }),
      });
      const tokenPayload = await tokenResponse.json().catch(() => ({}));
      accessToken = tokenPayload.access_token || '';
      if (!accessToken) {
        authorizationError = tokenPayload.error_description || tokenPayload.error || `HTTP ${tokenResponse.status}`;
      }
    }
  }

  if (!accessToken) {
    console.info(`[signing-email] Fallback email delivery for ${to}`);
    return {
      ok: false,
      reason: authorizationError
        ? `Gmail authorization failed: ${authorizationError}`
        : 'Gmail API credentials are not configured.',
    };
  }

  const subject = `You are invited to sign ${documentName || 'a document'}`;
  const html = `<p>Hello ${signerName || 'there'},</p><p>You have been invited to review and sign a document in Lawgda.</p><p><strong>Document:</strong> ${documentName || 'Untitled document'}</p><p><a href="${signingLink}">Review and sign document</a></p><p>${signingLink}</p><p>Thanks,<br>Lawgda</p>`;
  const rawMessage = [
    `From: Lawgda <lawgda.sign@gmail.com>`,
    `To: ${String(to).trim()}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');
  const encodedMessage = Buffer.from(rawMessage).toString('base64url');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = payload?.error?.message || payload?.error_description || payload?.message || `Gmail API returned HTTP ${response.status}.`;
    console.error('[signing-email] Gmail API error:', reason);
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
