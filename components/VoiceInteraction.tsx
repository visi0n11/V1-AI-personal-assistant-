
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, MessageCircle, AlertCircle, Sparkles } from 'lucide-react';
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
      const apiKey = process.env.API_KEY || '';
      if (!apiKey) {
        setError('System error: API configuration missing.');
        return;
      }

      setStatus('Linking to V1 Neural Core...');
      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
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
              const pcmBlob: Blob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result = "Action performed successfully.";
                if (fc.name === 'add_note') result = handlers.addNote(fc.args.title as string, fc.args.content as string);
                if (fc.name === 'add_task') result = handlers.addTask(fc.args.text as string);
                if (fc.name === 'send_message') result = handlers.sendMessage(fc.args.recipient as string, fc.args.text as string);
                if (fc.name === 'control_multimedia') result = handlers.controlMedia(fc.args.action as string);
                if (fc.name === 'get_notifications') result = handlers.getNotifications();
                
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
            }

            if (message.serverContent?.outputTranscription) setTranscription(prev => [...prev.slice(-8), `V1: ${message.serverContent?.outputTranscription?.text}`]);
            if (message.serverContent?.inputTranscription) setTranscription(prev => [...prev.slice(-8), `You: ${message.serverContent?.inputTranscription?.text}`]);
          },
          onerror: (e) => { setError('V1 connection interrupted.'); stopSession(); },
          onclose: () => { setStatus('System Sleep'); setIsListening(false); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are V1, the advanced AI personal assistant. Be efficient, helpful, and personable. You can manage notes, tasks, notifications, and multimedia playback via your tools.',
          tools: [{ functionDeclarations: tools }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError('Microphone access denied or connection failed.');
    }
  };

  const stopSession = () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (inputAudioContextRef.current) { inputAudioContextRef.current.close(); inputAudioContextRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    setIsListening(false);
    setStatus('Ready');
  };

  return (
    <div className="flex flex-col h-full gap-10 items-center justify-center max-w-2xl mx-auto px-4">
      <div className="text-center space-y-3">
        <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-br from-white to-blue-400 bg-clip-text text-transparent italic">V1 ASSISTANT</h1>
        <p className="text-slate-500 font-medium">Next-generation personal intelligence at your command.</p>
      </div>

      <div className="relative group">
        <div className={`absolute -inset-8 rounded-full bg-blue-600/10 blur-3xl transition-all duration-1000 ${isListening ? 'scale-150 opacity-100 animate-pulse' : 'scale-50 opacity-0'}`} />
        <button 
          onClick={isListening ? stopSession : startSession}
          className={`relative w-56 h-56 rounded-full flex flex-col items-center justify-center transition-all duration-500 border-4 ${isListening ? 'border-blue-500 bg-blue-950/30 scale-105 shadow-[0_0_50px_rgba(59,130,246,0.5)]' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'} overflow-hidden shadow-2xl active:scale-95`}
        >
          {isListening ? (
            <div className="flex items-center gap-1 h-12">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-1.5 bg-blue-400 rounded-full animate-bounce" style={{ height: `${30 + Math.random() * 70}%`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : (
            <Mic size={64} className="text-slate-400 group-hover:text-blue-400 transition-colors" />
          )}
          <span className={`mt-4 text-[10px] font-black uppercase tracking-[0.3em] ${isListening ? 'text-blue-400' : 'text-slate-600'}`}>{isListening ? 'Listening' : 'Tap to start'}</span>
        </button>
      </div>

      <div className="w-full space-y-6">
        <div className="flex justify-center">
          <div className="px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{status}</div>
        </div>

        <div className="glass-panel rounded-3xl p-6 min-h-[160px] max-h-[300px] overflow-y-auto flex flex-col gap-4 custom-scrollbar">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <Sparkles size={24} className="opacity-20" />
              <p className="text-sm font-medium opacity-50 italic">Waiting for connection...</p>
            </div>
          ) : transcription.map((t, i) => (
            <div key={i} className={`flex ${t.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium max-w-[85%] ${t.startsWith('You:') ? 'bg-slate-800 text-slate-300' : 'bg-blue-600/20 text-blue-200 border border-blue-500/20 shadow-lg'}`}>
                {t.split(': ')[1]}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-3 text-red-400 text-xs font-bold bg-red-400/10 p-4 rounded-2xl border border-red-400/20">
            <AlertCircle size={16} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="underline uppercase">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;
