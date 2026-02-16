
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, MessageCircle, AlertCircle, Key } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

const VoiceInteraction: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    const checkKey = async () => {
      // In AI Studio environment, we can check for selected keys
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setNeedsKey(!hasKey);
        } catch (e) {
          console.error("Error checking key selection:", e);
        }
      }
    };
    checkKey();
    
    return () => {
      stopSession();
    };
  }, []);

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const startSession = async () => {
    try {
      setError(null);
      setStatus('Connecting...');

      // Re-initialize AI to ensure it uses the most up-to-date API key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      // Ensure audio context is resumed (browser requirement)
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('Active');
            setIsListening(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => [...prev.slice(-19), `V1: ${message.serverContent?.outputTranscription?.text}`]);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => [...prev.slice(-19), `You: ${message.serverContent?.inputTranscription?.text}`]);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            const msg = (e as any)?.message || 'Network error';
            if (msg.includes('entity was not found') || msg.includes('API key')) {
              setError('API Key error. Please ensure you have a valid paid API key selected.');
              setNeedsKey(true);
            } else {
              setError(`Session error: ${msg}`);
            }
            stopSession();
          },
          onclose: () => {
            setStatus('Disconnected');
            setIsListening(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are V1, a proactive and intelligent AI assistant. Be friendly, helpful, and concise. Always respond in a conversational tone.',
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Start Session failed:", err);
      setError('Failed to start session. Check your microphone permissions and network.');
      setStatus('Ready');
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
    sourcesRef.current.clear();
    setIsListening(false);
    setStatus('Ready');
  };

  const handleOpenKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-8 items-center justify-center max-w-2xl mx-auto">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          V1 Voice Interaction
        </h1>
        <p className="text-slate-400">Speak naturally with your real-time AI assistant.</p>
      </div>

      <div className="relative flex items-center justify-center">
        <div className={`absolute w-64 h-64 rounded-full bg-blue-600/20 blur-3xl transition-all duration-1000 ${isListening ? 'scale-125 opacity-100' : 'scale-75 opacity-0'}`} />
        <div className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden shadow-2xl border ${isListening ? 'border-blue-500 scale-110 shadow-blue-500/30' : 'border-slate-800 shadow-slate-900/50'} bg-slate-900`}>
          {isListening ? (
            <div className="flex items-end gap-1.5 h-16">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-2 bg-blue-500 rounded-full animate-bounce" style={{ height: `${20 + Math.random() * 60}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ) : (
            <Mic size={64} className="text-slate-700" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 w-full">
        <div className="flex flex-col gap-4 items-center">
          {needsKey ? (
            <button 
              onClick={handleOpenKey}
              className="flex items-center gap-2 px-8 py-4 bg-amber-600 hover:bg-amber-500 rounded-2xl font-bold shadow-lg shadow-amber-600/30 transition-all active:scale-95"
            >
              <Key size={20} />
              Verify API Key
            </button>
          ) : !isListening ? (
            <button 
              onClick={startSession}
              disabled={status === 'Connecting...'}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-2xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              <Mic size={20} />
              {status === 'Connecting...' ? 'Connecting...' : 'Start Conversation'}
            </button>
          ) : (
            <button 
              onClick={stopSession}
              className="flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-bold shadow-lg shadow-red-600/30 transition-all active:scale-95"
            >
              <MicOff size={20} />
              End Session
            </button>
          )}
          <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">{status}</span>
        </div>

        <div className="w-full glass-panel rounded-3xl p-6 min-h-[160px] max-h-[300px] overflow-y-auto flex flex-col gap-3 custom-scrollbar">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 italic text-sm">
              <MessageCircle size={24} />
              <p>{isListening ? "Listening for your voice..." : "Voice activity logs will appear here"}</p>
            </div>
          ) : (
            transcription.map((t, i) => (
              <div key={i} className={`p-3 rounded-xl max-w-[85%] text-sm ${t.startsWith('You:') ? 'bg-slate-800 self-end text-right' : 'bg-blue-900/30 self-start text-left border border-blue-800/50'}`}>
                {t}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-4 rounded-2xl border border-red-400/20 w-full">
            <AlertCircle size={16} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-xs hover:underline p-1">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;
