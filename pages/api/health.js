export default function handler(req, res) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  // Non-secret diagnostic: identify which service account is being used (email only).
  let serviceAccountClientEmail = null;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const parsed = JSON.parse(raw);
      serviceAccountClientEmail = parsed?.client_email || null;
    }
  } catch {
    // Ignore parsing errors (still show booleans for readiness).
  }

  const env = {
    deepgram_api_key:       !!process.env.DEEPGRAM_API_KEY,
    aws_access_key:         !!process.env.AWS_ACCESS_KEY_ID,
    aws_secret_key:         !!process.env.AWS_SECRET_ACCESS_KEY,
    google_service_account: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  };
  const optional = {
    google_calendar_id: !!process.env.GOOGLE_CALENDAR_ID, // defaults to "primary" when unset
    resolved_google_calendar_id: calendarId,
    service_account_client_email: serviceAccountClientEmail,
  };
  const ready = Object.values(env).every(Boolean);
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? 'ok' : 'misconfigured', ready, env, optional, ts: new Date().toISOString() });
}
