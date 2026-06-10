import { X, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

export default function TermosDeUso({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-3xl bg-[#111116] border border-[#2d2d3a] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] font-sans overflow-hidden"
      >
        {/* EM DESENVOLVIMENTO OVERLAY */}
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto">
          <div className="flex flex-col items-center text-center p-8 bg-[#1A1A1A] border border-[#FF6B35]/20 rounded-xl shadow-2xl max-w-sm mx-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-full flex items-center justify-center mb-6 border border-[#FF6B35]/20">
              <ShieldAlert className="w-8 h-8 text-[#FF6B35] animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Em Desenvolvimento</h3>
            <p className="text-sm text-[#B0B0B0] leading-relaxed mb-6 font-medium">
              Os termos de uso estão sendo atualizados com novas diretrizes de segurança e transparência.
            </p>
            <div className="px-3 py-1 bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded text-[#FF6B35] font-mono text-[10px] font-bold uppercase tracking-widest">
              EM ATUALIZAÇÃO • v2
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between p-6 border-b border-[#2d2d3a]">
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Termos de Uso</h2>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto text-sm text-slate-300 space-y-6 flex-1">
          <section>
            <h3 className="text-white font-bold mb-2">1. Aceitação dos Termos</h3>
            <p>
              Ao acessar e utilizar o Streamer Video Queue ("Plataforma"), você concorda em cumprir estes Termos de Uso (Terms of Service, "ToS") e todas as leis e regulamentos aplicáveis, incluindo a legislação brasileira (Marco Civil da Internet, Lei nº 12.965/14) e as normas aplicáveis dos Estados Unidos, como as diretrizes da FTC e a Digital Millennium Copyright Act (DMCA).
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">2. Descrição do Serviço</h3>
            <p>
              A Plataforma facilita a gestão de filas de vídeos (links) enviados por espectadores (usuários) para serem reproduzidos durante transmissões ao vivo de criadores de conteúdo (streamers). A Plataforma atua apenas como um intermediário na organização e sincronização desses links, não hospedando, efetuando o download ou retransmitindo arquivos de mídia diretamente.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">3. Responsabilidade Sobre o Conteúdo</h3>
            <p>
              Você, seja usuário enviando mídias ou streamer reproduzindo-as, compreende que o conteúdo exibido é proveniente de plataformas de terceiros. A Plataforma isenta-se de qualquer responsabilidade civil ou penal sobre direitos autorais, infrações de propriedade intelectual, ou conteúdos de natureza sensível, imprópria, ou ilícita (Art. 19 do Marco Civil da Internet). Ao utilizar o serviço, o criador de conteúdo assume a função de moderar e zelar pelo conteúdo antes de sua exibição pública.
            </p>
            <p className="mt-2">
              Se você acredita que seu trabalho foi infringido na Plataforma de forma estrutural, poderá enviar uma notificação de acordo com o DMCA, fornecendo a descrição, links comprobatórios e assinatura eletrônica.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">4. Diretrizes da Twitch e Terceiros</h3>
            <p>
              Este aplicativo não é endossado, certificado ou administrado pela Twitch Interactive, Inc., tampouco pelas plataformas de vídeo suportadas (YouTube, TikTok, etc.). Ao utilizar nossa Plataforma integrando-se via OAuth com a Twitch, você concorda adicionalmente com os Termos de Serviço da Twitch e suas Diretrizes para a Comunidade de Transmissões. Quaisquer banimentos em serviços de terceiros devidos a compartilhamento de conteúdo inseguro pelo nosso aplicativo não são de responsabilidade do Streamer Video Queue.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">5. Rescisão</h3>
            <p>
              A Plataforma reserva-se o direito de encerrar, suspender ou restringir sua conta e acesso ao serviço a qualquer momento, sem aviso prévio caso haja violação destes Termos, da política de privacidade ou indício de uso malicioso da infraestrutura em nuvem disponibilizada.
            </p>
          </section>
        </div>
        
        <div className="p-6 border-t border-[#2d2d3a] flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 bg-[#9146FF] hover:bg-[#772ce8] text-white font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-lg shadow-[#9146FF]/20">
            Compreendido
          </button>
        </div>
      </motion.div>
    </div>
  );
}
