import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Video } from "../types";

export default function StreamerDashboard() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<Video[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for errors in URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const searchParams = new URLSearchParams(window.location.search);
    
    const errDesc = hashParams.get("error_description") || searchParams.get("error_description");
    if (errDesc) {
      setAuthError(errDesc.replace(/\+/g, ' '));
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    // Listen to real-time broadcasts on the streamer's specific channel
    const channelName = `room_${session.user.id}`;
    
    const channel = supabase.channel(channelName);
    
    channel.on(
      'broadcast',
      { event: 'new_video_link' },
      (payload) => {
        // Add incoming video to the in-memory queue
        const newVideo: Video = payload.payload as Video;
        setQueue((prev) => [...prev, newVideo]);
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "twitch",
      options: {
        redirectTo: window.location.origin + "/dashboard",
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setQueue([]);
  };

  const clearQueue = () => setQueue([]);

  if (loading) {
    return <div className="p-8 flex justify-center text-[#828ba0]">Carregando sessão...</div>;
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="bg-[#11141c] p-8 rounded-xl border border-[#222735] shadow-2xl max-w-sm w-full text-center">
          <h1 className="text-2xl font-semibold mb-2">Painel do Streamer</h1>
          <p className="text-[#828ba0] mb-6 text-sm">Faça login com a Twitch para começar a receber vídeos.</p>
          
          {authError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm font-medium">
              Erro de Autenticação: {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-[#9146FF] hover:bg-[#a268ff] text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            Entrar com Twitch
          </button>
        </div>
      </div>
    );
  }

  const identity = session.user.identities?.find((i: any) => i.provider === 'twitch');
  const streamerUsername = identity?.identity_data?.custom_claims?.preferred_username || 
                           identity?.identity_data?.preferred_username || 
                           session.user.user_metadata?.custom_claims?.preferred_username || 'streamer';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 bg-[#11141c] p-6 rounded-xl border border-[#222735]">
        <div>
          <h1 className="text-2xl font-bold">Painel de Reações</h1>
          <p className="text-[#828ba0] text-sm mt-1">
            Logado como <span className="text-white font-medium">@{streamerUsername}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.open(`/${streamerUsername}`, '_blank')}
            className="bg-[#222735] hover:bg-[#2a3040] text-[#cbd5e1] font-medium py-2 px-4 rounded-lg transition-colors border border-transparent"
          >
            Abrir Link de Viewer
          </button>
          <button
            onClick={handleLogout}
            className="bg-transparent hover:bg-[#222735] text-[#b28282] font-medium py-2 px-4 rounded-lg transition-colors border border-[#222735]"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#f8fafc]">Fila de Vídeos Recebidos ({queue.length})</h2>
        {queue.length > 0 && (
          <button onClick={clearQueue} className="text-sm text-[#828ba0] hover:text-[#b28282] transition-colors">
            Limpar Fila
          </button>
        )}
      </div>

      <div className="space-y-3">
        {queue.length === 0 ? (
          <div className="bg-[#11141c]/50 border border-dashed border-[#222735] p-12 rounded-xl text-center">
            <p className="text-[#828ba0]">Nenhum vídeo recebido ainda.</p>
            <p className="text-sm mt-2 text-[#565e70]">Mande o link /<span className="font-mono">{streamerUsername}</span> para seus viewers.</p>
          </div>
        ) : (
          queue.map((video, idx) => (
            <div key={idx} className="bg-[#11141c] border border-[#222735] p-4 rounded-xl flex items-center justify-between">
              <div className="truncate max-w-[70%]">
                <a href={video.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all mb-1 block">
                  {video.url}
                </a>
                <p className="text-xs text-[#828ba0]">Enviado por viewer (UUID: {video.submitterId.substring(0, 8)}...)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs bg-[#222735] text-[#cbd5e1] rounded-md uppercase tracking-wider">
                  {video.platform}
                </span>
                <button 
                  onClick={() => setQueue(q => q.filter((_, i) => i !== idx))}
                  className="p-2 hover:bg-[#1b1f2b] text-[#b28282] rounded-lg transition-colors"
                >
                  Remover
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
