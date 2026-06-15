import { useState, useEffect, useMemo } from "react";
import { socket, getBackendUrl } from "../socket";
import { clsx } from "clsx";
import {
  LogIn,
  LogOut,
  Twitch,
  AlertCircle,
  AlertTriangle,
  Crown,
  Search,
  Plus,
  CassetteTape,
  Radio
} from "lucide-react";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "motion/react";
import { supabase, isSecretKeyMistake, isMissingConfig } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import LobbySidebar from "./LobbySidebar";
import LobbyHero from "./LobbyHero";
import LobbyModals from "./LobbyModals";
import LobbyContent from "./LobbyContent";

const TWITCH_COLORS = [
  "#FF0000",
  "#1E90FF",
  "#00FF00",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
  "#A855F7",
];

interface ParticipantRecent {
  roomId: string;
  hostName: string;
  hostAvatar?: string;
  visitedAt: string;
  submissionsCount?: number;
}

export default function Lobby() {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Advanced infinite parallax scroll engines with dynamic physics and multi-layered depth
  const { scrollY } = useScroll();

  // 1. Nebula Background: Slow organic sine-wave horizontal/vertical sway and breathing that never run off-screen
  const rawBgY = useTransform(scrollY, (v) => Math.sin(v / 500) * 40);
  const bgY = useSpring(rawBgY, { stiffness: 15, damping: 25, mass: 1 });
  const rawBgScale = useTransform(scrollY, (v) => 1.05 + Math.cos(v / 800) * 0.03);
  const bgScale = useSpring(rawBgScale, { stiffness: 15, damping: 25, mass: 1 });

  // 2. Seamless Infinite Tech Grid: Math loop at exactly grid height (60px) to scroll infinitely with ZERO jumps or snaps
  const rawGridY = useTransform(scrollY, (v) => -(v % 60));
  const gridY = useSpring(rawGridY, { stiffness: 45, damping: 22 });

  // 3. Multi-Depth Floating Micro-Stars: Individual depth sways that flutter dynamically on scroll
  const depthSlowY = useTransform(scrollY, (v) => Math.sin(v / 300) * 20);
  const depthSlowX = useTransform(scrollY, (v) => Math.cos(v / 350) * 10);

  const depthMediumY = useTransform(scrollY, (v) => Math.sin(v / 200) * 45);
  const depthMediumX = useTransform(scrollY, (v) => Math.cos(v / 240) * 20);

  const depthFastY = useTransform(scrollY, (v) => Math.sin(v / 140) * 70);
  const depthFastX = useTransform(scrollY, (v) => Math.cos(v / 160) * 30);

  // Procedural star layout coordinates to map depth groups
  const STARS_PRESET = useMemo(() => [
    { top: "12%", left: "8%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "22%", left: "85%", size: "w-1 h-1", depth: "medium" },
    { top: "45%", left: "12%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "62%", left: "80%", size: "w-1 h-1", depth: "medium" },
    { top: "78%", left: "18%", size: "w-1.5 h-1.5 bg-accent/40 animate-pulse", depth: "fast" },
    { top: "34%", left: "73%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "88%", left: "55%", size: "w-1 h-1", depth: "medium" },
    { top: "8%", left: "92%", size: "w-1.5 h-1.5 bg-white/40 animate-pulse", depth: "fast" },
    { top: "52%", left: "77%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "94%", left: "28%", size: "w-1 h-1", depth: "medium" },
    { top: "6%", left: "42%", size: "w-1 h-1", depth: "medium" },
    { top: "58%", left: "48%", size: "w-0.5 h-0.5", depth: "slow" },
    { top: "28%", left: "28%", size: "w-1.5 h-1.5 bg-[#00FF66]/30 animate-pulse", depth: "fast" },
    { top: "72%", left: "62%", size: "w-1 h-1", depth: "medium" },
    { top: "38%", left: "94%", size: "w-0.5 h-0.5", depth: "slow" },
  ], []);

  // Modal display toggles
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isHostConfirmOpen, setIsHostConfirmOpen] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [discoveredRooms, setDiscoveredRooms] = useState<any[]>([]);
  const [discoveredRoomsLoading, setDiscoveredRoomsLoading] = useState(false);

  // Twitch Helix metadata storage
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState("");
  const [twitchDisplayName, setTwitchDisplayName] = useState("");
  const [twitchAvatar, setTwitchAvatar] = useState("");
  const [twitchColor, setTwitchColor] = useState("");
  const [twitchUserIdState, setTwitchUserIdState] = useState("");
  const [twitchFollowedData, setTwitchFollowedData] = useState<any>(null);
  const [loadingTwitchData, setLoadingTwitchData] = useState(false);

  const [requestedQueues, setRequestedQueues] = useState<string[]>([]);
  const [submittingHost, setSubmittingHost] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setSupabaseUser(user);
      if (user?.id) {
        localStorage.setItem("active_supabase_user_id", user.id);
      } else {
        localStorage.removeItem("active_supabase_user_id");
      }
      setLoadingUser(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setSupabaseUser(user);
      if (user?.id) {
        localStorage.setItem("active_supabase_user_id", user.id);
      } else {
        localStorage.removeItem("active_supabase_user_id");
      }
      setLoadingUser(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchActiveRooms = async () => {
    try {
      setDiscoveredRoomsLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/rooms`);
      if (res.ok) {
        const rooms = await res.json();
        setDiscoveredRooms(Array.isArray(rooms) ? rooms : (rooms && Array.isArray(rooms.rooms) ? rooms.rooms : []));
      }
    } catch (e) {
      console.warn("Failed fetching active rooms list from backend nodes", e);
    } finally {
      setDiscoveredRoomsLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveRooms();
    const interval = setInterval(fetchActiveRooms, 15000);
    return () => clearInterval(interval);
  }, []);

  // Sync token and details when Supabase session changes
  useEffect(() => {
    if (supabaseUser) {
      const meta = supabaseUser.user_metadata || {};
      const username = meta.user_name || meta.name || "";
      const dName = meta.full_name || meta.name || username;
      const avatar = meta.avatar_url || meta.picture || "";

      setTwitchUsername(username);
      setTwitchDisplayName(dName);
      setTwitchAvatar(avatar);

      const cachedKey = `twitch_provider_token_${supabaseUser.id}`;
      const cached = localStorage.getItem(cachedKey);
      if (cached) {
        setProviderToken(cached);
      } else {
        supabase.auth.getSession().then(({ data: { session } }) => {
          const token = session?.provider_token || null;
          if (token) {
            setProviderToken(token);
            localStorage.setItem(cachedKey, token);
          }
        });
      }

      // Assign custom profile colors
      let sum = 0;
      for (let i = 0; i < username.length; i++) {
        sum += username.charCodeAt(i);
      }
      setTwitchColor(TWITCH_COLORS[sum % TWITCH_COLORS.length]);
    }
  }, [supabaseUser]);

  // Sync Helix profiles of followed streams
  useEffect(() => {
    if (supabaseUser && providerToken) {
      setLoadingTwitchData(true);
      const controller = new AbortController();

      const fetchFollowed = async () => {
        try {
          const response = await fetch(
            `${getBackendUrl()}/api/twitch/followed?token=${providerToken}&userId=${
              supabaseUser.user_metadata.provider_id ||
              supabaseUser.user_metadata.sub ||
              ""
            }`,
            { signal: controller.signal }
          );
          if (response.ok) {
            const data = await response.json();
            setTwitchFollowedData(data);
          }
        } catch (err: any) {
          if (err.name !== "AbortError") {
            setAuthError(err.message || "Failed parsing followed channels");
          }
        } finally {
          setLoadingTwitchData(false);
        }
      };

      fetchFollowed();
      return () => controller.abort();
    }
  }, [supabaseUser, providerToken]);

  // Auto join session if room key is cached
  useEffect(() => {
    const activeRoom = localStorage.getItem("active_room_id");
    const activePayload = localStorage.getItem("active_session_payload");

    if (activeRoom && activePayload) {
      try {
        const parsed = JSON.parse(activePayload);
        if (parsed && parsed.roomId === activeRoom) {
          return; // Session is already restored on App.tsx Level
        }
      } catch (e) {
        // Ignored
      }
    }

    if (supabaseUser && twitchUsername && twitchDisplayName) {
      const urlParams = new URLSearchParams(window.location.search);
      const targetRoom = urlParams.get("room") || localStorage.getItem("active_supabase_room_id");

      if (targetRoom && targetRoom.trim().length === 4) {
        const isPastHost =
          targetRoom === activeRoom &&
          localStorage.getItem("active_role") === "host";
        const payload = buildTwitchPayload(isPastHost);
        const joinPayload = {
          roomId: targetRoom.trim().toUpperCase(),
          name: payload.displayName,
          userId: supabaseUser.id,
          twitchData: payload,
        };
        localStorage.setItem("active_session_payload", JSON.stringify(joinPayload));

        saveVisitHistory(
          targetRoom,
          isPastHost ? "Host" : payload.displayName,
          payload.avatarUrl
        );

        socket.emit("join_session", joinPayload);
        localStorage.setItem("active_room_id", targetRoom.trim().toUpperCase());
        localStorage.setItem("active_role", isPastHost ? "host" : "participant");
      }
    }
  }, [supabaseUser, twitchUsername, twitchDisplayName, providerToken]);

  const saveVisitHistory = (roomId: string, hostName: string, avatar?: string) => {
    try {
      const historyStr = localStorage.getItem("queue_visited_history") || "[]";
      let history: ParticipantRecent[] = JSON.parse(historyStr);

      history = history.filter((h) => h.roomId !== roomId);
      history.unshift({
        roomId,
        hostName,
        hostAvatar: avatar,
        visitedAt: new Date().toISOString(),
        submissionsCount: Math.floor(Math.random() * 3) + 1,
      });

      localStorage.setItem("queue_visited_history", JSON.stringify(history.slice(0, 5)));
    } catch (e) {
      console.error(e);
    }
  };

  const getRecentHistory = (): ParticipantRecent[] => {
    try {
      return JSON.parse(localStorage.getItem("queue_visited_history") || "[]");
    } catch (e) {
      return [];
    }
  };

  const handleSignOut = async () => {
    if (supabaseUser) {
      localStorage.removeItem(`twitch_provider_token_${supabaseUser.id}`);
    }
    localStorage.removeItem("active_supabase_user_id");
    await supabase.auth.signOut();
    setSupabaseUser(null);
    setTwitchUsername("");
    setTwitchDisplayName("");
    setTwitchAvatar("");
    setTwitchFollowedData(null);
    setProviderToken(null);
    localStorage.removeItem("queue_visited_history");
  };

  const buildTwitchPayload = (asBroadcaster = false) => {
    const badges: string[] = [];
    if (asBroadcaster) {
      badges.push("broadcaster");
    }

    const meta = supabaseUser?.user_metadata || {};
    const twitchUserId = meta.provider_id || meta.sub || "";

    return {
      avatarUrl: twitchAvatar || "",
      login: twitchUsername.trim().toLowerCase(),
      displayName: twitchDisplayName.trim(),
      twitchUserId,
      providerToken: providerToken || undefined,
      isBroadcaster: asBroadcaster,
      isModerator: asBroadcaster,
      isVip: false,
      isSubscriber: asBroadcaster,
      isFollower: asBroadcaster,
      followedAt: asBroadcaster
        ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString()
        : undefined,
      color: twitchColor,
      badges,
    };
  };

  const handleCreate = async () => {
    if (!supabaseUser || submittingHost) return;
    setSubmittingHost(true);
    const payload = buildTwitchPayload(true);

    const twitchId =
      supabaseUser.identities?.find((i) => i.provider === "twitch")?.id || payload.login;

    try {
      const { data: insertedRoom } = await supabase
        .from("rooms")
        .upsert(
          {
            owner_id: supabaseUser.id,
            twitch_channel_id: twitchId,
          },
          { onConflict: "owner_id" }
        )
        .select()
        .single();

      if (insertedRoom && insertedRoom.id) {
        localStorage.setItem("active_supabase_room_id", insertedRoom.id);
      }
    } catch (e) {
      console.warn("Using socket runtime fallback registration.", e);
    }

    localStorage.setItem(
      "host_join_template",
      JSON.stringify({
        name: payload.displayName,
        userId: supabaseUser.id,
        twitchData: payload,
      })
    );

    socket.emit("create_session", {
      name: payload.displayName,
      userId: supabaseUser.id,
      twitchData: payload,
    });
  };

  const handleJoin = (targetRoomId: string) => {
    if (!targetRoomId.trim() || isJoiningRoom) return;

    if (!supabaseUser) {
      handleLoginTwitch();
      return;
    }

    setIsJoiningRoom(true);
    const cleanRoomCode = targetRoomId.trim().toUpperCase();
    const matchedRoom = discoveredRooms.find((r) => r.roomId === cleanRoomCode);

    let matchedFollower = false;
    let followTimestamp: string | undefined = undefined;

    const hostLogin = matchedRoom?.hostLogin;
    const hostTwitchUserId = matchedRoom?.hostTwitchUserId;

    if (twitchFollowedData && (hostLogin || hostTwitchUserId)) {
      const lowerHostLogin = hostLogin?.toLowerCase();

      const foundInFollowed = twitchFollowedData.followed?.find(
        (f: any) =>
          (hostTwitchUserId && f.broadcaster_id === hostTwitchUserId) ||
          (lowerHostLogin && f.broadcaster_login?.toLowerCase() === lowerHostLogin)
      );

      const foundInOnline = twitchFollowedData.online?.find(
        (o: any) =>
          (hostTwitchUserId && o.user_id === hostTwitchUserId) ||
          (lowerHostLogin && o.user_login?.toLowerCase() === lowerHostLogin)
      );

      if (foundInFollowed || foundInOnline) {
        matchedFollower = true;
        followTimestamp = foundInFollowed?.followed_at || undefined;
      }
    }

    const payload = buildTwitchPayload(false);
    if (matchedFollower) {
      payload.isFollower = true;
      if (followTimestamp) {
        payload.followedAt = followTimestamp;
      }
    }

    const joinPayload = {
      roomId: cleanRoomCode,
      name: payload.displayName,
      userId: supabaseUser.id,
      twitchData: payload,
    };

    saveVisitHistory(
      cleanRoomCode,
      matchedRoom?.hostName || "Streamer Pool",
      matchedRoom?.hostAvatar || ""
    );

    localStorage.setItem("active_session_payload", JSON.stringify(joinPayload));
    socket.emit("join_session", joinPayload);

    setTimeout(() => {
      setIsJoiningRoom(false);
    }, 10000);
  };

  const handleLoginTwitch = () => {
    supabase.auth.signInWithOAuth({
      provider: "twitch",
      options: {
        scopes: "channel:read:redemptions channel:read:subscriptions chat:read chat:edit moderator:manage:banned_users moderator:read:chatters moderator:read:followers channel:read:vips channel:manage:redemptions user:read:follows",
        redirectTo: window.location.origin,
      },
    });
  };

  const handleManualCodeJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim().length === 4) {
      handleJoin(roomIdInput.trim());
      setIsJoinModalOpen(false);
    }
  };

  const handleRequestQueue = (streamerLogin: string) => {
    if (requestedQueues.includes(streamerLogin)) return;
    setRequestedQueues((prev) => [...prev, streamerLogin]);
  };

  const recentHistoryList = getRecentHistory();

  // Merge sever rooms with follow lists
  const processedOnlineStreamers = useMemo(() => {
    let list: any[] = [];
    const roomsList = Array.isArray(discoveredRooms) ? discoveredRooms : [];

    if (twitchFollowedData && twitchFollowedData.online && twitchFollowedData.online.length > 0) {
      twitchFollowedData.online.forEach((stream: any) => {
        const activeRoom = roomsList.find(
          (r) =>
            r.hostLogin?.toLowerCase() === stream.user_login?.toLowerCase() ||
            r.hostTwitchUserId === stream.user_id
        );

        list.push({
          login: stream.user_login,
          displayName: stream.user_name,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${stream.user_name}`,
          title: stream.title,
          game: stream.game_name,
          viewers: stream.viewer_count,
          category: stream.game_name?.toLowerCase().includes("chat") ? "just-chatting" : "gaming",
          roomId: activeRoom?.roomId || null,
          activeQueueCount: activeRoom ? activeRoom.queueCount : -1,
          hasOpenedQueueBefore: !!stream.hasOpenedQueueBefore,
          uptimeText: "Ao Vivo",
          trendingFactor: "Canal Seguido",
        });
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.displayName.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.game?.toLowerCase().includes(q)
      );
    }

    if (selectedCategory === "live-queue") {
      list = list.filter((item) => item.roomId !== null);
    } else if (selectedCategory === "gaming") {
      list = list.filter((item) => item.category === "gaming");
    } else if (selectedCategory === "just-chatting") {
      list = list.filter((item) => item.category === "just-chatting");
    }

    return list;
  }, [twitchFollowedData, discoveredRooms, searchQuery, selectedCategory]);

  const offlineFollowedStreamers = useMemo(() => {
    const list: any[] = [];

    if (twitchFollowedData && twitchFollowedData.followed && twitchFollowedData.followed.length > 0) {
      twitchFollowedData.followed.forEach((follow: any) => {
        const isOnline = twitchFollowedData.online?.some(
          (o: any) => o.user_id === follow.broadcaster_id
        );
        if (!isOnline) {
          list.push({
            login: follow.broadcaster_login,
            displayName: follow.broadcaster_name,
            avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${follow.broadcaster_name}&backgroundColor=222`,
            followedAt: follow.followed_at,
            hasOpenedQueueBefore: !!follow.hasOpenedQueueBefore,
          });
        }
      });
    }

    return list;
  }, [twitchFollowedData]);

  const activeQueuesStats = useMemo(() => {
    const roomsList = Array.isArray(discoveredRooms) ? discoveredRooms : [];
    return {
      totalRooms: roomsList.length,
      totalUsers: roomsList.reduce((acc, r) => acc + r.usersCount, 0),
      totalVideosInQueues: roomsList.reduce((acc, r) => acc + r.queueCount, 0),
    };
  }, [discoveredRooms]);

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050608] crt-screen crt-flicker select-none">
        <div className="flex flex-col items-center gap-3 font-mono">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] text-[#00FF66] uppercase tracking-widest animate-pulse font-bold">
            CONECTANDO AO SISTEMA...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="crt-screen min-h-screen text-white flex flex-col font-sans relative antialiased selection:bg-[#9146FF]/30 overflow-hidden"
    >
      {/* Parallax Background Canvas with nebula image */}
      <motion.div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat z-0 pointer-events-none"
        style={{ 
          backgroundImage: "url('/Background.jpeg')",
          y: bgY,
          scale: bgScale,
        }}
      />

      {/* 1. Seamless Infinite Cyberpunk Digital Grid (Seamless 60px modulus vertical scroll) */}
      <motion.div 
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(145, 70, 255, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(145, 70, 255, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          y: gridY,
        }}
      />

      {/* 2. Procedural Multi-Depth Stars (Infinite Scroll Sway) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {STARS_PRESET.map((star, idx) => {
          let transformX = depthSlowX;
          let transformY = depthSlowY;
          if (star.depth === "medium") {
            transformX = depthMediumX;
            transformY = depthMediumY;
          } else if (star.depth === "fast") {
            transformX = depthFastX;
            transformY = depthFastY;
          }
          return (
            <motion.div
              key={idx}
              className={`absolute rounded-full bg-white/50 ${star.size}`}
              style={{
                top: star.top,
                left: star.left,
                x: transformX,
                y: transformY,
              }}
            />
          );
        })}
      </div>
      
      {/* Dark Translucent overlay to maintain extreme contrast and layout elegance */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] pointer-events-none z-0" />
      
      {/* Background Cathode sweeping scanning bar */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00FF66]/2 to-transparent h-1 opacity-20 pointer-events-none animate-pulse-phosphor z-50 transform translate-y-0" style={{ animationDuration: '8s' }} />

      {/* TOP HEADER CONTROLS */}
      <header className="sticky top-0 z-[100] h-16 bg-black/40 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex-1 hidden sm:flex items-center">
          <img src="/LOGO.jpeg" alt="Logo" className="w-12 h-auto object-contain mix-blend-screen drop-shadow-md" />
        </div>
        
        {/* Console Search Input Box */}
        <div className="flex-1 max-w-sm sm:max-w-md mx-4 relative z-10">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Buscar canais, títulos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-black/40 border border-white/10 hover:border-white/20 focus:border-[#9146FF] rounded-lg px-3 pl-9 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#9146FF]/40 transition-all font-mono backdrop-blur-sm"
            id="lobby_search_terminal"
          />
        </div>

        {/* Widget Profile Connections */}
        <div className="flex-1 flex justify-end items-center gap-3 z-10">
          {supabaseUser && (
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="h-9 px-3 bg-black/30 border border-white/10 hover:bg-black/50 text-[10px] font-bold text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-mono uppercase"
              >
                <span>[CÓDIGO]</span>
              </button>

              <button
                onClick={() => setIsHostConfirmOpen(true)}
                className="h-9 px-3 bg-[#9146FF] hover:bg-[#772ce8] text-[10px] font-black text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-mono uppercase shadow-md shadow-[#9146FF]/20 border border-white/10"
              >
                <Crown className="w-3.5 h-3.5 text-[#FFEA00]" />
                <span>MEU HOST</span>
              </button>
            </div>
          )}

          {!supabaseUser ? (
            <button
              onClick={handleLoginTwitch}
              className="h-9 px-4 bg-[#9146FF] hover:bg-[#772ce8] text-[10px] font-black text-white rounded-lg flex items-center gap-2 uppercase transition-all cursor-pointer shadow-lg shadow-[#9146FF]/30 font-mono border border-white/10"
            >
              <Twitch className="w-3.5 h-3.5 fill-current" /> CONECTAR TWITCH
            </button>
          ) : (
            <div className="flex items-center gap-2.5 bg-black/30 border border-white/10 p-1 px-2 rounded-lg backdrop-blur-sm">
              {twitchAvatar ? (
                <img
                  src={twitchAvatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-[3px] border border-white/10"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-[3px] flex items-center justify-center text-[10px] font-black text-white shrink-0"
                  style={{ backgroundColor: twitchColor || "#9146FF" }}
                >
                  {twitchDisplayName.substring(0, 1).toUpperCase()}
                </div>
              )}

              <div className="text-left hidden lg:block leading-none mr-1 font-mono">
                <span className="text-[9px] font-black block truncate text-slate-200" style={{ color: twitchColor }}>
                  {twitchDisplayName}
                </span>
                <span className="text-[7.5px] text-slate-500 block mt-0.5">
                  @{twitchUsername.toLowerCase()}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                title="Desconectar"
                className="p-1 text-slate-400 hover:text-red-400 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* DEV SECRET WARNING BAR */}
      {(isSecretKeyMistake || isMissingConfig) && (
        <div className="bg-[#1b0a0d] border-y border-[#EF4444]/15 py-2 px-6 text-[10px] text-slate-400 flex items-center justify-between gap-4 font-mono select-none">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444]" />
            <p>
              <strong>[CONEXÃO_WARNING]:</strong> Chaves Supabase não encontradas ou mal configuradas no seu workspace .env.
            </p>
          </div>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="text-[9px] font-black underline uppercase text-white hover:text-primary"
          >
            Ajustar
          </a>
        </div>
      )}

      {/* MAIN SCREEN SPLITTER */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto relative">
        <LobbySidebar
          supabaseUser={supabaseUser}
          loadingTwitchData={loadingTwitchData}
          processedOnlineStreamers={processedOnlineStreamers}
          offlineFollowedStreamers={offlineFollowedStreamers}
          activeQueuesStats={activeQueuesStats}
          requestedQueues={requestedQueues}
          handleLoginTwitch={handleLoginTwitch}
          handleJoin={handleJoin}
          handleRequestQueue={handleRequestQueue}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 sm:p-6 lg:p-8 pb-0">
            <LobbyHero
              supabaseUser={supabaseUser}
              submittingHost={submittingHost}
              isJoiningRoom={isJoiningRoom}
              activeQueuesStats={activeQueuesStats}
              handleLoginTwitch={handleLoginTwitch}
              setIsJoinModalOpen={setIsJoinModalOpen}
              setIsHostConfirmOpen={setIsHostConfirmOpen}
            />
          </div>

          <LobbyContent
            processedOnlineStreamers={processedOnlineStreamers}
            offlineFollowedStreamers={offlineFollowedStreamers}
            recentHistoryList={recentHistoryList}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            requestedQueues={requestedQueues}
            handleJoin={handleJoin}
            handleRequestQueue={handleRequestQueue}
            discoveredRooms={discoveredRooms}
            setIsHostConfirmOpen={setIsHostConfirmOpen}
          />
        </div>
      </div>

      {/* SMALL INPUT DEVICE ACCESS FLOATS */}
      <div className="fixed bottom-4 right-4 z-[100] lg:hidden flex gap-2">
        <button
          onClick={() => setIsJoinModalOpen(true)}
          className="w-11 h-11 bg-[#11141b] border border-white/10 rounded-full flex items-center justify-center text-slate-300 shadow-xl cursor-pointer"
        >
          <LogIn className="w-4 h-4 text-accent" />
        </button>
        <button
          onClick={() => setIsHostConfirmOpen(true)}
          className="w-11 h-11 bg-primary border border-primary/20 rounded-full flex items-center justify-center text-white shadow-xl cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Development Status Banner - Moved here from App.tsx */}
      <div className="select-none border-t border-white/10 bg-[#FF8C42] px-4 py-2 text-center relative z-50">
        <p className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-wider text-white md:text-xs">
          <AlertCircle className="h-3 w-3 shrink-0 text-white md:h-4 md:w-4" />
          Este serviço está em fase de desenvolvimento e pode apresentar instabilidades.
        </p>
      </div>

      {/* DESIGN FOOTER WARNINGS BAR */}
      <footer className="bg-[#0c1017] border-t border-white/5 py-5 px-8 text-center text-[10px] text-slate-550 font-mono select-none">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <p>© 2026 S-Queue System Terminal. All Rights Reserved.</p>
          <div className="flex gap-4">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("openModal", { detail: "termos" }))}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Termos de Uso
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("openModal", { detail: "privacidade" }))}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacidade
            </button>
          </div>
        </div>
      </footer>

      {/* POPUP COMM_ALERTS */}
      <LobbyModals
        isJoinModalOpen={isJoinModalOpen}
        setIsJoinModalOpen={setIsJoinModalOpen}
        roomIdInput={roomIdInput}
        setRoomIdInput={setRoomIdInput}
        handleManualCodeJoinSubmit={handleManualCodeJoinSubmit}
        isHostConfirmOpen={isHostConfirmOpen}
        setIsHostConfirmOpen={setIsHostConfirmOpen}
        twitchUsername={twitchUsername}
        handleCreate={handleCreate}
        submittingHost={submittingHost}
      />
    </div>
  );
}
