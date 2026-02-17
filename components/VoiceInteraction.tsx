
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Sparkles, Activity, Terminal, ExternalLink, Clock, Power } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';

interface VoiceInteractionProps {
  handlers: {
    addNote: (title: string, content: string) => string;
    addTask: (text: string) => string;
    sendMessage: (recipient: string, text: string) => string;
    getNotifications: () => string;
    controlMedia: (action: string) => string;
    getTime: () => string;
    openUrl: (target: string) => string;
  };
}

const VoiceInteraction: React.FC<VoiceInteractionProps> = ({ handlers }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<{ type: 'user' | 'v1'; text: string }[]>([]);
  const [status, setStatus] = useState<string>('System Standby');
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

  // Manual base64 utilities required for raw PCM data handling
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
          title: { type: Type.STRING, description: 'Title of the note' }, 
          content: { type: Type.STRING, description: 'Full text content of the note' } 
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'add_task',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING, description: 'Task description' } },
        required: ['text']
      }
    },
    {
      name: 'get_notifications',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'get_current_time',
      parameters: { type: Type.OBJECT, properties: {} },
      description: 'Check the current local time.'
    },
    {
      name: 'open_website',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          target: { type: Type.STRING, description: 'The website name or URL to open (e.g., "Google", "YouTube")' } 
        },
        required: ['target']
      },
      description: 'Opens a website in a new browser tab.'
    },
    {
      name: 'stop_assistant',
      parameters: { type: Type.OBJECT, properties: {} },
      description: 'Shuts down the assistant session gracefully.'
    }
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
    [inputAudioContextRef, audioContextRef].forEach(ref => {
      if (ref.current) {
        ref.current.close().catch(() => {});
        ref.current = null;
      }
    });
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
    
    setIsListening(false);
    setStatus('System Standby');
    setInputLevel(0);
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    try {
      setError(null);
      setStatus('Initializing Neural Bridge...');
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Always initialize with the latest process.env.API_KEY
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
            // Audio output stream handling
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

            // Real-time text transcriptions
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const uText = currentInputTranscription.current.trim();
              const aText = currentOutputTranscription.current.trim();
              if (uText || aText) {
                setTranscription(prev => [
                  ...prev, 
                  ...(uText ? [{ type: 'user' as const, text: uText }] : []),
                  ...(aText ? [{ type: 'v1' as const, text: aText }] : [])
                ].slice(-20));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Function Calling Integration (Python Logic Translation)
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let response: any = "Success";
                if (fc.name === 'get_current_time') {
                  response = handlers.getTime();
                } else if (fc.name === 'open_website') {
                  response = handlers.openUrl(fc.args.target as string);
                } else if (fc.name === 'stop_assistant') {
                  response = "Shutting down. Goodbye.";
                  // Brief delay to allow the AI to finish speaking its farewell
                  setTimeout(stopSession, 2000);
                } else if (fc.name === 'add_note') {
                  response = handlers.addNote(fc.args.title as string, fc.args.content as string);
                } else if (fc.name === 'add_task') {
                  response = handlers.addTask(fc.args.text as string);
                } else if (fc.name === 'get_notifications') {
                  response = handlers.getNotifications();
                }

                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: response } }]
                }));
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session Critical Error:', e);
            setError('Neural Link failed. Verify system configuration and permissions.');
            stopSession();
          },
          onclose: () => {
            setIsListening(false);
            setStatus('System Standby');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations: tools }],
          systemInstruction: "You are V1, your AI assistant. Greet the user with 'Hello, I am your AI assistant'. You help with time, web browsing (Google/YouTube), and productivity tasks. If asked to 'exit' or 'stop', use the stop_assistant tool and say 'Shutting down. Goodbye.' Stay concise, efficient, and helpful.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError(err.message || 'HW Resource Access Error.');
      setStatus('System Standby');
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-4 gap-12">
      {/* Brand Identity */}
      <div className="text-center space-y-6 animate-in fade-in zoom-in duration-700">
        <div className="flex justify-center">
          <div className="relative">
            <div className={`absolute -inset-10 rounded-full bg-blue-500/10 blur-[80px] transition-all duration-1000 ${isListening ? 'opacity-100 scale-150' : 'opacity-0'}`} />
            <div className={`relative p-8 bg-slate-900/60 backdrop-blur-3xl border border-white/5 rounded-[3rem] shadow-2xl transition-all duration-500 ${isListening ? 'scale-110 shadow-blue-500/20' : 'grayscale'}`}>
              <Sparkles size={56} className={`${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`} />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-6xl font-black italic tracking-tighter bg-gradient-to-br from-white via-slate-200 to-blue-500 bg-clip-text text-transparent uppercase">V1 Interface</h1>
          <div className="flex items-center justify-center gap-4 text-slate-500">
             <div className="h-px w-12 bg-slate-800" />
             <p className="font-bold text-[10px] tracking-[0.5em] uppercase">Neural Network Active</p>
             <div className="h-px w-12 bg-slate-800" />
          </div>
        </div>
      </div>

      {/* Primary Interaction Orb */}
      <div className="relative flex flex-col items-center gap-12">
        <button 
          onClick={isListening ? stopSession : startSession}
          className={`relative w-80 h-80 rounded-full flex flex-col items-center justify-center transition-all duration-1000 group ${isListening ? 'bg-blue-600/5 border-2 border-blue-400 shadow-[0_0_120px_rgba(59,130,246,0.3)]' : 'bg-slate-900/40 border-2 border-slate-800 hover:border-blue-500/40 hover:bg-slate-900/60 shadow-2xl'}`}
        >
          {isListening ? (
            <div className="flex gap-2.5 h-24 items-center">
              {[...Array(20)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-blue-400 rounded-full animate-bounce" 
                  style={{ 
                    height: `${20 + Math.random() * 80}%`, 
                    animationDelay: `${i * 0.05}s`,
                    opacity: 0.2 + (inputLevel * 20)
                  }} 
                />
              ))}
            </div>
          ) : (
            <div className="relative">
              <Mic size={96} className="text-slate-700 group-hover:text-blue-500 transition-all duration-700 transform group-hover:scale-110" />
              <div className="absolute -inset-6 bg-blue-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          
          <div className="absolute bottom-16 flex flex-col items-center gap-3">
            <span className={`text-[12px] font-black uppercase tracking-[0.6em] transition-colors duration-500 ${isListening ? 'text-blue-400' : 'text-slate-600'}`}>
              {isListening ? 'Live Feed' : 'Engage V1'}
            </span>
          </div>
        </button>
        
        {/* Quick Suggestion Chips */}
        {!isListening && (
          <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-1000">
             {[
               { icon: Clock, label: "What's the time?" },
               { icon: ExternalLink, label: "Open YouTube" },
               { icon: Power, label: "Stop assistant" }
             ].map((chip, i) => (
               <div key={i} className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <chip.icon size={12} />
                  {chip.label}
               </div>
             ))}
          </div>
        )}
      </div>

      {/* Session Diagnostics & Logs */}
      <div className="w-full space-y-8">
        <div className="flex justify-between items-center px-6">
          <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-slate-900/40 border border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-widest backdrop-blur-2xl">
             <div className={`w-2.5 h-2.5 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`} />
             {status}
          </div>
          <button 
            onClick={() => setTranscription([])} 
            className="text-[10px] font-black text-slate-600 uppercase hover:text-white transition-all border-b border-transparent hover:border-white/20"
          >
            Purge Logs
          </button>
        </div>

        <div className="glass-panel rounded-[3.5rem] p-12 min-h-[250px] max-h-[450px] overflow-y-auto custom-scrollbar border-white/5 flex flex-col gap-8 shadow-inner relative">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-800 gap-8 opacity-20 select-none">
              <Terminal size={64} strokeWidth={1} />
              <div className="text-center space-y-2">
                <p className="text-[14px] font-black italic tracking-[0.4em] uppercase">V1 Encryption Protocol Active</p>
                <p className="text-[10px] font-bold tracking-widest uppercase">Awaiting neural handshake...</p>
              </div>
            </div>
          ) : transcription.map((t, i) => (
            <div key={i} className={`flex ${t.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-6 duration-500`}>
              <div className={`group relative px-10 py-5 rounded-[2.5rem] text-base font-medium max-w-[85%] leading-relaxed transition-all ${t.type === 'user' ? 'bg-slate-800/60 text-slate-100 border border-white/5' : 'bg-blue-600/5 text-blue-50 border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.05)]'}`}>
                {t.text}
                <div className={`absolute -bottom-8 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all ${t.type === 'user' ? 'right-6' : 'left-6'}`}>
                   <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">
                     {t.type === 'user' ? 'User Transmission' : 'V1 Neural Out'}
                   </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-6 p-8 bg-red-500/5 border border-red-500/10 rounded-[2.5rem] animate-in slide-in-from-top-8 duration-500 shadow-[0_30px_60px_rgba(239,68,68,0.1)]">
            <div className="p-4 bg-red-500/10 rounded-[1.5rem]"><AlertCircle className="text-red-500" size={32} /></div>
            <div className="flex-1 space-y-2">
              <p className="text-red-400 text-xs font-black uppercase tracking-[0.3em]">Critical Exception</p>
              <p className="text-red-200/60 text-sm font-medium leading-relaxed">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;
