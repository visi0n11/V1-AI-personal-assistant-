import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Sparkles, Activity } from 'lucide-react';
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
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Improved PCM decoding to handle data views correctly
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
      setStatus('Requesting Hardware...');
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API Key is not configured. Please check your environment settings.");
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
            setStatus('Neural Link Established');
            setIsListening(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate real-time level for UI feedback
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
            // Audio output processing
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

            // Transcription processing
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userText = currentInputTranscription.current.trim();
              const aiText = currentOutputTranscription.current.trim();
              if (userText || aiText) {
                setTranscription(prev => [...prev.slice(-10), userText ? `You: ${userText}` : '', aiText ? `V1: ${aiText}` : ''].filter(Boolean));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Interruption logic
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            // Function calling
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
            console.error('Gemini Session Error:', e);
            setError('Connection lost. Please re-activate.');
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
          systemInstruction: "You are V1, a professional AI personal assistant. Assist with study, multimedia, and communication tasks. Be concise, fast, and polite.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      console.error('Initialization Error:', err);
      setError(err.message || 'Microphone access failed.');
      setStatus('System Ready');
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 gap-8">
      {/* Visual Identity Section */}
      <div className="text-center space-y-4 animate-in fade-in zoom-in duration-500">
        <div className="flex justify-center mb-6">
          <div className="relative group">
            <div className={`absolute -inset-4 rounded-full bg-blue-500/20 blur-xl transition-all duration-1000 ${isListening ? 'opacity-100 scale-125' : 'opacity-0'}`} />
            <div className="relative p-6 bg-slate-900 border border-slate-800 rounded-full shadow-2xl">
              <Sparkles size={40} className={`${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`} />
            </div>
          </div>
        </div>
        <h1 className="text-5xl font-black italic tracking-tighter bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent uppercase">V1 Interface</h1>
        <p className="text-slate-500 font-bold text-[10px] tracking-[0.4em] uppercase">Advanced Neural System Enabled</p>
      </div>

      {/* Main Activation Ring */}
      <div className="relative flex flex-col items-center">
        <button 
          onClick={isListening ? stopSession : startSession}
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center transition-all duration-700 group ${isListening ? 'bg-blue-900/20 border-2 border-blue-400 shadow-[0_0_80px_rgba(59,130,246,0.3)]' : 'bg-slate-900 border-2 border-slate-800 hover:border-slate-600 shadow-xl'}`}
        >
          {isListening ? (
            <div className="flex gap-1.5 h-16 items-center">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-blue-400 rounded-full animate-bounce" 
                  style={{ 
                    height: `${20 + Math.random() * 80}%`, 
                    animationDelay: `${i * 0.05}s`,
                    opacity: 0.5 + (inputLevel * 10)
                  }} 
                />
              ))}
            </div>
          ) : (
            <Mic size={72} className="text-slate-700 group-hover:text-blue-500 transition-colors transform group-hover:scale-110 duration-500" />
          )}
          
          <div className="absolute bottom-12">
            <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`}>
              {isListening ? 'Neural Active' : 'Start Feed'}
            </span>
          </div>
        </button>

        {/* Real-time Level Meter */}
        {isListening && (
          <div className="mt-8 w-48 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-lg">
             <div 
               className="h-full bg-blue-500 transition-all duration-75 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
               style={{ width: `${Math.min(inputLevel * 1500, 100)}%` }} 
             />
          </div>
        )}
      </div>

      {/* Interaction Log */}
      <div className="w-full space-y-4">
        <div className="flex justify-center">
          <div className="flex items-center gap-2 px-6 py-2 rounded-full bg-slate-900/80 border border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest backdrop-blur-md">
             <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'}`} />
             {status}
          </div>
        </div>

        <div className="glass-panel rounded-[2.5rem] p-8 min-h-[160px] max-h-[300px] overflow-y-auto custom-scrollbar border-white/5 flex flex-col gap-4 shadow-inner">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-4 opacity-40">
              <Activity size={32} />
              <p className="text-[10px] font-black italic tracking-widest uppercase">Encryption Tunnel Active</p>
            </div>
          ) : transcription.map((t, i) => {
            const isUser = t.startsWith('You:');
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                <div className={`px-5 py-3 rounded-3xl text-sm font-medium max-w-[85%] leading-relaxed ${isUser ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-blue-600/10 text-blue-200 border border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.05)]'}`}>
                  {t.split(': ')[1]}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-start gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-3xl animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-red-400 text-xs font-black uppercase tracking-tight">System Exception</p>
              <p className="text-red-200/70 text-sm font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 text-[10px] font-black uppercase border-b border-red-500/30">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;