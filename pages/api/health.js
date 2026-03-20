export default function handler(req, res) {
  const env = {
    deepgram_api_key:       !!process.env.DEEPGRAM_API_KEY,
    aws_access_key:         !!process.env.AWS_ACCESS_KEY_ID,
    aws_secret_key:         !!process.env.AWS_SECRET_ACCESS_KEY,
    google_service_account: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  };
  const optional = {
    google_calendar_id: !!process.env.GOOGLE_CALENDAR_ID, // defaults to "primary" when unset
  };
  const ready = Object.values(env).every(Boolean);
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? 'ok' : 'misconfigured', ready, env, optional, ts: new Date().toISOString() });
}
