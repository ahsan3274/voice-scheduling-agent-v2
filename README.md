# 🎙️ Voice Scheduling Agent

A real-time AI voice assistant that books Google Calendar meetings through natural conversation.

**Live demo:** `https://voice-scheduling-agent.vercel.app` ← replace with your URL

---

## ✨ What it does

1. **Greets** the user and opens the conversation automatically
2. **Collects** name, preferred date & time, and optional meeting title through natural speech
3. **Confirms** all details before booking anything
4. **Creates** a real Google Calendar event and reads the link back to the user

---

## 🏗️ Architecture

```
Browser
  │
  ├── Mic audio (PCM 16-bit) ──► Deepgram Nova-3 (WebSocket)
  │                                      │ real-time transcript
  │                                      ▼
  │                             POST /api/chat
  │                                      │
  │                             AWS Bedrock (Llama 3.3 70B)
  │                                      │
  │              ┌───────────────────────┤
  │              │ text reply            │ tool_call: schedule_meeting
  │              ▼                       ▼
  │       POST /api/speak       POST /api/create-event
  │              │                       │
  │       AWS Polly (Neural)    Google Calendar API
  │              │
  │       MP3 audio → browser plays it
```

### Voice stack

| Layer | Technology | Why |
|---|---|---|
| **Speech-to-Text** | [Deepgram Nova-3](https://deepgram.com) | Real-time WebSocket streaming, ~300ms latency, best-in-class accuracy |
| **LLM** | AWS Bedrock — Llama 3.3 70B | Handles conversation flow + tool calling; paid with AWS credits |
| **Text-to-Speech** | AWS Polly Neural | Natural-sounding voice; paid with AWS credits |
| **Calendar** | Google Calendar API v3 | Service Account auth — no OAuth popup needed |
| **Frontend** | Next.js | API routes + React UI |
| **Hosting** | Vercel | Free hobby tier; one-click deploy from GitHub |

---

## 🗓️ Calendar Integration

This project uses a **Google Cloud Service Account** — no user login required.

How it works:
1. A service account is created in Google Cloud Console with the Calendar API enabled.
2. Its JSON key is stored as `GOOGLE_SERVICE_ACCOUNT_JSON` in environment variables.
3. The target Google Calendar is shared with the service account email address.
4. When the LLM triggers the `schedule_meeting` tool, `/api/create-event` calls  
   `calendar.events.insert` on behalf of the service account.

Each created event includes:
- Title, start/end time, IANA timezone
- Description noting it was booked via the Voice Agent
- Email reminder (24 hours before) and popup reminder (30 minutes before)

---

## 💰 Cost breakdown

| Service | Free allowance | Expected cost for this demo |
|---|---|---|
| Deepgram | $200 credit on signup | ~$0.01 for 10 test calls |
| AWS Bedrock | Pay-as-you-go (use credits) | ~$0.01 for 10 test calls |
| AWS Polly | 5M chars/month free for 12 months | $0 |
| Google Calendar API | Always free | $0 |
| Vercel | Free hobby tier | $0 |
| **Total** | | **~$0 with credits** |

---

## 🚀 Deployment

### Prerequisites
- Deepgram account (free) — [console.deepgram.com](https://console.deepgram.com)
- AWS account with Bedrock + Polly access
- Google Cloud project with Calendar API enabled

### Step 1 — Enable Bedrock model access
AWS Console → Bedrock → Model access → **Request access** for  
`Meta Llama 3.3 70B Instruct` (instant approval in most regions).

### Step 2 — Deploy to Vercel
```bash
git clone https://github.com/YOUR_USERNAME/voice-scheduling-agent
cd voice-scheduling-agent
npx vercel --prod
```
Or connect the GitHub repo directly in [vercel.com](https://vercel.com).

### Step 3 — Set environment variables
In **Vercel → Settings → Environment Variables**, add:

```env
# Deepgram
DEEPGRAM_API_KEY=           # from console.deepgram.com → API Keys
DEEPGRAM_PROJECT_ID=        # from console.deepgram.com → Settings

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BEDROCK_MODEL_ID=meta.llama3-3-70b-instruct-v1:0
POLLY_VOICE_ID=Joanna

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CALENDAR_ID=primary
```

### Step 4 — Share your calendar with the service account
1. Open [calendar.google.com](https://calendar.google.com)
2. Click ⋮ next to your calendar → *Settings and sharing*
3. Under *Share with specific people*, add the service account email  
   (e.g. `voice-agent@your-project.iam.gserviceaccount.com`)
4. Grant **"Make changes to events"** permission

### Step 5 — Redeploy and verify
Visit `https://YOUR_APP.vercel.app/api/health` — all values should be `true`.

---

## 💻 Running locally

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/voice-scheduling-agent
cd voice-scheduling-agent
npm install

# 2. Set up env vars
cp .env.example .env.local
# fill in .env.local with your keys

# 3. Validate config
npm run setup

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

**Local LLM option (fully offline):**  
If you have [Ollama](https://ollama.ai) installed:
```bash
ollama pull llama3.1
# then in .env.local:
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1
```
Deepgram and Polly still require internet; only the LLM runs locally.

---

## 🧪 Testing the agent

### Voice test (end-to-end)
1. Open the deployed URL in Chrome or Safari
2. Click the **purple orb** and allow microphone access
3. When the assistant greets you, say:
   > *"Hi, I'm Sarah Johnson. I'd like to book a meeting on April 10th at 3 PM called Team Sync."*
4. The assistant confirms: *"Just to confirm — a meeting called Team Sync on April 10th at 3 PM for Sarah Johnson. Is that right?"*
5. Say *"Yes, that's correct"*
6. The assistant books the event and reads back the Google Calendar link
7. Check your calendar — the event appears instantly

### API test (no voice required)
```bash
# Test calendar booking directly
curl -X POST https://YOUR_APP.vercel.app/api/create-event \
  -H "Content-Type: application/json" \
  -d '{
    "attendeeName": "Sarah Johnson",
    "summary": "Team Sync",
    "startDateTime": "2025-04-10T15:00:00",
    "endDateTime": "2025-04-10T16:00:00",
    "timeZone": "America/New_York"
  }'

# Expected response:
# { "success": true, "eventId": "...", "eventLink": "https://calendar.google.com/event?...", ... }
```

---

## 📁 Project structure

```
voice-scheduling-agent/
├── components/
│   └── VoiceAgent.js          # UI: orb, status, transcript, success banner
├── hooks/
│   └── useVoiceAgent.js       # Core voice loop: Deepgram → Bedrock → Polly
├── lib/
│   ├── llm.js                 # Bedrock (prod) + Ollama (local) abstraction
│   ├── polly.js               # AWS Polly TTS → MP3 buffer
│   └── googleCalendar.js      # Google Calendar API via Service Account
├── pages/
│   ├── index.js               # Main page
│   ├── _app.js
│   ├── _document.js
│   └── api/
│       ├── deepgram-token.js  # Issues short-lived Deepgram keys to browser
│       ├── chat.js            # LLM conversation endpoint
│       ├── speak.js           # Polly TTS endpoint → returns MP3
│       ├── create-event.js    # Google Calendar booking endpoint
│       └── health.js          # Config/health check
├── scripts/
│   └── setup-local.js         # Validates .env.local before dev
├── styles/
│   └── globals.css
├── .env.example
├── vercel.json
├── DEPLOYMENT_CHECKLIST.md
└── README.md
```

---

## 📸 Screenshots

> _Add a screenshot of the UI here_

> _Add a screenshot of a created Google Calendar event here_

---

## 🎥 Demo video

> _Add Loom link here_

---

## 🔒 Security notes

- `DEEPGRAM_API_KEY`, `AWS_SECRET_ACCESS_KEY`, and `GOOGLE_SERVICE_ACCOUNT_JSON` are server-side only — never sent to the browser
- The `/api/deepgram-token` endpoint creates short-lived (1-hour) scoped tokens so the real Deepgram key never reaches the client
- AWS credentials should use an IAM user with minimum required permissions: `AmazonBedrockFullAccess` + `AmazonPollyFullAccess`

---

## 📝 License

MIT
