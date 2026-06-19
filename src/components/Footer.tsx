import { ShieldCheck, Scale } from "lucide-react";

export default function Footer() {
  const openTermos = () => {
    window.dispatchEvent(new CustomEvent("openModal", { detail: "termos" }));
  };

  const openPrivacidade = () => {
    window.dispatchEvent(new CustomEvent("openModal", { detail: "privacidade" }));
  };

  return (
    <footer className="w-full bg-[#07090e]/90 border-t border-white/5 py-8 px-6 text-center select-none relative z-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Left branding/credits side */}
        <div className="flex flex-col md:items-start text-center md:text-left gap-1">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00FF55] animate-pulse" />
            <h4 className="font-mono text-xs text-white/95 font-bold uppercase tracking-widest leading-none">
              S-QUEUE SYSTEM TERMINAL
            </h4>
          </div>
          <p className="font-mono text-[10px] text-slate-400 mt-1">
            Plataforma de gerenciamento de fila de vídeos para streamers.
          </p>
          <p className="font-mono text-[9px] text-slate-500">
            © 2026 S-Queue. Todos os direitos reservados.
          </p>
        </div>

        {/* Right side links with stylish icons and hover animations */}
        <div className="flex flex-wrap justify-center items-center gap-6">
          <button
            onClick={openTermos}
            className="group flex items-center gap-2 text-slate-400 hover:text-[#9146FF] transition-all duration-300 font-mono text-[11px] uppercase tracking-wider cursor-pointer bg-transparent border-none outline-none"
            id="footer_termos_btn"
          >
            <Scale className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#9146FF] group-hover:rotate-6 transition-all duration-305" />
            <span>Termos de Uso</span>
          </button>

          <span className="h-4 w-[1px] bg-white/10 hidden sm:block" />

          <button
            onClick={openPrivacidade}
            className="group flex items-center gap-2 text-slate-400 hover:text-[#9146FF] transition-all duration-300 font-mono text-[11px] uppercase tracking-wider cursor-pointer bg-transparent border-none outline-none"
            id="footer_privacidade_btn"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#9146FF] group-hover:scale-110 transition-all duration-305" />
            <span>Políticas de Privacidade</span>
          </button>
        </div>

      </div>
    </footer>
  );
}
