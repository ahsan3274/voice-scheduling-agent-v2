import Head from 'next/head';
import dynamic from 'next/dynamic';

const VoiceAgent = dynamic(() => import('../components/VoiceAgent'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>Voice Scheduling Agent</title>
        <meta name="description" content="Book a meeting using your voice — Deepgram · Bedrock · Polly" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>

      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
            style={{ background: 'linear-gradient(160deg, #0a0a0f 0%, #0f0a1e 100%)' }}>

        {/* Background glows */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-40 -left-40 rounded-full opacity-20"
               style={{ width: 600, height: 600, background: 'radial-gradient(circle, #4f46e5, transparent)' }} />
          <div className="absolute -bottom-40 -right-40 rounded-full opacity-10"
               style={{ width: 500, height: 500, background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-10 w-full max-w-xl">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-2"
                 style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              AI Voice Assistant
            </div>
            <h1 className="text-4xl font-bold tracking-tight"
                style={{ background: 'linear-gradient(135deg, #f0f0f5, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Schedule a Meeting
            </h1>
            <p className="text-sm" style={{ color: '#6b7280' }}>
              Talk naturally — your assistant will book a calendar event for you.
            </p>
          </div>

          <div className="w-full h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.4), transparent)' }} />

          <VoiceAgent />

          {/* How it works */}
          <div className="w-full rounded-2xl p-5 grid grid-cols-2 gap-3"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="col-span-2 text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#6b7280' }}>
              How it works
            </h2>
            {[
              ['🎙️', 'Click & speak',     'Deepgram transcribes your voice in real-time'],
              ['🧠', 'AI understands',    'Claude 3 Haiku on Bedrock extracts name, date & time'],
              ['✅', 'Confirm details',   'The assistant confirms before booking anything'],
              ['📅', 'Event created',     'Instantly added to Google Calendar via API'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex gap-2 items-start">
                <span className="text-lg leading-none mt-0.5">{icon}</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#e5e7eb' }}>{title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
