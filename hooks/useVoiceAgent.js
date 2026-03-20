/**
 * hooks/useVoiceAgent.js
 *
 * Orchestrates the full real-time voice loop:
 *
 *   Mic → Deepgram (STT) → /api/chat (Bedrock LLM) → /api/create-event → /api/speak (Polly TTS) → Speaker
 *
 * State machine:
 *   idle → connecting → greeting → listening → thinking → speaking → listening → ... → ended
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

/**
 * Agent status constants representing the current state of the voice agent
 */
export const AGENT_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  GREETING: 'greeting',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ENDED: 'ended',
  ERROR: 'error',
};

/**
 * Custom hook that manages the complete voice agent lifecycle
 * @returns {Object} Voice agent state and controls
 * @returns {string} status - Current agent status
 * @returns {Array} transcript - Conversation history
 * @returns {string} liveText - Live transcription text
 * @returns {string|null} eventLink - Created event link if booking succeeded
 * @returns {string|null} errorMsg - Error message if any
 * @returns {Function} startCall - Start the voice call
 * @returns {Function} stopCall - Stop the voice call
 */
export function useVoiceAgent() {
  const [status, setStatus] = useState(AGENT_STATUS.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [liveText, setLiveText] = useState('');
  const [eventLink, setEventLink] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0); // For mic visualizer

  const messagesRef = useRef([]);
  const dgRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const listeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const abortRef = useRef(false);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Add a message to both the LLM history and UI transcript
   * @param {string} role - 'user' or 'assistant'
   * @param {string} text - Message text
   */
  function addMessage(role, text) {
    messagesRef.current = [...messagesRef.current, { role, content: text }];
    setTranscript((prev) => [...prev, { role, text }]);
  }

  /**
   * Convert text to speech using AWS Polly and play it
   * @param {string} text - Text to speak
   */
  async function speakText(text) {
    if (abortRef.current) return;
    setStatus(AGENT_STATUS.SPEAKING);
    isSpeakingRef.current = true;

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Polly TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      // Enable autoplay by user gesture context
      audio.preload = 'auto';
      
      try {
        await Promise.race([
          new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = reject;
            audio.play().catch(reject);
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Audio playback timeout')), 30000)
          ),
        ]);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('[speak]', err);
      // Don't show error for autoplay issues - just continue silently
      if (err.message.includes('not allowed') || err.message.includes('autoplay') || err.message.includes('play()')) {
        console.log('[speak] Autoplay blocked - continuing anyway');
        // Still set status back so UI updates
      } else {
        setErrorMsg(`Failed to play audio response: ${err.message}`);
        setStatus(AGENT_STATUS.ERROR);
      }
    } finally {
      isSpeakingRef.current = false;
    }
  }

  /**
   * Send user input to the LLM and handle the response
   * @param {string} userText - User's transcribed speech
   */
  async function sendToLLM(userText) {
    if (abortRef.current) return;
    addMessage('user', userText);
    setStatus(AGENT_STATUS.THINKING);
    setLiveText('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesRef.current }),
      });
      const result = await res.json();

      if (result.type === 'tool_call' && result.toolName === 'schedule_meeting') {
        // ── Book the meeting ────────────────────────────────────────────────
        // Stop listening immediately to prevent any in-progress utterances from firing
        listeningRef.current = false;

        const bookRes = await fetch('/api/create-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.toolInput),
        });
        const booking = await bookRes.json();

        let confirmText;
        if (booking.success) {
          setEventLink(booking.eventLink);
          confirmText = `Your meeting has been booked! I've added "${booking.summary}" to your calendar. You can view it at: ${booking.eventLink}`;
        } else {
          confirmText = `I'm sorry, there was a problem creating the event: ${booking.error}. Please try again.`;
        }

        addMessage('assistant', confirmText);
        await speakText(confirmText);
        setStatus(AGENT_STATUS.ENDED);
        stopListening();
        return;
      }

      // ── Regular text response ───────────────────────────────────────────
      const replyText = result.text || '';
      addMessage('assistant', replyText);
      await speakText(replyText);

      if (!abortRef.current) setStatus(AGENT_STATUS.LISTENING);
    } catch (err) {
      console.error('[llm]', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus(AGENT_STATUS.ERROR);
    }
  }

  // ── Deepgram connection ──────────────────────────────────────────────────

  async function startDeepgram() {
    return new Promise((resolve, reject) => {
      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        reject(new Error('Deepgram connection timeout'));
      }, 10000);

      // Fetch a short-lived key from our server
      fetch('/api/deepgram-token')
        .then(res => {
          if (!res.ok) throw new Error(`Failed to get Deepgram token: ${res.status}`);
          return res.json();
        })
        .then(({ key }) => {
          const client = createClient(key);

          const connection = client.listen.live({
            model: 'nova-3',
            language: 'en',
            smart_format: true,
            endpointing: 500,
            interim_results: true,
            utterance_end_ms: 1500,
            vad_events: true,
          });

          let isOpen = false;

          connection.on(LiveTranscriptionEvents.Open, () => {
            isOpen = true;
            clearTimeout(timeout);
            console.log('[Deepgram] connection open - ready to receive audio');
            resolve(connection);
          });

          connection.on(LiveTranscriptionEvents.Transcript, (data) => {
            const alt = data.channel?.alternatives?.[0];
            if (!alt) return;

            const text = alt.transcript?.trim();
            const isFinal = data.is_final;

            if (!text) return;

            if (!isFinal) {
              // Show interim transcript live
              setLiveText(text);
              return;
            }

            setLiveText('');
            console.log('[Deepgram] final transcript:', text);

            // Act on final transcripts (user finished speaking)
            if (listeningRef.current) {
              listeningRef.current = false;
              sendToLLM(text);
            }
          });

          connection.on(LiveTranscriptionEvents.Error, (err) => {
            console.error('[Deepgram] error', err);
            clearTimeout(timeout);
            reject(err);
          });

          connection.on(LiveTranscriptionEvents.Close, () => {
            console.log('[Deepgram] connection closed');
            console.log('[Deepgram] Close event details:', { isOpen, hasConnection: !!dgRef.current });
            isOpen = false;
            dgRef.current = null;
          });

          connection.on(LiveTranscriptionEvents.UnhandledError, (err) => {
            console.error('[Deepgram] unhandled error', err);
          });

          dgRef.current = connection;
          
          // Keep connection alive with periodic keepalive
          const keepalive = setInterval(() => {
            if (isOpen && dgRef.current) {
              try {
                dgRef.current.keepAlive();
              } catch (e) {
                clearInterval(keepalive);
              }
            } else {
              clearInterval(keepalive);
            }
          }, 10000);
        })
        .catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  function stopListening() {
    listeningRef.current = false;
    
    // Close Deepgram connection
    if (dgRef.current) {
      dgRef.current.finish();
      dgRef.current = null;
    }
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    
    // Close AudioContext if exists
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    
    console.log('[stopListening] Cleanup complete');
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      } 
    });
    streamRef.current = stream;

    // Use MediaRecorder API (Deepgram's recommended approach)
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    // Set up audio level monitoring for visualizer
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(100, (average / 255) * 100));
      if (listeningRef.current) {
        requestAnimationFrame(updateAudioLevel);
      }
    };
    updateAudioLevel();

    // Send audio chunks to Deepgram when available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && dgRef.current && !isSpeakingRef.current) {
        try {
          dgRef.current.send(event.data);
        } catch (err) {
          console.error('[MediaRecorder] Error sending audio:', err);
        }
      }
    };

    // Start recording with 250ms chunks (Deepgram's recommendation)
    mediaRecorder.start(250);
    console.log('[Mic] MediaRecorder started - streaming 250ms chunks to Deepgram');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    abortRef.current = false;
    listeningRef.current = true;
    messagesRef.current = [];
    setTranscript([]);
    setLiveText('');
    setEventLink(null);
    setErrorMsg(null);
    setStatus(AGENT_STATUS.CONNECTING);

    try {
      // Start Deepgram first
      console.log('[startCall] Connecting to Deepgram...');
      await startDeepgram();
      console.log('[startCall] Deepgram connected');
      
      // Then start mic
      console.log('[startCall] Starting microphone...');
      await startMic();
      console.log('[startCall] Mic started');

      // Kick off the conversation with a greeting
      setStatus(AGENT_STATUS.GREETING);
      const greetRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      });
      const greetData = await greetRes.json();
      const greeting = greetData.text || "Hi! I'm your scheduling assistant. What's your name?";

      addMessage('assistant', greeting);
      
      // Play greeting (audio may be blocked, that's ok)
      console.log('[startCall] Playing greeting...');
      speakText(greeting).catch(() => {
        console.log('[startCall] Audio playback failed, continuing with text only');
      });

      if (!abortRef.current) {
        listeningRef.current = true;
        setStatus(AGENT_STATUS.LISTENING);
        console.log('[startCall] Now listening for your response');
      }
    } catch (err) {
      console.error('[startCall]', err);
      setErrorMsg(err.message.includes('Permission') ? 'Microphone access was denied. Please allow mic access and try again.' : err.message);
      setStatus(AGENT_STATUS.ERROR);
      stopListening();
    }
  }, []);

  const stopCall = useCallback(() => {
    abortRef.current = true;
    stopListening();
    setStatus(AGENT_STATUS.ENDED);
    setLiveText('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopListening();
    };
  }, []);

  return { status, transcript, liveText, eventLink, errorMsg, audioLevel, startCall, stopCall };
}
