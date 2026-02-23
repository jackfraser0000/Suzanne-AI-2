import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { SUZANNE_SYSTEM_INSTRUCTION } from "../types";

const API_KEY = process.env.GEMINI_API_KEY;

export const getGeminiModel = () => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai.models.generateContent.bind(ai.models);
};

export class SuzanneVoiceClient {
  private ai: GoogleGenAI;
  private session: any;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private audioQueue: Int16Array[] = [];
  private isPlaying = false;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  async connect(callbacks: {
    onOpen?: () => void;
    onMessage?: (text: string) => void;
    onClose?: () => void;
    onError?: (error: any) => void;
  }) {
    this.session = await this.ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      config: {
        systemInstruction: SUZANNE_SYSTEM_INSTRUCTION,
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
      callbacks: {
        onopen: () => {
          this.startMic();
          callbacks.onOpen?.();
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData) {
                const base64Data = part.inlineData.data;
                const binaryString = atob(base64Data);
                const bytes = new Int16Array(binaryString.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                  bytes[i] = (binaryString.charCodeAt(i * 2) & 0xFF) | (binaryString.charCodeAt(i * 2 + 1) << 8);
                }
                this.audioQueue.push(bytes);
                if (!this.isPlaying) this.playNext();
              }
            }
          }
          if (message.serverContent?.interrupted) {
            this.audioQueue = [];
            this.isPlaying = false;
          }
        },
        onclose: () => callbacks.onClose?.(),
        onerror: (err) => callbacks.onError?.(err),
      },
    });
  }

  private async startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    
    // Handle mobile suspension
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      this.session.sendRealtimeInput({
        media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private playNext() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const pcm = this.audioQueue.shift()!;
    const buffer = this.audioContext!.createBuffer(1, pcm.length, 16000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      data[i] = pcm[i] / 0x7FFF;
    }

    const source = this.audioContext!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext!.destination);
    source.onended = () => this.playNext();
    source.start();
  }

  disconnect() {
    this.session?.close();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
  }
}
