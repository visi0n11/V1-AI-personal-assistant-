import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, MessageCircle, AlertCircle, Sparkles, Zap } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';

interface VoiceInteractionProps {
  handlers: {
    addNote: (title: string, content: string) => string;
    addTask: (text: string) => string;
    sendMessage: (recipient: string, text: string) => string;
    getNotifications: () => string;
    controlMedia: (action: string) => string;
  };
}

const VoiceInteraction: React.FC<VoiceInteractionProps> = ({ handlers }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('System Ready');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  };

  const tools: FunctionDeclaration[] = [
    {
      name: 'add_note',
      parameters: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, content: { type: Type.STRING } },
        required: ['title', 'content']
      }
    },
    {
      name: 'add_task',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING } },
        required: ['text']
      }
    },
    {
      name: 'send_message',
      parameters: {
        type: Type.OBJECT,
        properties: { recipient: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ['recipient', 'text']
      }
    },
    {
      name: 'control_multimedia',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          action: { type: Type.STRING, description: 'Action to perform: play, pause, next, capture' } 
        },
        required: ['action']
      }
    },
    { name: 'get_notifications', parameters: { type: Type.OBJECT, properties: {} } }
  ];

  const startSession = async () => {
    try {
      setError(null);
      
      // Must use process.env.API_KEY directly for the GenAI client
      if (!process.env.API_KEY) {
        setError('API Key is not configured. Please check your environment settings.');
        return;
      }

      setStatus('Initializing Neural Link...');
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      
      // Ensure existing contexts are closed
      if (inputAudioContextRef.current) await inputAudioContextRef.current.close();
      if (audioContextRef.current) await audioContextRef.current.close();

      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('V1 Online');
            setIsListening(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              
              // Only send if session is resolved
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result = "Action executed.";
                try {
                  if (fc.name === 'add_note') result = handlers.addNote(fc.args.title as string, fc.args.content as string);
                  if (fc.name === 'add_task') result = handlers.addTask(fc.args.text as string);
                  if (fc.name === 'send_message') result = handlers.sendMessage(fc.args.recipient as string, fc.args.text as string);
                  if (fc.name === 'control_multimedia') result = handlers.controlMedia(fc.args.action as string);
                  if (fc.name === 'get_notifications') result = handlers.getNotifications();
                } catch (e) {
                  result = "Error executing action.";
                }
                
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result } }]
                }));
              }
            }

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
              setTranscription(prev => [...prev.slice(-10), `V1: ${message.serverContent?.outputTranscription?.text}`]);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => [...prev.slice(-10), `You: ${message.serverContent?.inputTranscription?.text}`]);
            }
            if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => { 
            setError(`Neural link error: ${((e as any)?.message || 'Connection lost')}`); 
            stopSession(); 
          },
          onclose: () => { 
            setStatus('Ready'); 
            setIsListening(false); 
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are V1, a high-performance AI personal assistant. Use your tools to manage the user study, messages, and multimedia. Speak concisely and professionally.',
          tools: [{ functionDeclarations: tools }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(`Hardware error: ${err.message || 'Microphone access denied'}. Ensure site permissions are granted.`);
      setStatus('Ready');
    }
  };

  const stopSession = () => {
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e){} sessionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (inputAudioContextRef.current) { inputAudioContextRef.current.close().catch(()=>{}); inputAudioContextRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    setIsListening(false);
    setStatus('Ready');
  };

  return (
    <div className="flex flex-col h-full gap-8 items-center justify-center max-w-2xl mx-auto px-4">
      <div className="text-center space-y-4">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/20 shadow-2xl shadow-blue-500/10">
            <Zap size={32} className="text-blue-400" />
          </div>
        </div>
        <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-white via-blue-200 to-blue-400 bg-clip-text text-transparent italic uppercase">V1 Assistant</h1>
        <p className="text-slate-500 font-medium text-sm tracking-wide">AI CORE VERSION 2.5 • LOW LATENCY VOICE INTERFACE</p>
      </div>

      <div className="relative">
        <div className={`absolute -inset-10 rounded-full bg-blue-500/10 blur-[60px] transition-all duration-1000 ${isListening ? 'opacity-100 scale-150' : 'opacity-0 scale-50'}`} />
        <button 
          onClick={isListening ? stopSession : startSession}
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center transition-all duration-500 border-2 ${isListening ? 'border-blue-400 bg-blue-950/40 scale-105 shadow-[0_0_80px_rgba(59,130,246,0.3)]' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'} active:scale-95 group`}
        >
          {isListening ? (
            <div className="flex items-center gap-1.5 h-16">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-1.5 bg-blue-400 rounded-full animate-bounce" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ) : (
            <Mic size={80} className="text-slate-600 group-hover:text-blue-400 transition-all duration-300 transform group-hover:scale-110" />
          )}
          <div className="absolute bottom-10 flex flex-col items-center">
            <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`}>
              {isListening ? 'Neural Active' : 'Initialize V1'}
            </span>
          </div>
        </button>
      </div>

      <div className="w-full space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-slate-900/80 border border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-xl">
             <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`} />
             {status}
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] p-6 min-h-[180px] max-h-[320px] overflow-y-auto flex flex-col gap-4 custom-scrollbar shadow-2xl border-white/5">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4 opacity-40">
              <Sparkles size={32} />
              <p className="text-sm font-bold italic tracking-wider uppercase">Voice Stream Empty</p>
            </div>
          ) : transcription.map((t, i) => {
            const isUser = t.startsWith('You:');
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-5 py-3 rounded-2xl text-sm font-medium max-w-[85%] leading-relaxed ${isUser ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-blue-600/20 text-blue-100 border border-blue-500/20'}`}>
                  {t.split(': ')[1]}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-start gap-4 text-red-400 text-xs font-bold bg-red-400/5 p-5 rounded-2xl border border-red-400/20 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={18} className="shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="uppercase tracking-tight">System Exception</p>
              <p className="font-medium opacity-80">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 underline font-black uppercase">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;