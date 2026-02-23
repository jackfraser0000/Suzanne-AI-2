import React, { useState, useEffect, useRef } from 'react';
import { Message, Session, SUZANNE_SYSTEM_INSTRUCTION } from './types';
import { JEE_SOLVER_PROMPT } from './services/jeeSolver';
import { GoogleGenAI } from '@google/genai';
import { 
  MessageSquare, 
  Phone, 
  Plus, 
  History, 
  Send, 
  Paperclip, 
  Mic, 
  X, 
  Loader2,
  Trash2,
  User,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SuzanneVoiceClient } from './services/geminiService';

const API_KEY = process.env.GEMINI_API_KEY;

const SuzanneLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 400 400" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Bottom Base - The "Mountain" shape */}
    <path d="M150 280L200 240L250 280L250 300L200 260L150 300V280Z" fill="#6D28D9" />
    <path d="M160 260L200 230L240 260L240 275L200 245L160 275V260Z" fill="#4C1D95" />
    
    {/* Top Left Wing */}
    <path d="M120 220L140 160L180 140L190 180L160 230L120 220Z" fill="#B176E0" />
    <path d="M145 200L155 170L175 160L180 180L165 205L145 200Z" fill="#C084FC" />

    {/* Top Right Wing */}
    <path d="M280 220L260 160L220 140L210 180L240 230L280 220Z" fill="#8B5CF6" />
    <path d="M255 200L245 170L225 160L220 180L235 205L255 200Z" fill="#A78BFA" />

    {/* Top Middle Wing */}
    <path d="M200 110L230 150L200 190L170 150L200 110Z" fill="#9333EA" />
  </svg>
);

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceClientRef = useRef<SuzanneVoiceClient | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (currentSession) {
      fetchMessages(currentSession.id);
    } else {
      setMessages([]);
    }
  }, [currentSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchSessions = async () => {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    setSessions(data);
  };

  const fetchMessages = async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/messages`);
    const data = await res.json();
    setMessages(data);
  };

  const startNewSession = async () => {
    const id = Math.random().toString(36).substring(7);
    const greetings = ["Hi Zahid what's up", "Hi Bro what's up", "Hi Bestie what's up"];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    const newSession = { id, name: `Chat ${new Date().toLocaleString()}` };
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSession)
    });

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: id,
        role: 'model',
        content: greeting,
        type: 'text'
      })
    });

    fetchSessions();
    setCurrentSession({ ...newSession, created_at: new Date().toISOString() });
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !attachedImage) return;
    if (!currentSession) {
      await startNewSession();
    }

    const sessionId = currentSession?.id || messages[0]?.session_id;
    if (!sessionId) return;

    const userMsg: Message = {
      session_id: sessionId,
      role: 'user',
      content: attachedImage || input,
      type: attachedImage ? 'image' : 'text'
    };

    // Save user message
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userMsg)
    });

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const model = ai.models.generateContent.bind(ai.models);
      
      // Fetch long-term facts
      const factsRes = await fetch('/api/facts');
      const facts = await factsRes.json();
      const memoryContext = facts.length > 0 
        ? `\n\nLong-term facts I know about Zahid:\n${facts.map((f: string) => `- ${f}`).join('\n')}`
        : '';
      
      const difficultyContext = `\n\nCURRENT JEE PROBLEM DIFFICULTY: ${difficulty}. 
      - If Easy: Be very brief, focus on the final answer and the main formula.
      - If Medium: Provide a clear step-by-step solution with moderate detail.
      - If Hard: Provide a very detailed, deep-dive explanation of all concepts and steps involved.`;

      const fullSystemInstruction = SUZANNE_SYSTEM_INSTRUCTION + "\n\n" + JEE_SOLVER_PROMPT + memoryContext + difficultyContext;

      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.type === 'image' ? "User uploaded an image." : m.content }]
      }));

      const parts: any[] = [{ text: input || "Please solve this JEE problem." }];
      if (currentImage) {
        parts.push({
          inlineData: {
            data: currentImage.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      const response = await model({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: fullSystemInstruction }] },
          ...history,
          { role: 'user', parts }
        ],
        config: {
          tools: [{
            functionDeclarations: [{
              name: "save_fact",
              description: "Save an important fact about Zahid or his progress to long-term memory.",
              parameters: {
                type: "OBJECT" as any,
                properties: {
                  fact: {
                    type: "STRING" as any,
                    description: "The fact to remember."
                  }
                },
                required: ["fact"]
              }
            }]
          }]
        }
      });

      // Handle function calls (save_fact)
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === 'save_fact') {
            await fetch('/api/facts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fact: call.args.fact })
            });
          }
        }
        
        // If there was a function call, we might want to generate a text response too
        // For simplicity, we'll just re-call or assume the model provided text if it could
      }

      const aiContent = response.text || "Got it, Zahid! I'll remember that.";
      
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'model',
          content: aiContent,
          type: 'text'
        })
      });

      setMessages(prev => [...prev, { session_id: sessionId, role: 'model', content: aiContent, type: 'text' }]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleVoiceCall = async () => {
    if (isCalling) {
      voiceClientRef.current?.disconnect();
      setIsCalling(false);
    } else {
      setIsCalling(true);
      const client = new SuzanneVoiceClient();
      voiceClientRef.current = client;
      await client.connect({
        onClose: () => setIsCalling(false),
        onError: () => setIsCalling(false)
      });
    }
  };

  const deleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (currentSession?.id === id) setCurrentSession(null);
    fetchSessions();
  };

  return (
    <div className="flex h-screen fluid-bg font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-72 bg-stormy-deep/80 backdrop-blur-xl border-r border-white/10 flex flex-col z-20"
          >
            <div className="p-6">
              <h1 className="text-2xl font-bold text-stormy-light mb-6 flex items-center gap-2">
                <SuzanneLogo className="w-12 h-12" /> Suzanne
              </h1>
              <button 
                onClick={startNewSession}
                className="w-full py-3 px-4 bg-stormy-accent hover:bg-stormy-main transition-colors rounded-xl flex items-center justify-center gap-2 font-medium shadow-lg"
              >
                <Plus className="w-5 h-5" /> New Session
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2 scrollbar-hide">
              <div className="flex items-center gap-2 px-2 py-2 text-stormy-light/60 text-sm font-semibold uppercase tracking-wider">
                <History className="w-4 h-4" /> History
              </div>
              {sessions.map((s) => (
                <div 
                  key={s.id}
                  onClick={() => setCurrentSession(s)}
                  className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                    currentSession?.id === s.id ? 'bg-white/20 shadow-inner' : 'hover:bg-white/10'
                  }`}
                >
                  <div className="text-sm font-medium truncate pr-8">{s.name}</div>
                  <div className="text-xs text-white/40">{new Date(s.created_at).toLocaleDateString()}</div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-20 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <SuzanneLogo className="w-12 h-12" />
            </button>
            <div>
              <h2 className="font-bold text-lg">Suzanne</h2>
              <p className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-white/10 rounded-full p-1 border border-white/10 mr-2">
              {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    difficulty === level 
                      ? 'bg-stormy-accent text-white shadow-md' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <button 
              onClick={toggleVoiceCall}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                isCalling ? 'bg-red-500 animate-pulse' : 'bg-stormy-accent hover:bg-stormy-main'
              }`}
            >
              <Phone className="w-5 h-5" />
              <span className="font-medium">{isCalling ? 'End Call' : 'Voice Call'}</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide"
        >
          {messages.length === 0 && !currentSession && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
              <Bot className="w-16 h-16 text-stormy-light" />
              <div>
                <h3 className="text-xl font-bold">Yo Zahid!</h3>
                <p>Ready to crush JEE? Let's get that AIR &lt; 50!</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.role === 'user' ? 'bg-stormy-accent' : 'bg-white/20'
                }`}>
                  {m.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                </div>
                <div className={`p-4 glass-card ${
                  m.role === 'user' ? 'bg-stormy-main/40' : 'bg-white/5'
                }`}>
                  {m.type === 'image' && (
                    <img src={m.content} className="max-w-xs rounded-lg mb-2 border border-white/20" />
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {m.type === 'text' ? m.content : (m.content.startsWith('data:') ? 'Problem Image' : m.content)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="p-4 glass-card bg-white/5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-stormy-light" />
                  <span className="text-sm text-white/60 italic">Suzanne is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-stormy-deep to-transparent">
          <div className="max-w-4xl mx-auto">
            {attachedImage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 relative inline-block"
              >
                <img src={attachedImage} className="h-24 rounded-xl border-2 border-stormy-accent" />
                <button 
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-2 -right-2 bg-red-500 p-1 rounded-full text-white shadow-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 relative">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask Suzanne anything..."
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-stormy-accent transition-all placeholder:text-white/30"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-stormy-light transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              <button 
                onClick={() => setIsVoiceInput(!isVoiceInput)}
                className={`p-4 rounded-2xl transition-all ${
                  isVoiceInput ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <Mic className="w-6 h-6" />
              </button>
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || (!input.trim() && !attachedImage)}
                className="p-4 bg-stormy-accent hover:bg-stormy-main disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl transition-all shadow-lg"
              >
                <Send className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Voice Call Overlay */}
        <AnimatePresence>
          {isCalling && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-stormy-deep/95 backdrop-blur-3xl flex flex-col items-center justify-center"
            >
              <div className="relative">
                <div className="w-48 h-48 rounded-full bg-stormy-accent/20 flex items-center justify-center animate-pulse">
                  <div className="w-32 h-32 rounded-full bg-stormy-accent/40 flex items-center justify-center animate-ping absolute" />
                  <Bot className="w-24 h-24 text-stormy-light" />
                </div>
              </div>
              <div className="mt-8 text-center">
                <h2 className="text-3xl font-bold mb-2">Suzanne</h2>
                <p className="text-stormy-light animate-bounce">Listening...</p>
              </div>
              <button 
                onClick={toggleVoiceCall}
                className="mt-12 p-6 bg-red-500 hover:bg-red-600 rounded-full shadow-2xl transition-all group"
              >
                <Phone className="w-8 h-8 rotate-[135deg] group-hover:scale-110 transition-transform" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
