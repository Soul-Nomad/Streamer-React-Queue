import { AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function DevelopmentOverlay() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[4px] cursor-not-allowed select-none rounded-inherit"
    >
      <div className="bg-[#1A1A1A] border border-[#FF6B35]/40 px-8 py-4 rounded-sm shadow-[0_0_30px_rgba(255,107,53,0.15)] flex flex-col items-center gap-3">
        <div className="p-3 bg-[#FF6B35]/10 rounded-full">
            <AlertCircle className="w-8 h-8 text-[#FF6B35] animate-pulse" />
        </div>
        <div className="text-center">
            <h3 className="text-[#FF6B35] font-black uppercase tracking-[0.2em] text-sm font-mono">
              Em Desenvolvimento
            </h3>
            <p className="text-[#B0B0B0] text-[10px] uppercase font-bold tracking-wider mt-1 font-sans opacity-70">
              Esta funcionalidade será liberada em breve
            </p>
        </div>
      </div>
    </motion.div>
  );
}
