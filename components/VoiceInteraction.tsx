import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Sparkles, Activity, Terminal } from 'lucide-react';
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
  const [transcription, setTranscription] = useState<{ type: 'user' | 'v1'; text: string }[]>([]);
  const [status, setStatus] = useState<string>('System Ready');
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  // Manual base64 utilities as required by Gemini Live rules
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Improved PCM decoding to handle data views correctly for raw streams
  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const tools: FunctionDeclaration[] = [
    {
      name: 'add_note',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          title: { type: Type.STRING, description: 'Short descriptive title for the note.' }, 
          content: { type: Type.STRING, description: 'The detailed content of the note.' } 
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'add_task',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING, description: 'Task description.' } },
        required: ['text']
      }
    },
    {
      name: 'send_message',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          recipient: { type: Type.STRING, description: 'Name of the contact.' }, 
          text: { type: Type.STRING, description: 'Message content.' } 
        },
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

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => s.close()).catch(() => {});
      sessionPromiseRef.current = null;
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
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
    
    setIsListening(false);
    setStatus('System Ready');
    setInputLevel(0);
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    try {
      setError(null);
      setStatus('Initializing Neural Feed...');
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API Key is not configured in the environment.");
      }

      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });
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
              
              // Local feedback level
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += Math.abs(inputData[i]);
              setInputLevel(sum / inputData.length);

              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              
              const pcmBlob: Blob = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio output bytes processing
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Transcriptions
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userText = currentInputTranscription.current.trim();
              const aiText = currentOutputTranscription.current.trim();
              if (userText || aiText) {
                setTranscription(prev => [
                  ...prev, 
                  ...(userText ? [{ type: 'user' as const, text: userText }] : []),
                  ...(aiText ? [{ type: 'v1' as const, text: aiText }] : [])
                ].slice(-10));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Stop playback on interruption
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            // Handle Tools
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let response: any = "Success";
                try {
                  if (fc.name === 'add_note') response = handlers.addNote(fc.args.title as string, fc.args.content as string);
                  if (fc.name === 'add_task') response = handlers.addTask(fc.args.text as string);
                  if (fc.name === 'send_message') response = handlers.sendMessage(fc.args.recipient as string, fc.args.text as string);
                  if (fc.name === 'control_multimedia') response = handlers.controlMedia(fc.args.action as string);
                  if (fc.name === 'get_notifications') response = handlers.getNotifications();
                } catch (e) {
                  response = { error: (e as Error).message };
                }
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: response } }]
                }));
              }
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            setError('Neural Link Failure: Re-authentication required.');
            stopSession();
          },
          onclose: () => {
            setIsListening(false);
            setStatus('System Ready');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations: tools }],
          systemInstruction: "You are V1, a high-end personal AI assistant. You help the user with study, multimedia, and daily coordination. Be professional, slightly futuristic, and extremely efficient. Use the provided tools whenever appropriate.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      console.error('HW Init Error:', err);
      setError(err.message || 'HW Access Denied: Check Microphone Permissions.');
      setStatus('System Ready');
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-4 gap-12">
      {/* V1 Visual Identity */}
      <div className="text-center space-y-6 animate-in fade-in zoom-in duration-700">
        <div className="flex justify-center">
          <div className="relative">
            <div className={`absolute -inset-8 rounded-full bg-blue-500/10 blur-3xl transition-all duration-1000 ${isListening ? 'opacity-100 scale-150' : 'opacity-0'}`} />
            <div className={`relative p-8 bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-[2.5rem] shadow-2xl transition-transform duration-500 ${isListening ? 'scale-110' : ''}`}>
              <Sparkles size={48} className={`${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-6xl font-black italic tracking-tighter bg-gradient-to-br from-white via-white to-blue-500 bg-clip-text text-transparent uppercase">V1 Interface</h1>
          <p className="text-slate-500 font-bold text-[10px] tracking-[0.6em] uppercase flex items-center justify-center gap-3">
            <span className="w-12 h-px bg-slate-800" />
            Neural Feed Active
            <span className="w-12 h-px bg-slate-800" />
          </p>
        </div>
      </div>

      {/* Main Command Orb */}
      <div className="relative flex flex-col items-center gap-10">
        <button 
          onClick={isListening ? stopSession : startSession}
          className={`relative w-72 h-72 rounded-full flex flex-col items-center justify-center transition-all duration-700 group ${isListening ? 'bg-blue-900/10 border-2 border-blue-400 shadow-[0_0_100px_rgba(59,130,246,0.4)]' : 'bg-slate-900/40 border-2 border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/60 shadow-2xl'}`}
        >
          {isListening ? (
            <div className="flex gap-2 h-20 items-center">
              {[...Array(16)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-blue-400 rounded-full animate-bounce" 
                  style={{ 
                    height: `${20 + Math.random() * 80}%`, 
                    animationDelay: `${i * 0.04}s`,
                    opacity: 0.3 + (inputLevel * 15)
                  }} 
                />
              ))}
            </div>
          ) : (
            <div className="relative">
              <Mic size={80} className="text-slate-700 group-hover:text-blue-500 transition-all duration-500 transform group-hover:scale-110" />
              <div className="absolute -inset-4 bg-blue-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          
          <div className="absolute bottom-12 flex flex-col items-center gap-2">
            <div className={`flex gap-1 transition-opacity duration-500 ${isListening ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-ping" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-ping delay-75" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-ping delay-150" />
            </div>
            <span className={`text-[11px] font-black uppercase tracking-[0.5em] ${isListening ? 'text-blue-400' : 'text-slate-600'}`}>
              {isListening ? 'Connected' : 'Engage V1'}
            </span>
          </div>
        </button>

        {/* Dynamic Level Array */}
        {isListening && (
          <div className="w-64 h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
             <div 
               className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-75 shadow-[0_0_20px_rgba(59,130,246,0.5)]" 
               style={{ width: `${Math.min(inputLevel * 2000, 100)}%` }} 
             />
          </div>
        )}
      </div>

      {/* Real-time Interaction Log */}
      <div className="w-full space-y-6">
        <div className="flex justify-between items-center px-4">
          <div className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-slate-900/60 border border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] backdrop-blur-xl">
             <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
             {status}
          </div>
          <button 
            onClick={() => setTranscription([])}
            className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors"
          >
            Clear Log
          </button>
        </div>

        <div className="glass-panel rounded-[3rem] p-10 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar border-white/5 flex flex-col gap-6 shadow-inner relative">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-800 gap-6 opacity-30 select-none">
              <Terminal size={48} />
              <div className="text-center space-y-1">
                <p className="text-[12px] font-black italic tracking-[0.3em] uppercase">V1 Encrypted Log</p>
                <p className="text-[10px] font-bold tracking-widest uppercase">Waiting for session data...</p>
              </div>
            </div>
          ) : transcription.map((t, i) => (
            <div key={i} className={`flex ${t.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
              <div className={`group relative px-8 py-4 rounded-[2rem] text-sm font-medium max-w-[80%] leading-relaxed transition-all ${t.type === 'user' ? 'bg-slate-800/80 text-slate-200 border border-white/5' : 'bg-blue-600/10 text-blue-100 border border-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.05)]'}`}>
                {t.text}
                <div className={`absolute -bottom-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${t.type === 'user' ? 'right-4' : 'left-4'}`}>
                   <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">{t.type === 'user' ? 'Transmission' : 'V1 Response'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-5 p-6 bg-red-500/5 border border-red-500/10 rounded-[2rem] animate-in slide-in-from-top-6 duration-500 shadow-2xl">
            <div className="p-3 bg-red-500/10 rounded-2xl">
              <AlertCircle className="text-red-500" size={24} />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-red-400 text-xs font-black uppercase tracking-widest">Neural Link Failure</p>
              <p className="text-red-200/60 text-sm font-medium">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="px-6 py-2 bg-red-500/10 text-red-400 text-[10px] font-black uppercase rounded-full hover:bg-red-500/20 transition-all"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;