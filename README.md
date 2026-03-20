# 🎙️ Voice Scheduling Agent

A real-time AI voice assistant that books Google Calendar meetings through natural conversation.

**Live Demo:** [voice-scheduling-agent-v2.vercel.app](https://voice-scheduling-agent-v2.vercel.app)

**Test Calendar:** [View Public Calendar](https://calendar.google.com/calendar/u/0?cid=MTA2ZDJiZWE1MWIwZmU0Njc0MmVjMmVlNGFhMjVkMDUwNjVhMjk0YTI1ZTcwODdkMWQ2YzlkMGQwOTExMGU3YkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t)

---

## ✨ Features

1. **Natural Voice Interaction** — Speak naturally; the assistant understands and responds with human-like speech
2. **Real-time Transcription** — Powered by Deepgram Nova-3 with ~300ms latency
3. **Intelligent Conversation Flow** — AI extracts name, date, time, and meeting title through guided dialogue
4. **Confirmation Before Booking** — Always confirms details before creating calendar events
5. **Google Calendar Integration** — Creates real calendar events with reminders and shares links instantly

---

## 🏗️ Architecture

```
┌─────────────┐
│   Browser   │
│  (Next.js)  │
└──────┬──────┘
       │
       ├─── Microphone (PCM 16-bit, 16kHz) ──────────────────────────────┐
       │                                                                  ▼
       │                                                         ┌────────────────┐
       ├─── Deepgram Nova-3 (WebSocket) ──► Real-time transcript │  AWS Bedrock   │
       │                                   POST /api/chat        │  (Claude 3)    │
       │                                          │              └───────┬────────┘
       │                                          │                      │
       │                          ┌───────────────┴──────────────┐       │
       │                          │                              │       │
       │                          ▼                              ▼       │
       │                   POST /api/speak            POST /api/create-event
       │                          │                              │
       │                          │                              ▼
       │                   ┌──────────────┐            ┌──────────────────┐
       │                   │ AWS Polly    │            │ Google Calendar  │
       │                   │ (Neural TTS) │            │      API v3      │
       │                   └──────┬───────┘            └──────────────────┘
       │                          │
       ▼                          ▼
    Speaker                    MP3 Audio
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 14 + React 18 | UI framework with API routes |
| **Speech-to-Text** | Deepgram Nova-3 | Real-time WebSocket transcription |
| **LLM** | AWS Bedrock (Claude 3 Haiku) | Conversation orchestration + tool calling |
| **Text-to-Speech** | AWS Polly Neural | Natural voice synthesis |
| **Calendar** | Google Calendar API v3 | Event creation via Service Account |
| **Hosting** | Vercel | Serverless deployment |

---

## 🗓️ Calendar Integration

Uses a **Google Cloud Service Account** for authentication — no OAuth flow required.

### How It Works

1. Service account created in Google Cloud Console with Calendar API enabled
2. JSON key stored securely as `GOOGLE_SERVICE_ACCOUNT_JSON` environment variable
3. Target calendar shared with service account email (e.g., `voice-agent@project.iam.gserviceaccount.com`)
4. LLM triggers `schedule_meeting` tool → `/api/create-event` calls `calendar.events.insert`

### Event Configuration

Each created event includes:
- **Title & Description** — Meeting name + booking source
- **Start/End Time** — ISO 8601 format with IANA timezone
- **Reminders** — Email (24h before) + Popup (30 min before)
- **Calendar** — Configurable via `GOOGLE_CALENDAR_ID` (default: `primary`)

---

## 💰 Cost Breakdown

| Service | Free Tier | Demo Cost |
|---------|-----------|-----------|
| Deepgram | $200 credit on signup | ~$0.01 per 10 calls |
| AWS Bedrock | Pay-as-you-go | ~$0.01 per 10 calls |
| AWS Polly | 5M chars/month (12 months) | $0 |
| Google Calendar API | Always free | $0 |
| Vercel | Free hobby tier | $0 |
| **Total** | | **~$0 with credits** |

---

## 🚀 Deployment

### Prerequisites

- **Deepgram** account — [console.deepgram.com](https://console.deepgram.com)
- **AWS** account with Bedrock + Polly access
- **Google Cloud** project with Calendar API enabled

### Step 1: Enable Bedrock Model Access

AWS Console → Bedrock → Model access → Request access for **Claude 3 Haiku** (instant approval in most regions).

### Step 2: Deploy to Vercel

```bash
git clone https://github.com/ahsan3274/voice-scheduling-agent-v2
cd voice-scheduling-agent-v2
npx vercel --prod
```

Or connect the GitHub repo directly in [vercel.com](https://vercel.com).

### Step 3: Configure Environment Variables

In **Vercel → Settings → Environment Variables**:

```env
# Deepgram
DEEPGRAM_API_KEY=your_key_here
DEEPGRAM_PROJECT_ID=your_project_id

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
POLLY_VOICE_ID=Joanna

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CALENDAR_ID=primary
```

### Step 4: Share Calendar with Service Account

1. Open [calendar.google.com](https://calendar.google.com)
2. Click ⋮ next to your calendar → **Settings and sharing**
3. Under **Share with specific people**, add the service account email
4. Grant **"Make changes to events"** permission

### Step 5: Verify Deployment

Visit `https://YOUR_APP.vercel.app/api/health` — all checks should pass.

---

## 💻 Local Development

```bash
# Clone and install
git clone https://github.com/ahsan3274/voice-scheduling-agent-v2
cd voice-scheduling-agent-v2
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start development server
npm run dev
# → http://localhost:3000
```

---

## 🧪 Testing

### End-to-End Voice Test

1. Open [deployed URL](https://voice-scheduling-agent-v2.vercel.app) in Chrome or Safari
2. Click the **purple orb** and allow microphone access
3. When greeted, say something like:
   > *"Hi, I'm John Doe. I'd like to book a meeting on March 30th at 5 PM called Project Review."*
4. The assistant confirms details before booking
5. Say *"Yes, that's correct"* to confirm
6. Event appears in the [test calendar](https://calendar.google.com/calendar/u/0?cid=MTA2ZDJiZWE1MWIwZmU0Njc0MmVjMmVlNGFhMjVkMDUwNjVhMjk0YTI1ZTcwODdkMWQ2YzlkMGQwOTExMGU3YkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t)

### API Test (No Voice)

```bash
# Test calendar booking directly
curl -X POST https://voice-scheduling-agent-v2.vercel.app/api/create-event \
  -H "Content-Type: application/json" \
  -d '{
    "attendeeName": "John Doe",
    "summary": "Project Review",
    "startDateTime": "2026-03-30T17:00:00",
    "endDateTime": "2026-03-30T18:00:00",
    "timeZone": "UTC"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "eventId": "...",
  "eventLink": "https://www.google.com/calendar/event?eid=...",
  "summary": "Project Review",
  "start": "2026-03-30T17:00:00Z"
}
```

---

## 📁 Project Structure

```
voice-scheduling-agent-v2/
├── components/
│   └── VoiceAgent.js          # UI: orb, status, transcript, success banner
├── hooks/
│   └── useVoiceAgent.js       # Core voice loop: Deepgram → Bedrock → Polly
├── lib/
│   ├── llm.js                 # Bedrock integration with tool calling
│   ├── polly.js               # AWS Polly TTS → MP3 buffer
│   └── googleCalendar.js      # Google Calendar API via Service Account
├── pages/
│   ├── index.js               # Main landing page
│   └── api/
│       ├── deepgram-token.js  # Issues short-lived Deepgram tokens
│       ├── chat.js            # LLM conversation endpoint
│       ├── speak.js           # Polly TTS endpoint
│       ├── create-event.js    # Google Calendar booking endpoint
│       └── health.js          # Configuration health check
├── styles/
│   └── globals.css            # Tailwind CSS + custom animations
├── .env.example               # Environment variable template
├── vercel.json                # Vercel configuration
└── package.json
```

---

## 🔒 Security

- **Server-side Secrets** — `DEEPGRAM_API_KEY`, `AWS_SECRET_ACCESS_KEY`, and `GOOGLE_SERVICE_ACCOUNT_JSON` never sent to browser
- **Short-lived Tokens** — `/api/deepgram-token` creates 1-hour scoped tokens (`usage:write` only)
- **Minimal IAM Permissions** — AWS credentials use least-privilege: `AmazonBedrockFullAccess` + `AmazonPollyFullAccess`

---

## 📸 Screenshots

### Voice Agent UI
![Voice Agent UI](./public/screenshot-ui.png)

### Calendar Event Created
![Calendar Event](./public/screenshot-calendar.png)

---

## 🎥 Demo Video

[Watch Demo](https://loom.com/share/your-video-id) *(coming soon)*

---

## 📝 License

MIT License — feel free to use this project for learning or as a starting point for your own voice agents.

---

## 🤝 Acknowledgments

Built with modern voice AI technologies:
- [Deepgram](https://deepgram.com) — Speech-to-text
- [AWS Bedrock](https://aws.amazon.com/bedrock/) — LLM inference
- [AWS Polly](https://aws.amazon.com/polly/) — Text-to-speech
- [Google Calendar API](https://developers.google.com/calendar) — Event management
- [Next.js](https://nextjs.org) — Full-stack React framework

---

**Built by [Ahsan](https://ahsan-tariq-ai.xyz)**
