import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";
import { Video } from "../types";

export default function ViewerPage() {
  const { username } = useParams<{ username: string }>();
  const [streamerId, setStreamerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [statusText, setStatusText] = useState("");
  const [viewerId, setViewerId] = useState<string>("");

  useEffect(() => {
    // Generate or retrieve anonymous Viewer UUID
    let storedId = localStorage.getItem("viewer_uuid");
    if (!storedId) {
      storedId = uuidv4();
      localStorage.setItem("viewer_uuid", storedId);
    }
    setViewerId(storedId);

    // Look up Streamer's ID by username.
    // For this to work, we assume there is a public `streamer_profiles` table
    const fetchStreamer = async () => {
      try {
        setLoading(true);
        // Note: For a real app you need a Public Table/View mapping username to user_id. 
        // Example: 'profiles' table populated by Supabase Auth Triggers.
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .single();

        if (error) {
          console.log("Could not find streamer profile (or table not created yet):", error.message);
          // Fallback UI or handle error
        } else if (data) {
          setStreamerId(data.id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchStreamer();
    }
  }, [username]);

  const detectPlatform = (link: string) => {
    if (link.includes("youtube") || link.includes("youtu.be")) return "youtube";
    if (link.includes("instagram")) return "instagram";
    if (link.includes("tiktok")) return "tiktok";
    return "other";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // In a full production app, you might want to require streamerId to be fetched.
    // However, for testing without the DB table ready, we could temporarily use username as room name. 
    // The prompt architecturally requested: `room_[streamer_id]`.
    const roomId = streamerId ? `room_${streamerId}` : `room_fallback_${username}`;

    setStatusText("Enviando...");

    const channel = supabase.channel(roomId);
    
    const newVideo: Video = {
      id: uuidv4(),
      submitterId: viewerId,
      url: url,
      platform: detectPlatform(url),
      status: "pending",
      timestamp: Date.now()
    };

    // Emit the broadcast payload
    const resp = await channel.send({
      type: "broadcast",
      event: "new_video_link",
      payload: newVideo,
    });

    if (resp === "ok") {
      setStatusText("Link enviado para a tela do streamer!");
      setUrl("");
      
      setTimeout(() => {
         setStatusText("");
      }, 3000);
    } else {
      setStatusText("Falha ao enviar, o streamer pode estar offline.");
    }
    
    // Always remove channel quickly for viewers so we don't leak connection limits 
    // (Broadcasts are fire-and-forget in this UI pattern)
    supabase.removeChannel(channel);
  };

  if (loading) {
    return <div className="p-8 flex justify-center text-[#828ba0]">Carregando página do @{username}...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="bg-[#11141c] p-8 rounded-xl border border-[#222735] shadow-2xl max-w-md w-full">
        <h1 className="text-2xl font-bold mb-1 text-center">Enviar Vídeo</h1>
        <p className="text-center text-[#828ba0] text-sm mb-8">
          Envie sua sugestão diretamente para a live do <span className="text-white">@{username}</span>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[#828ba0] text-xs font-semibold uppercase tracking-wider mb-2">Link do Vídeo</label>
            <input
              type="url"
              required
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#0c0e12] border border-[#222735] rounded-lg px-4 py-3 text-white placeholder-[#565e70] focus:outline-none focus:border-[#42507a] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors mt-2"
          >
            Sugerir Vídeo
          </button>
        </form>

        {statusText && (
          <p className="mt-4 text-center text-sm font-medium text-[#8caf9b]">
            {statusText}
          </p>
        )}
      </div>
      <p className="mt-6 text-xs text-[#565e70]">
        Identificação anônima gerada (UUID: {viewerId.substring(0, 8)})
      </p>
    </div>
  );
}
