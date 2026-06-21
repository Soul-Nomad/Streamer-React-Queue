import { motion, AnimatePresence } from "motion/react";
import { Twitch, Settings, Play, Volume2, VolumeX } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import TermosDeUso from "./TermosDeUso";
import PoliticaDePrivacidade from "./PoliticaDePrivacidade";

interface OnboardingProps {
  onStart: () => void;
  onSecondary?: () => void;
}

export default function Onboarding({ onStart, onSecondary }: OnboardingProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Force play on mount since some browsers block autoplay with sound
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.warn("Autoplay with sound might be blocked:", err);
        // Fallback to muted autoplay if needed, but the requirement says "Habilite a reprodução do áudio original"
        // So we'll keep it unmuted and let the user interact if needed
      });
    }
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#060709] overflow-hidden flex items-center justify-center">
      {/* Video Background */}
      {!videoError ? (
        <video
          ref={videoRef}
          src="/BACKANIM.mp4"
          autoPlay
          loop
          playsInline
          onError={() => setVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/Background.jpeg')" }}
        />
      )}

      {/* Extreme Minimalist Overlay to ensure legibility without filters (FILTER REMOVED) */}

      {/* Main Content Side Panel */}
      <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] z-10 flex flex-col items-center justify-center p-6 sm:p-10">
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full bg-[#0d0e12]/60 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-10 pb-[40px] flex flex-col space-y-4 sm:space-y-6 relative overflow-visible"
        >
          {/* Background scan effects like LobbyHero */}
          <div className="absolute inset-0 bg-[#9146FF]/5 pointer-events-none mix-blend-color-dodge rounded-2xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,20,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20 rounded-2xl" />

          {/* subtle glow effect like host view */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#9146FF]/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#FF6B35]/5 blur-[100px] rounded-full pointer-events-none" />

          {/* App Logo Image as Title */}
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full max-w-[340px]"
            >
              <img src="/LOGO.jpeg" alt="Logo" className="w-full h-auto brightness-110 contrast-125" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2 text-center"
            >
              <h1 className="text-[28px] sm:text-[41px] font-black font-display text-white uppercase tracking-tighter leading-[38px] text-center mb-5 -mx-4">
                Os vídeos do seu chat, <span className="text-[#9146FF] block sm:inline ml-1">sem abrir abas</span>
              </h1>
              
              <p className="text-[12px] text-white/50 font-sans leading-relaxed max-w-[380px] mx-auto italic">
                Receba os vídeos da Twitch e do Discord em um só lugar, sem precisar abrir dezenas de abas. Tudo organizado para você apenas dar play e interagir.
              </p>

              <div className="pt-1">
                <span className="inline-block text-[9px] font-black text-[#00FF66] uppercase tracking-widest bg-[#00FF66]/10 px-3 py-1.5 rounded-full border border-[#00FF66]/20">
                  YOUTUBE, TIKTOK, INSTAGRAM, TWITTER E MAIS
                </span>
              </div>
            </motion.div>
          </div>

          {/* Primary Action */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-4"
          >
            <button
              onClick={onStart}
              className="group relative w-full px-8 py-4 bg-[#9146FF] hover:bg-[#772ce8] text-white text-[14px] font-black uppercase tracking-[0.2em] rounded-[8px] transition-all duration-300 transform hover:translate-y-[-2px] active:translate-y-[1px] shadow-[0_10px_30px_rgba(145,70,255,0.3)] flex items-center justify-center gap-4 border border-white/20"
            >
              <Twitch className="w-5 h-5 fill-current" />
              <span>Conectar com Twitch</span>
              <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </motion.div>

          {/* Canais de Envio Guide - Refined Design */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3 pt-4 border-t border-white/5"
          >
            <div className="flex flex-col gap-3">
              {/* Higher Priority Channels: Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Channel 1: Twitch */}
                <div className="bg-white/5 border border-white/10 hover:border-[#9146FF]/40 backdrop-blur-sm p-3 flex flex-col gap-2 h-full rounded-xl transition-all relative overflow-hidden group">
                  <div className="absolute top-0 inset-x-0 h-[3px] bg-[#9146FF] opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="flex justify-end items-center opacity-40 mt-1">
                    <Twitch className="w-2.5 h-2.5" />
                  </div>
                  <h4 className="text-[20px] leading-[21px] font-black text-white uppercase tracking-tight text-center">TWITCH</h4>
                  <p className="text-[11px] text-white/30 leading-[11.25px] font-mono uppercase text-center italic">Captura automática de links no chat</p>
                </div>

                {/* Channel 2: Discord */}
                <div className="bg-white/5 border border-white/10 hover:border-indigo-500/40 backdrop-blur-sm p-3 flex flex-col gap-2 h-full rounded-xl transition-all relative overflow-hidden group">
                  <div className="absolute top-0 inset-x-0 h-[3px] bg-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="flex justify-end items-center opacity-40 mt-1">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
                    </svg>
                  </div>
                  <h4 className="text-[20px] leading-[21px] font-black text-white uppercase tracking-tight text-center">DISCORD</h4>
                  <p className="text-[11px] text-white/30 leading-tight font-mono uppercase text-center italic font-normal">Bot integrado para o seu servidor</p>
                </div>
              </div>

              {/* Integrated Player Card */}
              <div className="relative bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-md p-3 px-4 flex items-center gap-4 rounded-xl overflow-hidden transition-all hover:bg-white/10 group">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-[#FF6B35] via-[#A855F7] via-[#7D67FF] to-[#00FF66] opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-4 w-full mt-1">
                  <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 shrink-0">
                    <img src="/CASSETE-TAPE.png" alt="Cassette" className="w-5 h-5 opacity-80 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h4 className="text-[13px] font-black font-mono tracking-wide leading-none uppercase bg-[linear-gradient(90deg,#FF6B35_0%,#A855F7_33%,#7D67FF_66%,#00FF66_100%)] bg-clip-text text-transparent">
                    Player Integrado
                  </h4>
                </div>
              </div>
            </div>

            {/* Subtle Terms and Privacy links */}
            <div className="pt-2 text-center text-[10px] text-white/30 font-sans tracking-wide">
              Ao conectar, você concorda com nossos{" "}
              <button
                onClick={() => setShowTerms(true)}
                className="text-[#9146FF] hover:underline cursor-pointer focus:outline-none"
              >
                Termos de Uso
              </button>{" "}
              e{" "}
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-[#9146FF] hover:underline cursor-pointer focus:outline-none"
              >
                Política de Privacidade
              </button>
              .
            </div>

          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showTerms && <TermosDeUso onClose={() => setShowTerms(false)} />}
        {showPrivacy && <PoliticaDePrivacidade onClose={() => setShowPrivacy(false)} />}
      </AnimatePresence>

      {/* Audio Control (Discreet) */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={toggleMute}
        className="absolute bottom-8 right-8 p-3 bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white/50 hover:text-white transition-all backdrop-blur-sm"
        title={isMuted ? "Ativar som" : "Desativar som"}
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </motion.button>

      {/* CRT Scanline Overlay (Matching index.css style) */}
      <div className="absolute inset-0 pointer-events-none z-20 opacity-30 bg-[linear-gradient(rgba(18,16,20,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_4px]" />
    </div>
  );
}
