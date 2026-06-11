import { useState, useEffect, useMemo } from "react";
import { socket, getBackendUrl } from "../socket";
import clsx from "clsx";
import {
  MonitorPlay,
  LogIn,
  LogOut,
  Twitch,
  AlertTriangle,
  HelpCircle,
  Check,
  Shield,
  Star,
  Crown,
  Search,
  SlidersHorizontal,
  Radio,
  Flame,
  History,
  Sparkles,
  User,
  Users,
  ChevronRight,
  Tv,
  FolderHeart,
  Plus,
  Clock,
  BellRing,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase, isSecretKeyMistake, isMissingConfig } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// Deterministic colors for streamers
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

  // App routing & action states
  const [roomIdInput, setRoomIdInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "live-queue" | "gaming" | "just-chatting"
  >("all");
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isHostConfirmOpen, setIsHostConfirmOpen] = useState(false);

  // Real platform queue rooms from server
  const [discoveredRooms, setDiscoveredRooms] = useState<any[]>([]);
  const [discoveredRoomsLoading, setDiscoveredRoomsLoading] = useState(false);

  // Twitch Helix API states inside our secure proxy
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState("");
  const [twitchDisplayName, setTwitchDisplayName] = useState("");
  const [twitchAvatar, setTwitchAvatar] = useState("");
  const [twitchColor, setTwitchColor] = useState("#9146FF");
  const [twitchUserIdState, setTwitchUserIdState] = useState("");

  const [twitchFollowedData, setTwitchFollowedData] = useState<{
    online: any[];
    followed: any[];
  } | null>(null);
  const [loadingTwitchData, setLoadingTwitchData] = useState(false);

  // Notifications and simulated interactions
  const [requestedQueues, setRequestedQueues] = useState<string[]>([]);
  const [submittingHost, setSubmittingHost] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  // Fetch active queue slots from our Express server
  const fetchActiveRooms = async () => {
    setDiscoveredRoomsLoading(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/rooms`);
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setDiscoveredRooms(data.rooms || []);
        } catch (parseError) {
          // gracefully ignore JSON parse errors like "Rate exceeded" text
        }
      }
    } catch (e) {
      // gracefully ignore network errors like "Failed to fetch"
    } finally {
      setDiscoveredRoomsLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveRooms();
    const interval = setInterval(fetchActiveRooms, 15000); // Polling update every 15s
    return () => clearInterval(interval);
  }, []);

  // Twitch OAuth Auth Handling & Token Fetching
  useEffect(() => {
    // Read room query code automatically if an invitation link was used
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get("room");
    if (urlRoom) {
      localStorage.setItem("pending_room_id", urlRoom.trim().toUpperCase());
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLoginTwitch = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "twitch",
      options: {
        scopes:
          "moderator:read:followers channel:read:subscriptions user:read:follows user:read:subscriptions moderation:read",
        redirectTo: window.location.origin,
      },
    });
  };

  // Force login if an invite link was used and user is not authenticated
  useEffect(() => {
    if (!loadingUser && !supabaseUser) {
      const pendingRoom = localStorage.getItem("pending_room_id");
      if (pendingRoom) {
        handleLoginTwitch();
      }
    }
  }, [loadingUser, supabaseUser]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        const sUser = session?.user ?? null;
        setSupabaseUser(sUser);
        if (sUser) {
          localStorage.setItem("active_supabase_user_id", sUser.id);
        } else {
          localStorage.removeItem("active_supabase_user_id");
        }
        if (session?.provider_token) {
          setProviderToken(session.provider_token);
          if (sUser) {
            localStorage.setItem(
              `twitch_provider_token_${sUser.id}`,
              session.provider_token,
            );
          }
        } else if (sUser) {
          const savedToken = localStorage.getItem(
            `twitch_provider_token_${sUser.id}`,
          );
          if (savedToken) {
            setProviderToken(savedToken);
          }
        }
        if (sUser) {
          parseSupabaseUser(sUser);
        }
        setLoadingUser(false);
      })
      .catch((err) => {
        console.error("Supabase Init Error:", err);
        setAuthError(err?.message || String(err));
        setLoadingUser(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sUser = session?.user ?? null;
      setSupabaseUser(sUser);
      if (sUser) {
        localStorage.setItem("active_supabase_user_id", sUser.id);
      } else {
        localStorage.removeItem("active_supabase_user_id");
      }
      if (session?.provider_token) {
        setProviderToken(session.provider_token);
        if (sUser) {
          localStorage.setItem(
            `twitch_provider_token_${sUser.id}`,
            session.provider_token,
          );
        }
      } else if (sUser) {
        const savedToken = localStorage.getItem(
          `twitch_provider_token_${sUser.id}`,
        );
        if (savedToken) {
          setProviderToken(savedToken);
        }
      } else if (!session) {
        setProviderToken(null);
      }
      if (sUser) {
        parseSupabaseUser(sUser);
      } else {
        setTwitchUsername("");
        setTwitchDisplayName("");
        setTwitchAvatar("");
        setTwitchFollowedData(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const parseSupabaseUser = (sUser: SupabaseUser) => {
    const meta = sUser.user_metadata || {};
    const preferredUsername =
      meta.custom_claims?.preferred_username ||
      meta.preferred_username ||
      meta.name ||
      meta.full_name ||
      "user";
    setTwitchUsername(preferredUsername);
    setTwitchDisplayName(meta.name || meta.full_name || preferredUsername);

    const avatar = meta.avatar_url || meta.picture || "";
    setTwitchAvatar(avatar);

    const twitchUserId = meta.provider_id || meta.sub || "";
    setTwitchUserIdState(twitchUserId);

    const hash = preferredUsername
      .split("")
      .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    setTwitchColor(TWITCH_COLORS[hash % TWITCH_COLORS.length]);
  };

  // Fetch follows and online streamers using our custom server API proxy
  useEffect(() => {
    if (!supabaseUser || !providerToken || !twitchUserIdState) return;

    setLoadingTwitchData(true);
    fetch(
      `${getBackendUrl()}/api/twitch/followed?token=${providerToken}&userId=${twitchUserIdState}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Network response was not ok");
        const text = await res.text();
        return JSON.parse(text);
      })
      .then((data) => {
        if (data && !data.error) {
          setTwitchFollowedData(data);
        }
        setLoadingTwitchData(false);
      })
      .catch((err) => {
        // gracefully ignore fetch errors like rate limits
        setLoadingTwitchData(false);
      });
  }, [supabaseUser, providerToken, twitchUserIdState]);

  // Automatic Join Hook when returning to previous session
  useEffect(() => {
    if (supabaseUser && twitchUsername && twitchDisplayName) {
      const pendingRoom = localStorage.getItem("pending_room_id");
      const activeRoom = localStorage.getItem("active_room_id");
      const targetRoom = pendingRoom || activeRoom;

      if (targetRoom) {
        localStorage.removeItem("pending_room_id");

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
        localStorage.setItem(
          "active_session_payload",
          JSON.stringify(joinPayload),
        );

        // Save historic room reference for Continue Section
        saveVisitHistory(
          targetRoom,
          isPastHost ? "Host" : payload.displayName,
          payload.avatarUrl,
        );

        socket.emit("join_session", joinPayload);
        localStorage.setItem("active_room_id", targetRoom.trim().toUpperCase());
        localStorage.setItem(
          "active_role",
          isPastHost ? "host" : "participant",
        );
      }
    }
  }, [supabaseUser, twitchUsername, twitchDisplayName, providerToken]);

  // Save visits helper
  const saveVisitHistory = (
    roomId: string,
    hostName: string,
    avatar?: string,
  ) => {
    try {
      const historyStr = localStorage.getItem("queue_visited_history") || "[]";
      let history: ParticipantRecent[] = JSON.parse(historyStr);

      // Filter out duplicate
      history = history.filter((h) => h.roomId !== roomId);
      history.unshift({
        roomId,
        hostName,
        hostAvatar: avatar,
        visitedAt: new Date().toISOString(),
        submissionsCount: Math.floor(Math.random() * 3) + 1, // static metadata placeholder
      });

      // Cap to last 5
      localStorage.setItem(
        "queue_visited_history",
        JSON.stringify(history.slice(0, 5)),
      );
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

  // Launch Host Stream Room
  const handleCreate = async () => {
    if (!supabaseUser || submittingHost) return;
    setSubmittingHost(true);
    const payload = buildTwitchPayload(true);

    // Register the room inside SQL/Supabase persistence
    const twitchId =
      supabaseUser.identities?.find((i) => i.provider === "twitch")?.id ||
      payload.login;

    try {
      const { data: insertedRoom, error } = await supabase
        .from("rooms")
        .upsert(
          {
            owner_id: supabaseUser.id,
            twitch_channel_id: twitchId,
          },
          { onConflict: "owner_id" },
        )
        .select()
        .single();

      if (insertedRoom && insertedRoom.id) {
        localStorage.setItem("active_supabase_room_id", insertedRoom.id);
      }
    } catch (e) {
      console.warn(
        "PostgreSQL rooms registry schema was not fully loaded, using socket runtime room creation instead.",
      );
    }

    localStorage.setItem(
      "host_join_template",
      JSON.stringify({
        name: payload.displayName,
        userId: supabaseUser.id,
        twitchData: payload,
      }),
    );

    socket.emit("create_session", {
      name: payload.displayName,
      userId: supabaseUser.id,
      twitchData: payload,
    });
  };

  // Join Target Queue
  const handleJoin = (targetRoomId: string) => {
    if (!targetRoomId.trim() || isJoiningRoom) return;

    if (!supabaseUser) {
      handleLoginTwitch();
      return;
    }

    setIsJoiningRoom(true);

    const cleanRoomCode = targetRoomId.trim().toUpperCase();
    const matchedRoom = discoveredRooms.find((r) => r.roomId === cleanRoomCode);

    // Resolve follower status client-side utilizing Twitch cache
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

    // Register to recent entries local history
    saveVisitHistory(
      cleanRoomCode,
      matchedRoom?.hostName || "Streamer Pool",
      matchedRoom?.hostAvatar || "",
    );

    localStorage.setItem("active_session_payload", JSON.stringify(joinPayload));
    socket.emit("join_session", joinPayload);

    // Timeout safety fallback
    setTimeout(() => {
        setIsJoiningRoom(false);
    }, 10000);
  };

  const handleManualCodeJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.length === 4) {
      handleJoin(roomIdInput);
      setIsJoinModalOpen(false);
    }
  };

  // Merge server rooms with follow lists
  const processedOnlineStreamers = useMemo(() => {
    // 1. If user has followed channels online from Helix, prioritize them
    let list: any[] = [];

    if (
      twitchFollowedData &&
      twitchFollowedData.online &&
      twitchFollowedData.online.length > 0
    ) {
      twitchFollowedData.online.forEach((stream) => {
        // Cross reference if this live user is currently in our platform's active server room list
        const activeRoom = discoveredRooms.find(
          (r) =>
            r.hostLogin?.toLowerCase() === stream.user_login?.toLowerCase() ||
            r.hostTwitchUserId === stream.user_id,
        );

        list.push({
          login: stream.user_login,
          displayName: stream.user_name,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${stream.user_name}`,
          title: stream.title,
          game: stream.game_name,
          viewers: stream.viewer_count,
          category: stream.game_name?.toLowerCase().includes("chat")
            ? "just-chatting"
            : "gaming",
          roomId: activeRoom?.roomId || null,
          activeQueueCount: activeRoom ? activeRoom.queueCount : -1, // -1 means streamer is live but queue room is offline/closed
          hasOpenedQueueBefore: !!stream.hasOpenedQueueBefore,
          uptimeText: "Ao Vivo",
          trendingFactor: "Canal Seguido",
        });
      });
    }

    // 2. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.displayName.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.game?.toLowerCase().includes(q),
      );
    }

    // 4. Category Filter
    if (selectedCategory === "live-queue") {
      list = list.filter((item) => item.roomId !== null);
    } else if (selectedCategory === "gaming") {
      list = list.filter((item) => item.category === "gaming");
    } else if (selectedCategory === "just-chatting") {
      list = list.filter((item) => item.category === "just-chatting");
    }

    return list;
  }, [twitchFollowedData, discoveredRooms, searchQuery, selectedCategory]);

  // Offline Channels mapping
  const offlineFollowedStreamers = useMemo(() => {
    let list: any[] = [];

    if (
      twitchFollowedData &&
      twitchFollowedData.followed &&
      twitchFollowedData.followed.length > 0
    ) {
      // Get all followed users
      twitchFollowedData.followed.forEach((follow: any) => {
        // If they aren't online, they are offline!
        const isOnline = twitchFollowedData.online?.some(
          (o: any) => o.user_id === follow.broadcaster_id,
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

  // Total active queue rooms globally running in our backend
  const activeQueuesStats = useMemo(() => {
    return {
      totalRooms: discoveredRooms.length,
      totalUsers: discoveredRooms.reduce((acc, r) => acc + r.usersCount, 0),
      totalVideosInQueues: discoveredRooms.reduce(
        (acc, r) => acc + r.queueCount,
        0,
      ),
    };
  }, [discoveredRooms]);

  // Handle requesting a queue opening for an offline/closed streamer (engagement loop)
  const handleRequestQueue = (streamerLogin: string) => {
    if (requestedQueues.includes(streamerLogin)) return;
    setRequestedQueues((prev) => [...prev, streamerLogin]);
  };

  const recentHistoryList = getRecentHistory();

  // If loading basic user authentications
  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070708]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[#9146FF] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono text-[#B0B0B0] uppercase tracking-wider animate-pulse">
            Carregando Plataforma...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col font-sans relative antialiased selection:bg-[#9146FF]/30">
      {/* BACKGROUND MATTE GRIDS ACCORDING TO SENIOR UI PLATFORM SPECIFICATION */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(145,70,255,0.04)_0%,transparent_50%)] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(255,107,53,0.03)_0%,transparent_50%)] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.003)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.003)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-50"></div>

      {/* TOP HEADER NAVIGATION BAR */}
      <header className="sticky top-0 z-[100] h-16 bg-[#0f0f13]/95 border-b border-[#1b1b22] backdrop-blur-md px-4 sm:px-6 flex items-center justify-between">
        {/* Brand Identity with Logo and Streamer Active Indicator */}
        <div className="flex items-center gap-3 select-none">
          <div className="w-9 h-9 bg-gradient-to-br from-[#9146FF] to-[#FF6B35] rounded-xl flex items-center justify-center shadow-lg shadow-[#9146FF]/15">
            <MonitorPlay className="w-5 h-5 text-white" />
          </div>
          <div className="text-left hidden sm:block">
            <h1 className="text-sm font-black uppercase tracking-wider text-white font-sans flex items-center gap-1.5 leading-none">
              Streamer Video Queue
              <span className="h-2 w-2 rounded-full bg-[#10B981] animate-ping shrink-0" />
            </h1>
            <p className="text-[10px] text-[#8e8e9c] font-semibold mt-0.5">
              Sincronização de Fila Twitch em Tempo Real
            </p>
          </div>
        </div>

        {/* Global Live Room/User search filter */}
        <div className="flex-1 max-w-sm sm:max-w-md mx-4 relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#52526b]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Buscar streamer, jogo, título ou código de sala..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-[#16161f] border border-[#2d2d3a] hover:border-[#424254] focus:border-[#9146FF] rounded-xl px-3 pl-9 text-xs text-white placeholder-[#52526b] focus:outline-none focus:ring-1 focus:ring-[#9146FF]/50 transition-all font-sans"
          />
        </div>

        {/* Action Widgets and Twitch account profile integration */}
        <div className="flex items-center gap-3">
          {/* Quick Access Actions when logged in */}
          {supabaseUser && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="h-9 px-3 bg-[#1c1c24] border border-[#2e2e3d] hover:bg-[#252530] text-xs font-bold text-white rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                id="header_quick_join"
              >
                <LogIn className="w-3.5 h-3.5 text-[#FF8C42]" />
                <span className="hidden md:inline">Entrar por Código</span>
              </button>

              <button
                onClick={() => setIsHostConfirmOpen(true)}
                className="h-9 px-3 bg-gradient-to-r from-[#9146FF] to-[#7c3aed] hover:from-[#772ce8] hover:to-[#6d28d9] text-xs font-extrabold text-white rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#9146FF]/15"
                id="header_quick_host"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Iniciar meu Host</span>
              </button>
            </div>
          )}

          {/* Account Profile Trigger */}
          {!supabaseUser ? (
            <button
              onClick={handleLoginTwitch}
              className="h-9 px-4 bg-[#9146FF] hover:bg-[#772ce8] text-xs font-extrabold text-white rounded-xl flex items-center gap-2 tracking-wide uppercase transition-all cursor-pointer shadow-lg shadow-[#9146FF]/20"
              id="header_login_twitch"
            >
              <Twitch className="w-4 h-4 fill-current" /> Entrar com Twitch
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#16161f] border border-[#252532] p-1.5 px-2.5 rounded-xl">
              {twitchAvatar ? (
                <img
                  src={twitchAvatar}
                  alt={twitchDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-lg border border-[#303042]"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                  style={{ backgroundColor: twitchColor || "#9146FF" }}
                >
                  {twitchDisplayName.substring(0, 1).toUpperCase()}
                </div>
              )}

              <div className="text-left hidden lg:block leading-none mr-2">
                <span
                  className="text-[10px] font-bold text-slate-200 block truncate"
                  style={{ color: twitchColor }}
                >
                  {twitchDisplayName}
                </span>
                <span className="text-[8px] text-slate-500 font-mono block">
                  @{twitchUsername.toLowerCase()}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                title="Desconectar Conta"
                className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800/20 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* DETACTED SECRET WARNING */}
      {(isSecretKeyMistake || isMissingConfig) && (
        <div className="bg-[#2a1215] border-y border-[#FF3B30]/20 py-2.5 px-6 text-xs text-slate-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#F44336] shrink-0" />
            <p>
              <strong>Atenção Desenvolvedor:</strong>{" "}
              {isSecretKeyMistake
                ? 'Você inseriu sua chave privada "sb_secret_..." (Service Role) ao invés da chave pública "anon_key" no seu .env.'
                : "As chaves de configuração do Supabase não foram encontradas. Ative a integração com anon_key."}
            </p>
          </div>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-black underline uppercase text-white hover:text-[#9146FF]"
          >
            Ajustar Chave
          </a>
        </div>
      )}

      {/* MAIN LAYOUT WRAPPER (SIDEBAR + CONTENT BODY) */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto relative">
        {/* LEFT SIDEBAR (TWITCH SYNC FEED RAIL - DESKTOP ONLY) */}
        <aside className="w-64 bg-[#0a0a0c] border-r border-[#15151c] p-4 hidden lg:flex flex-col gap-5 shrink-0 select-none">
          {/* Section 1: Live Followed Queues Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <Radio className="w-3" style={{ color: "#10B981" }} /> Fila dos
                Seguidos
              </span>
              <span className="text-[10px] bg-[#9146FF]/10 text-[#9146FF] px-2 py-0.5 rounded-full font-bold font-mono">
                {
                  processedOnlineStreamers.filter((s) => s.roomId !== null)
                    .length
                }
              </span>
            </div>

            {/* If not logged in follow state */}
            {!supabaseUser ? (
              <div className="p-3.5 bg-[#12121a] border border-[#232332] rounded-xl text-center space-y-2.5">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Faça login com a Twitch para ver seus streamers favoritos na
                  barra de fila ao vivo.
                </p>
                <button
                  onClick={handleLoginTwitch}
                  className="w-full py-2 bg-[#9146FF]/10 hover:bg-[#9146FF]/20 border border-[#9146FF]/30 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer hover:shadow-sm"
                >
                  Vincular Twitch
                </button>
              </div>
            ) : loadingTwitchData ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 animate-pulse"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800"></div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-slate-800 rounded-md w-2/3"></div>
                      <div className="h-2 bg-slate-800 rounded-md w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : processedOnlineStreamers.filter((s) => s.roomId !== null)
                .length === 0 ? (
              <div className="p-3.5 bg-slate-950/40 border border-dashed border-[#222230] rounded-xl text-center">
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  Nenhum canal seguido está ao vivo com fila aberta agora.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {processedOnlineStreamers
                  .filter((s) => s.roomId !== null)
                  .map((streamer, idx) => (
                    <div
                      key={idx}
                      onClick={() =>
                        streamer.roomId && handleJoin(streamer.roomId)
                      }
                      className="flex items-center justify-between p-2.5 rounded-lg border border-[#10B981]/25 bg-[#10B981]/5 hover:bg-[#10B981]/10 hover:border-[#10B981]/50 cursor-pointer transition-all duration-200"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative">
                          <img
                            src={streamer.avatarUrl}
                            className="w-7 h-7 rounded-md object-cover border border-[#2d2d3c]"
                            alt=""
                          />
                          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#10B981] ring-1 ring-black" />
                        </div>
                        <div className="text-left min-w-0">
                          <span
                            className="text-xs font-bold text-slate-200 block truncate"
                            style={{ color: streamer.color || "#fff" }}
                          >
                            {streamer.displayName}
                          </span>
                          <span className="text-[9px] text-slate-400 block truncate">
                            {streamer.game || "Sem Jogo"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[8px] uppercase tracking-wider font-extrabold text-[#11c78b] block">
                          Fila On
                        </span>
                        <span className="text-[9px] text-[#A0A0A0] font-mono block font-semibold">
                          {streamer.activeQueueCount} vds
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Section 2: Active Server Node Performance Meter */}
          <div className="p-4 bg-gradient-to-br from-[#12121a] to-[#0d0d12] border border-[#20202d] rounded-xl space-y-3">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-black block">
              Status da Rede
            </span>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="bg-[#191924]/60 p-2 rounded-lg border border-[#292937]/50">
                <span className="text-[8px] text-slate-400 font-bold block uppercase leading-none">
                  Salas Ativas
                </span>
                <span className="text-sm font-extrabold text-slate-100 block mt-1 font-mono">
                  {activeQueuesStats.totalRooms}
                </span>
              </div>
              <div className="bg-[#191924]/60 p-2 rounded-lg border border-[#292937]/50">
                <span className="text-[8px] text-slate-400 font-bold block uppercase leading-none">
                  Fila Total
                </span>
                <span className="text-sm font-extrabold text-slate-100 block mt-1 font-mono">
                  {activeQueuesStats.totalVideosInQueues}
                </span>
              </div>
            </div>

            <div className="border-t border-[#20202d] pt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Ping Servidor:</span>
              <span className="text-[#10B981] font-bold">18ms</span>
            </div>
          </div>

          {/* Section 3: Followed Channels Offline */}
          <div className="space-y-3 pt-2">
            <div className="border-t border-[#1b1b26] pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FolderHeart className="w-3.5 h-3.5 text-slate-500" /> Canais
                  Offline
                </span>
                <span className="text-[9px] bg-slate-950 px-1.5 py-0.5 text-slate-500 font-mono rounded-md">
                  {offlineFollowedStreamers.length}
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto max-h-40 pr-1">
                {offlineFollowedStreamers.slice(0, 4).map((streamer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[#161622]/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={streamer.avatarUrl}
                        className="w-6 h-6 rounded-md object-cover border border-[#1b1b24] opacity-50"
                        alt=""
                      />
                      <span className="text-xs text-slate-400 truncate font-semibold block leading-none">
                        {streamer.displayName}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono text-slate-600 block shrink-0">
                      Offline
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* FRONTEND CONTENT CONTAINER AREA */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-full min-w-0 space-y-10 pb-20">
          {/* DYNAMIC NETFLIX-STYLE SPOTLIGHT HERO PROMO BANNER */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1b1130] via-[#0b0816] to-[#040407] border border-[#311f59]/40 p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-8 shadow-2xl transition-all duration-300 hover:border-[#422285]/60">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(145,70,255,0.12)_0%,transparent_70%)] pointer-events-none" />
            <div className="absolute top-4 right-4 bg-[#9146FF]/20 border border-[#9146FF]/40 text-[#dca8ff] px-3 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest font-black animate-pulse flex items-center gap-1.5 shadow-sm">
              <Radio className="w-3" style={{ color: "#10B981" }} /> Spotlight
              Room
            </div>

            {/* Banner Meta Info */}
            <div className="text-left space-y-4 max-w-xl z-10">
              <div className="flex items-center gap-2">
                <span className="bg-[#9146FF]/15 text-[#b087ff] border border-[#9146FF]/40 px-3 py-1 rounded-lg text-[10px] font-mono uppercase font-black tracking-wide">
                  Mídia Livre
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-semibold">
                  <Flame className="w-4 h-4 text-orange-500 animate-bounce" />{" "}
                  Sala Em Destaque de Hoje
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight uppercase font-sans bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                ASSISTA VÍDEOS ENVIADOS PELO SEU CHAT DA TWITCH EM TEMPO REAL
              </h2>
              <p className="text-sm text-slate-300 font-sans leading-relaxed">
                Nossa plataforma processa uploads de vídeos curtos como Reels,
                TikToks e YouTube Shorts em tempo real sem latência do player,
                permitindo moderação coletiva. Conecte de forma simples!
              </p>

              <div className="pt-2 flex flex-wrap gap-3.5 items-center">
                {supabaseUser ? (
                  <button
                    disabled={submittingHost || isJoiningRoom}
                    onClick={() => {
                      if (discoveredRooms.length > 0) {
                        handleJoin(discoveredRooms[0].roomId);
                      } else {
                        setIsHostConfirmOpen(true);
                      }
                    }}
                    className={clsx(
                      "h-11 px-6 bg-gradient-to-r from-[#FF6B35] to-[#FF8C42] hover:from-[#ff7947] hover:to-[#ff9b57] active:scale-95 text-xs text-white font-extrabold tracking-wider uppercase rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-[#FF6B35]/20 hover:shadow-[#FF6B35]/40",
                      (submittingHost || isJoiningRoom) ? "opacity-70 cursor-wait" : "hover:scale-[1.02] cursor-pointer"
                    )}
                  >
                    {(submittingHost || isJoiningRoom) ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <Sparkles className="w-4 h-4" />
                    )}
                    {submittingHost ? "Preparando Sala..." : isJoiningRoom ? "Conectando..." : (discoveredRooms.length > 0
                      ? "Participar da Fila Maior"
                      : "Iniciar Fila do Meu Canal")}
                  </button>
                ) : (
                  <button
                    onClick={handleLoginTwitch}
                    className="h-11 px-6 bg-[#9146FF] hover:bg-[#7d32ec] hover:scale-[1.02] active:scale-95 text-xs text-white font-extrabold tracking-wider uppercase rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-[#9146FF]/30 hover:shadow-[#9146FF]/50"
                  >
                    <Twitch className="w-4 h-4 fill-current" /> Começar Agora
                    via Twitch
                  </button>
                )}

                <button
                  onClick={() => setIsJoinModalOpen(true)}
                  disabled={submittingHost || isJoiningRoom}
                  className="h-11 px-5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-xs font-bold text-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Search className="w-4 h-4 text-slate-400" /> Buscar outra
                  sala
                </button>
              </div>
            </div>

            {/* Showcase Visual Widget */}
            <div className="w-full sm:w-auto relative shrink-0 z-10">
              <div className="w-full sm:w-48 bg-[#100e16]/90 border border-[#31254a]/80 p-5 rounded-2xl text-center space-y-4 relative shadow-2xl transition-all duration-300 hover:scale-[1.03] hover:border-[#4d3a78]">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-[#FF6B35]/30 to-[#FF8C42]/30 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-500 blur-sm -z-10" />
                <div className="w-14 h-14 bg-gradient-to-br from-[#FF6B35] to-[#FF8C42] rounded-xl flex items-center justify-center mx-auto text-white shadow-lg glow-purple">
                  <Tv className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold block text-slate-100">
                    Fila Compartilhada
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans block leading-normal">
                    Espectadores enviam links de vídeos, streamers assistem ao
                    vivo no app.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC CATEGORY METRICS NAVIGATION PILLS */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1b1b22] pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-[#9146FF] text-white"
                    : "bg-[#15151f] hover:bg-[#1d1d2b] text-slate-400 hover:text-white border border-[#2d2d3a]"
                }`}
              >
                Todas as Salas
              </button>
              <button
                onClick={() => setSelectedCategory("live-queue")}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === "live-queue"
                    ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/25"
                    : "bg-[#15151f] hover:bg-[#1d1d2b] text-slate-400 hover:text-white border border-[#2d2d3a]"
                }`}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />{" "}
                Filas Ativas no App
              </button>
              <button
                onClick={() => setSelectedCategory("just-chatting")}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "just-chatting"
                    ? "bg-[#9146FF] text-white"
                    : "bg-[#15151f] hover:bg-[#1d1d2b] text-slate-400 hover:text-white border border-[#2d2d3a]"
                }`}
              >
                Just Chatting
              </button>
              <button
                onClick={() => setSelectedCategory("gaming")}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "gaming"
                    ? "bg-[#9146FF] text-white"
                    : "bg-[#15151f] hover:bg-[#1d1d2b] text-slate-400 hover:text-white border border-[#2d2d3a]"
                }`}
              >
                Categorias de Jogos
              </button>
            </div>
          </div>

          {/* SECTION 1: CANAIS SEGUIDOS ONLINE COM FILA ABERTA */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 bg-[#9146FF]/10 text-[#9146FF] rounded-lg flex items-center justify-center">
                  <Radio className="w-4 h-4 text-[#9146FF]" />
                </div>
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                  Canais Seguidos Online
                </h3>
                <span className="text-xs bg-slate-800 text-slate-400 font-mono font-bold px-2 py-0.5 rounded">
                  {
                    processedOnlineStreamers.filter((s) => s.roomId !== null)
                      .length
                  }{" "}
                  Live
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Filtro em tempo real
              </span>
            </div>

            {(() => {
              const sortedAndPrioritized = [...processedOnlineStreamers].sort(
                (a, b) => {
                  // 1. roomId !== null (active queue has top priority)
                  if (a.roomId !== null && b.roomId === null) return -1;
                  if (a.roomId === null && b.roomId !== null) return 1;

                  // 2. hasOpenedQueueBefore === true (used product gets next priority)
                  if (a.hasOpenedQueueBefore && !b.hasOpenedQueueBefore)
                    return -1;
                  if (!a.hasOpenedQueueBefore && b.hasOpenedQueueBefore)
                    return 1;

                  // Sort by viewer count or just alphabetical as fallback
                  return (b.viewers || 0) - (a.viewers || 0);
                },
              );

              if (sortedAndPrioritized.length === 0) {
                return (
                  <div className="bg-[#12121a] border border-[#232333]/60 rounded-2xl p-10 text-center space-y-4">
                    <HelpCircle className="w-9 h-9 text-slate-600 mx-auto" />
                    <div className="max-w-md mx-auto space-y-1.5">
                      <span className="text-sm font-bold text-slate-300 block">
                        Nenhum canal seguido está ao vivo
                      </span>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Nenhum criador que você segue está ao vivo no momento.
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sortedAndPrioritized.map((streamer, idx) => {
                    const isLiveQueue = streamer.roomId !== null;
                    const isVeteran = streamer.hasOpenedQueueBefore;

                    return (
                      <div
                        key={idx}
                        className={`group bg-[#111116] border transition-all duration-300 text-left flex flex-col justify-between rounded-2xl overflow-hidden hover:scale-[1.01] ${
                          isLiveQueue
                            ? "border-[#10B981]/40 hover:border-[#10B981] hover:shadow-xl hover:shadow-[#10B981]/5 glow-success"
                            : isVeteran
                              ? "border-[#9146FF]/30 hover:border-[#9146FF]/80 glow-purple opacity-95 hover:opacity-100"
                              : "border-[#2d2d3e]/40 hover:border-slate-700 opacity-60 hover:opacity-100" // low priority
                        }`}
                      >
                        {/* Visual aspect preview */}
                        <div className="relative bg-slate-950 aspect-video overflow-hidden border-b border-[#1b1b24] rounded-t-2xl">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent z-10" />

                          {/* Badge indicating system status */}
                          {isLiveQueue ? (
                            <div className="absolute top-3 left-3 bg-[#10B981] text-black px-2.5 py-1 rounded-lg text-[9px] font-mono tracking-wider uppercase font-black z-20 flex items-center gap-1">
                              <Check className="w-3" /> Fila Aberta
                            </div>
                          ) : isVeteran ? (
                            <div className="absolute top-3 left-3 bg-[#9146FF] text-white px-2.5 py-1 rounded-lg text-[9px] font-mono tracking-wider uppercase font-black z-20 flex items-center gap-1">
                              <Radio className="w-3 animate-pulse" /> Já abriu
                              Fila
                            </div>
                          ) : (
                            <div className="absolute top-3 left-3 bg-slate-900/90 text-slate-450 px-2.5 py-1 rounded-lg text-[9px] font-mono tracking-wider uppercase font-bold z-20 flex items-center gap-1 border border-slate-800">
                              <Tv className="w-3" /> Sem Histórico
                            </div>
                          )}

                          <div className="absolute bottom-3 right-3 bg-[#121216]/95 border border-slate-700/40 px-2 py-1 rounded-lg text-[9px] font-mono font-bold z-20 text-slate-200">
                            {streamer.viewers.toLocaleString("pt-BR")}{" "}
                            assistindo
                          </div>

                          {/* Mock thumbnail art representation */}
                          <div className="absolute inset-0 flex items-center justify-center text-slate-800">
                            <Tv className="w-12 h-12 opacity-15" />
                          </div>
                        </div>

                        <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                          <div className="flex items-start gap-3">
                            <img
                              src={streamer.avatarUrl}
                              className="w-9 h-9 rounded-xl object-cover border border-[#2d2d3c]"
                              alt=""
                            />
                            <div className="min-w-0 flex-1 leading-tight">
                              <span
                                className="text-sm font-extrabold block truncate"
                                style={{ color: streamer.color }}
                              >
                                {streamer.displayName}
                              </span>
                              <p
                                className="text-[11px] text-slate-400 font-medium block truncate mt-0.5"
                                title={streamer.title}
                              >
                                {streamer.title}
                              </p>
                              <span className="text-[9px] text-[#9146FF] font-mono font-bold uppercase block mt-1.5">
                                {streamer.game}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-[#1a1a24] pt-4.5 flex items-center justify-between gap-2 mt-auto">
                            {isLiveQueue ? (
                              <>
                                <div className="text-left font-mono">
                                  <span className="text-[8px] text-slate-500 uppercase block font-bold leading-none">
                                    Coleção
                                  </span>
                                  <span className="text-xs font-extrabold text-[#11c78b] block mt-0.5">
                                    {streamer.activeQueueCount} mídias
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleJoin(streamer.roomId)}
                                  className="h-9 px-3.5 bg-[#10B981] hover:bg-[#12b27d] text-[9px] text-black font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-[#10B981]/10 hover:shadow-[#10B981]/20 hover:scale-[1.03]"
                                >
                                  Entrar na Fila
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="text-left font-mono">
                                  <span className="text-[8px] text-slate-500 uppercase block font-bold leading-none">
                                    Status
                                  </span>
                                  <span className="text-xs font-bold text-slate-400 block mt-0.5">
                                    Sem Sala no Momento
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    handleRequestQueue(streamer.login)
                                  }
                                  disabled={requestedQueues.includes(
                                    streamer.login,
                                  )}
                                  className={`h-9 px-3.5 text-[9px] uppercase font-bold rounded-xl transition-all cursor-pointer ${
                                    requestedQueues.includes(streamer.login)
                                      ? "bg-emerald-950/20 text-[#10B981] border border-emerald-900/30"
                                      : isVeteran
                                        ? "bg-[#9146FF]/10 text-[#9146FF] hover:bg-[#9146FF]/25 border border-[#9146FF]/30 hover:scale-[1.02]"
                                        : "bg-white/[0.02] hover:bg-slate-800 text-slate-400 hover:text-white border border-[#2d2d3e] hover:scale-[1.02]"
                                  }`}
                                >
                                  {requestedQueues.includes(streamer.login)
                                    ? "✓ OK!"
                                    : "Pedir Fila"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* SECTION 2: CONTINUE DE ONDE PAROU (LAST SESSIONS) */}
          {recentHistoryList.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 bg-orange-500/10 text-[#FF8C42] rounded-lg flex items-center justify-center">
                  <History className="w-4 h-4 text-[#FF8C42]" />
                </div>
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                  Continue de Onde Parou
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {recentHistoryList.map((hist, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleJoin(hist.roomId)}
                    className="bg-[#121217] border border-[#22222d] hover:border-[#FF8C42]/40 p-4 rounded-xl text-left cursor-pointer transition-all hover:scale-[1.01] flex items-center gap-3 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 h-1 bg-gradient-to-r from-transparent to-[#FF8C42]/20 w-1/2 group-hover:w-full transition-all duration-300" />
                    {hist.hostAvatar ? (
                      <img
                        src={hist.hostAvatar}
                        className="w-9 h-9 rounded-lg object-cover border border-slate-700/30"
                        alt=""
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs">
                        {hist.hostName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="text-[9px] text-[#FF8C42] font-mono uppercase tracking-widest font-black leading-none block">
                        Recente • Código #{hist.roomId.substring(0, 6)}
                      </span>
                      <span className="text-xs font-black text-slate-100 block truncate mt-1">
                        {hist.hostName}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono block mt-1">
                        Conectado há{" "}
                        {new Date(hist.visitedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 3: RECOMENDADOS PARA VOCÊ */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 bg-indigo-500/10 text-indigo-400 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                  Recomendados para Você
                </h3>
              </div>
              <span className="text-xs text-indigo-455 font-bold font-mono">
                Matches baseados em tags
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {processedOnlineStreamers.slice(0, 3).map((stream, idx) => {
                const matchPercentages = [98, 95, 91, 88];
                return (
                  <div
                    key={idx}
                    className="group bg-[#111116] border border-[#1f1f2a] hover:border-indigo-500/30 rounded-2xl overflow-hidden transition-all duration-350 hover:scale-[1.01] text-left flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-550/5 glow-purple"
                  >
                    <div className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={stream.avatarUrl}
                            className="w-9 h-9 rounded-xl object-cover border border-[#2d2d3c]"
                            alt=""
                          />
                          <div>
                            <span
                              className="text-xs font-extrabold block"
                              style={{ color: stream.color }}
                            >
                              {stream.displayName}
                            </span>
                            <span className="text-[9px] text-[#818cf8] font-mono font-bold block uppercase mt-0.5">
                              {matchPercentages[idx % 4]}% Compatibilidade
                            </span>
                          </div>
                        </div>
                        <span className="text-[8px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-black tracking-wide uppercase">
                          Recomendado
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        Sugerido para você porque você assiste e segue canais da
                        categoria{" "}
                        <strong className="text-indigo-300 font-extrabold">
                          "{stream.game || "Just Chatting"}"
                        </strong>
                        .
                      </p>

                      <div className="bg-[#151520]/80 p-2.5 rounded-xl border border-indigo-950/20 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        <span className="text-[10px] text-slate-400 truncate block font-sans">
                          Título: <em>"{stream.title || "Sem título"}"...</em>
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#14141d] p-4 px-5 border-t border-[#1b1b26] flex items-center justify-between">
                      <span className="text-[10px] text-slate-455 font-mono font-bold uppercase block">
                        {stream.viewers.toLocaleString("pt") || "1k"} assistindo
                      </span>
                      {stream.roomId ? (
                        <button
                          onClick={() => handleJoin(stream.roomId)}
                          className="h-8.5 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer hover:scale-[1.02]"
                        >
                          Conectar à fila
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRequestQueue(stream.login)}
                          disabled={requestedQueues.includes(stream.login)}
                          className={`h-8.5 px-3.5 text-[10px] uppercase font-bold rounded-xl transition-all cursor-pointer ${
                            requestedQueues.includes(stream.login)
                              ? "bg-slate-800 text-slate-500"
                              : "bg-white/[0.03] hover:bg-[#9146FF]/10 text-slate-350 hover:text-white border border-white/[0.08] hover:scale-[1.02]"
                          }`}
                        >
                          {requestedQueues.includes(stream.login)
                            ? "Fila Solicitada!"
                            : "Solicitar Fila"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 4 & 7: SALAS POPULARES & EVENTOS AO VIVO */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center">
                  <Radio className="w-4 h-4 text-red-500" />
                </div>
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                  Salas Populares & Eventos Ao Vivo
                </h3>
              </div>
              <span className="text-xs bg-[#FF6B35]/10 text-[#FF6B35] px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                VIBRANTE AGORA
              </span>
            </div>

            {discoveredRooms.length === 0 ? (
              <div className="p-10 bg-[#121217] border border-white/[0.03] rounded-2xl text-center space-y-3">
                <Crown className="w-10 h-10 text-slate-700 mx-auto" />
                <div className="max-w-md mx-auto space-y-2">
                  <span className="text-sm font-bold text-slate-300 block">
                    Nenhuma Fila Ativa em Andamento
                  </span>
                  <p className="text-xs text-slate-500 leading-relaxed pb-2">
                    Seja o primeiro a iniciar uma rede de vídeo na plataforma
                    criando sua própria sala!
                  </p>
                  <button
                    onClick={() => setIsHostConfirmOpen(true)}
                    className="h-9 px-4 bg-gradient-to-r from-[#FF6B35] to-[#FF8C42] text-xs font-black uppercase rounded-lg transition-colors cursor-pointer"
                  >
                    Abrir Nova Sala
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {discoveredRooms.map((room) => (
                  <div
                    key={room.roomId}
                    className="bg-[#111116] border border-[#2d2038]/60 hover:border-[#FF8C42]/50 p-6 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:shadow-[#FF8C42]/5 glow-orange group"
                  >
                    <div className="space-y-4">
                      {/* Room Header and ID */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {room.hostAvatar ? (
                            <img
                              src={room.hostAvatar}
                              className="w-9 h-9 rounded-xl shrink-0 object-cover border border-[#2d2d3c]"
                              alt=""
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-bold shrink-0">
                              {room.hostName.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="text-xs font-black text-slate-100 block group-hover:text-[#FF8C42] transition-colors">
                              {room.hostName}
                            </span>
                            <span className="text-[10px] text-slate-550 font-mono block mt-0.5">
                              Streamer Host
                            </span>
                          </div>
                        </div>
                        <div className="bg-[#FF8C42]/10 border border-[#FF8C42]/25 px-2.5 py-1 rounded-lg text-center shrink-0">
                          <span className="text-[8px] text-slate-400 block font-bold leading-none uppercase">
                            Canal
                          </span>
                          <span className="text-xs font-mono font-black text-[#FF8C42] block mt-1 uppercase">
                            #{room.roomId.substring(0, 6)}
                          </span>
                        </div>
                      </div>

                      {/* Stats bento indicators */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-[#1f1a26]/40 p-3 rounded-xl border border-[#2a2333]/30">
                          <span className="text-[9px] text-[#A0A0A0] font-mono uppercase block">
                            Conectados
                          </span>
                          <span className="text-base font-black text-slate-200 block mt-1 font-mono">
                            {room.usersCount}
                          </span>
                        </div>
                        <div className="bg-[#1f1a26]/40 p-3 rounded-xl border border-[#2a2333]/30">
                          <span className="text-[9px] text-[#A0A0A0] font-mono uppercase block">
                            Vídeos na Fila
                          </span>
                          <span className="text-base font-black text-[#10B981] block mt-1 font-mono">
                            {room.queueCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-[#23202e] mt-4 pt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-[#A0A0A0]">
                        <Clock className="w-3.5 h-3.5 text-slate-650" />
                        <span>Online à {Math.floor(room.uptime / 60000)}m</span>
                      </div>

                      <button
                        onClick={() => {
                          handleJoin(room.roomId);
                        }}
                        className="h-8.5 px-4 bg-gradient-to-r from-[#FF8C42] to-[#ff9e5e] hover:scale-[1.02] text-xs text-white font-extrabold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-[#FF8C42]/10"
                      >
                        Conectar <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SECTION 5: COMUNIDADES EM CRESCIMENTO (TRENDING CHANNELS) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
                </div>
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                  Comunidades em Crescimento
                </h3>
              </div>
              <span className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer font-medium">
                Mais ativos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {processedOnlineStreamers.slice(2, 6).map((stream, idx) => {
                const growthRates = [
                  "+94% atividade",
                  "+41% envios",
                  "+32% chat",
                  "+18% fila",
                ];
                return (
                  <div
                    key={idx}
                    className="bg-[#111116] border border-[#232333]/60 p-4.5 rounded-2xl text-left flex items-center justify-between transition-all duration-300 hover:border-[#9146FF]/35 hover:scale-[1.01] hover:shadow-xl hover:shadow-[#9146FF]/5 glow-purple"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={stream.avatarUrl}
                        className="w-8 h-8 rounded-xl object-cover border border-[#23232d]"
                        alt=""
                      />
                      <div className="min-w-0">
                        <span
                          className="text-xs font-black text-slate-200 block truncate"
                          style={{ color: stream.color }}
                        >
                          {stream.displayName}
                        </span>
                        <span className="text-[10px] text-amber-450 font-bold block mt-0.5">
                          {growthRates[idx % 4]}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        stream.roomId
                          ? handleJoin(stream.roomId)
                          : handleRequestQueue(stream.login)
                      }
                      className="text-[9px] font-extrabold uppercase tracking-wider bg-white/[0.03] hover:bg-[#9146FF]/10 text-slate-200 hover:text-white border border-white/[0.08] px-3 py-1.5 rounded-xl transition-all cursor-pointer hover:scale-[1.03]"
                    >
                      {stream.roomId ? "Entrar" : "Pedir"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 6: CANAIS SEGUIDOS OFFLINE COM MAIS DETALHES */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 h-7 w-7 bg-indigo-500/10 text-[#a855f7] rounded-lg flex items-center justify-center">
                <FolderHeart className="w-4 h-4 text-[#a855f7]" />
              </div>
              <h3 className="text-base font-extrabold uppercase tracking-wide text-white font-sans">
                Canais Seguidos Offline
              </h3>
            </div>

            <div className="bg-[#0e0e12] border border-[#1b1b28] rounded-2xl p-6 shadow-xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {(() => {
                  const sortedOffline = [...offlineFollowedStreamers].sort(
                    (a, b) => {
                      const valA = a.hasOpenedQueueBefore ? 1 : 0;
                      const valB = b.hasOpenedQueueBefore ? 1 : 0;
                      return valB - valA;
                    },
                  );

                  return sortedOffline.map((stream, idx) => {
                    const isVeteran = stream.hasOpenedQueueBefore;
                    return (
                      <div
                        key={idx}
                        className={`p-4 bg-[#13131b]/60 border rounded-xl text-center space-y-3 relative group flex flex-col justify-between transition-all duration-200 hover:scale-[1.02] hover:bg-[#161622]/80 ${
                          isVeteran
                            ? "border-[#9146FF]/30 opacity-95 hover:border-[#9146FF] glow-purple"
                            : "border-[#232333]/30 opacity-50 hover:opacity-100 hover:border-slate-700"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="relative inline-block">
                            <img
                              src={stream.avatarUrl}
                              className="w-11 h-11 rounded-xl object-cover mx-auto border border-[#2c2c3d]/60 opacity-80 group-hover:opacity-100 transition-opacity"
                              alt=""
                            />
                            {isVeteran && (
                              <span className="absolute -top-1 -right-1 text-[7px] font-black uppercase bg-[#9146FF] text-white px-1.5 py-0.5 font-mono rounded-md shadow">
                                VET
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <span className="text-xs font-bold text-slate-300 block truncate leading-tight">
                              {stream.displayName}
                            </span>
                            <span className="text-[8px] text-slate-500 block leading-none font-mono">
                              {isVeteran ? "Já abriu Fila" : "Offline"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRequestQueue(stream.login)}
                          disabled={requestedQueues.includes(stream.login)}
                          className={`w-full py-1.5 rounded-lg text-[9px] font-bold block transition-all cursor-pointer ${
                            requestedQueues.includes(stream.login)
                              ? "bg-emerald-950/20 text-[#10B981] border border-emerald-900/30"
                              : isVeteran
                                ? "bg-[#9146FF]/10 text-[#9146FF] hover:bg-[#9146FF]/25 border border-[#9146FF]/20"
                                : "bg-white/[0.02] hover:bg-slate-800 text-slate-400 group-hover:text-white border border-white/[0.05]"
                          }`}
                        >
                          {requestedQueues.includes(stream.login)
                            ? "Avisado! ✔"
                            : "Pedir Fila"}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* QUICK ACCESS FLOATING ACTION BUTTONS PANEL */}
      <div className="fixed bottom-4 right-4 z-40 lg:hidden flex gap-2">
        <button
          onClick={() => setIsJoinModalOpen(true)}
          className="w-12 h-12 bg-[#22222d] border border-slate-700/60 rounded-full flex items-center justify-center text-slate-200 shadow-xl"
          title="Entrar por Código"
        >
          <LogIn className="w-5 h-5 text-[#FF8C42]" />
        </button>
        <button
          onClick={() => setIsHostConfirmOpen(true)}
          className="w-12 h-12 bg-gradient-to-br from-[#9146FF] to-[#7c3aed] rounded-full flex items-center justify-center text-white shadow-xl"
          title="Iniciar meu Host"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* FOOTER METRIC BANNER */}
      <footer className="bg-[#0f0f13] border-t border-[#1b1b22] py-6 px-8 text-center text-xs text-slate-500 font-sans mt-auto leading-relaxed">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-medium">© 2026 Streamer Video Queue.</p>
          <p className="font-bold text-[#FF8C42]">
            Aviso: Sistema em Desenvolvimento
          </p>
          <div className="flex gap-4 text-[11px] font-bold">
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("openModal", { detail: "termos" }),
                )
              }
              className="text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              Termos de Uso
            </button>
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("openModal", { detail: "privacidade" }),
                )
              }
              className="text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              Política de Privacidade
            </button>
          </div>
        </div>
      </footer>

      {/* MODAL: JOIN ROOM VIA 4-LETTER CODE */}
      <AnimatePresence>
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Overlay background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsJoinModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Modal card content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-[#111116] border border-[#2d2d3a] p-6 rounded-2xl shadow-2xl text-left space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500 font-mono tracking-widest">
                  Acesso de Espectador
                </span>
                <button
                  onClick={() => setIsJoinModalOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer text-xs"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-black uppercase text-slate-100">
                  Conectar à Sala de Fila
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Digite o código de 4 letras compartilhado pelo streamer ou
                  moderadores do canal.
                </p>
              </div>

              <form onSubmit={handleManualCodeJoinSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={roomIdInput}
                    maxLength={4}
                    onChange={(e) =>
                      setRoomIdInput(e.target.value.toUpperCase())
                    }
                    placeholder="EX: ABCD"
                    className="w-full bg-[#171720] border border-[#3e3e50] focus:border-[#FF8C42] text-xl font-black font-mono tracking-widest text-[#FF8C42] rounded-xl py-3 text-center uppercase"
                  />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Calcelar
                  </button>
                  <button
                    type="submit"
                    disabled={roomIdInput.length < 4}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#FF8C42] to-[#FF6B35] disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-xs text-white font-extrabold uppercase tracking-wide rounded-lg transition-colors cursor-pointer"
                  >
                    Conectar Sala
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: HOST STREAMER SESSION CREATE CONFIRM */}
      <AnimatePresence>
        {isHostConfirmOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHostConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-[#111116] border border-[#2d2d3a] p-6 rounded-2xl shadow-2xl text-left space-y-4 font-sans"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500 font-mono tracking-widest">
                  Painel do Streamer
                </span>
                <button
                  onClick={() => setIsHostConfirmOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer text-xs"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-black uppercase text-slate-100">
                  Iniciar Sessão de Broadcaster
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Você será o proprietário exclusivo e host administrador desta
                  sala de fila de mídias.
                </p>
              </div>

              <div className="p-3 bg-[#171720]/80 border border-[#22222d] rounded-xl flex items-center gap-3">
                <Crown className="w-8 h-8 text-[#FF6B35] shrink-0" />
                <div className="text-left font-sans">
                  <span className="text-xs font-bold text-slate-300 block">
                    Identidade broadacster:
                  </span>
                  <span className="text-xs font-black block text-[#9146FF]">
                    @{twitchUsername.toLowerCase()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsHostConfirmOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCreate();
                    setIsHostConfirmOpen(false);
                  }}
                  disabled={submittingHost}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#9146FF] to-[#7c3aed] text-xs text-white font-extrabold uppercase rounded-lg cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-[#9146FF]/30"
                >
                  {submittingHost ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Crown className="w-4 h-4" /> Ativar Fila
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
