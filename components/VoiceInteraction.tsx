
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, MessageCircle, AlertCircle } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

const VoiceInteraction: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready for interaction');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const inputAudioContext = new AudioContext({ sampleRate: 16000 });
      const outputAudioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = outputAudioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('Active');
            setIsListening(true);
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
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
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
              const source = outputAudioContext.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContext.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => [...prev, `V1: ${message.serverContent?.outputTranscription?.text}`]);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => [...prev, `You: ${message.serverContent?.inputTranscription?.text}`]);
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setError('Connection error. Please check your microphone and API key.');
            stopSession();
          },
          onclose: () => {
            setStatus('Disconnected');
            setIsListening(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are V1, a proactive and intelligent AI assistant. Be friendly, helpful, and concise.',
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError('Failed to start session. Ensure you have granted microphone access.');
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      // In a real implementation we would close the session
      // For now, let's just update the state
      setIsListening(false);
      setStatus('Ready for interaction');
    }
  };

  return (
    <div className="flex flex-col h-full gap-8 items-center justify-center max-w-2xl mx-auto">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          V1 Voice Interaction
        </h1>
        <p className="text-slate-400">Speak naturally with your personal AI assistant.</p>
      </div>

      {/* Visualizer Orb */}
      <div className="relative flex items-center justify-center">
        <div className={`absolute w-64 h-64 rounded-full bg-blue-600/20 blur-3xl transition-all duration-1000 ${isListening ? 'scale-125 opacity-100' : 'scale-75 opacity-0'}`} />
        <div className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden shadow-2xl border ${isListening ? 'border-blue-500 scale-110 shadow-blue-500/30' : 'border-slate-800 shadow-slate-900/50'} bg-slate-900`}>
          {isListening ? (
            <div className="flex items-end gap-1.5 h-16">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-2 bg-blue-500 rounded-full animate-bounce" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ) : (
            <Mic size={64} className="text-slate-700" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 w-full">
        <div className="flex gap-4">
          {!isListening ? (
            <button 
              onClick={startSession}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              <Mic size={20} />
              Start Conversation
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
        </div>

        <div className="w-full glass-panel rounded-3xl p-6 min-h-[160px] max-h-[300px] overflow-y-auto flex flex-col gap-3 custom-scrollbar">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 italic">
              <MessageCircle size={24} />
              <p>{isListening ? "Listening for your voice..." : "Voice activity logs will appear here"}</p>
            </div>
          ) : (
            transcription.map((t, i) => (
              <div key={i} className={`p-3 rounded-xl max-w-[85%] ${t.startsWith('You:') ? 'bg-slate-800 self-end text-right' : 'bg-blue-900/30 self-start text-left border border-blue-800/50'}`}>
                {t}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-3 rounded-xl border border-red-400/20">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;
