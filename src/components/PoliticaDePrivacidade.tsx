import { X } from 'lucide-react';
import { motion } from 'motion/react';
import DevelopmentOverlay from './DevelopmentOverlay';

export default function PoliticaDePrivacidade({ onClose }: { onClose: () => void }) {
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
        <DevelopmentOverlay />
        <div className="flex items-center justify-between p-6 border-b border-[#2d2d3a]">
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Política de Privacidade</h2>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto text-sm text-slate-300 space-y-6 flex-1">
          <section>
            <h3 className="text-white font-bold mb-2">1. Introdução</h3>
            <p>
              No Streamer Video Queue, a sua privacidade é fundamental. Esta Política de Privacidade explica como coletamos, usamos, divulgamos e processamos seus dados pessoais em total conformidade com a Lei Geral de Proteção de Dados (LGPD - Brasil, Lei nº 13.709/2018), com o California Consumer Privacy Act (CCPA - EUA) e regulamentos suplementares aplicáveis sobre proteção e privacidade de dados de identidades integradas com a Twitch.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">2. Coleta de Informações</h3>
            <p>
              <strong>Dados Fornecidos Diretamente:</strong> Ao autenticar via conta da Twitch, coletamos seu nome de usuário (login), nome de exibição, foto do perfil e tokens de acesso OAuth.
            </p>
            <p className="mt-2">
              <strong>Dados Gerados na Plataforma:</strong> Armazenamos logs de utilização anonimizados, sessões iniciadas, histórico de filas e links de mídias compartilhados de forma visível ao público da sala.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">3. Uso dos Dados</h3>
            <p>As informações são utilizadas primariamente para prover o serviço, ou seja:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Identificar quem está enviando ou moderando um vídeo, garantindo a integridade dos dados na sala.</li>
              <li>Oferecer um painel personalizado e integrado ao vivo aos canais assistidos (com auxílio de Helix da Twitch API).</li>
              <li>Aperfeiçoamento de serviço e segurança da plataforma contra abusos da API e comportamentos maliciosos.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">4. Compartilhamento e Proteção de Dados</h3>
            <p>
              Não vendemos ou transferimos seus dados pessoais a terceiros sob propósito puramente comercial (como requer o CCPA). Seus dados podem vir a ser processados por recursos de infraestrutura fundamentais (banco de dados através da plataforma Supabase). Adicionalmente, quando você envia um link, seu nome de exibição fica publicamente correlacionado a este vídeo na fila visível pelo stream e chat.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2">5. Direitos do Titular (LGPD Art. 18 / CCPA)</h3>
            <p>Você tem o direito expresso de:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Requerer confirmação do tratamento, acessar os dados ou solicitar cópia dos mesmos;</li>
              <li>Exigir correções, exclusões ou anonimização de dados pessoais não essenciais;</li>
              <li>Revogar a qualquer momento a integração de serviço OAuth na sua própria conta Twitch, anulando nossa autorização.</li>
            </ul>
          </section>
        </div>
        
        <div className="p-6 border-t border-[#2d2d3a] flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 bg-[#10B981] hover:bg-[#0ea5e9] text-white font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-lg shadow-[#10B981]/20">
            Concordar com Política
          </button>
        </div>
      </motion.div>
    </div>
  );
}
