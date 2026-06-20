import { useMemo } from "react";
import { SessionState, User } from "../types";
import { 
  Trophy, Award, RefreshCw, Sparkles, Zap, ChevronUp, Check, Play, Heart, Star, Flame, Loader2, ArrowUpRight
} from "lucide-react";
import { clsx } from "clsx";

interface ViewerRankingProps {
  session: SessionState;
  onSelectUser?: (user: User) => void;
}

export default function ViewerRanking({ session, onSelectUser }: ViewerRankingProps) {
  const users = session.users || [];

  // Filter and sort users by karma score
  const sortedRanking = useMemo(() => {
    return [...users]
      .filter((u) => !u.isHost) // Exclude host
      .sort((a, b) => {
        const scoreA = a.karmaDetails?.karma_score ?? a.reputation ?? 0;
        const scoreB = b.karmaDetails?.karma_score ?? b.reputation ?? 0;
        return scoreB - scoreA;
      });
  }, [users]);

  // Top 3 Podium Viewers
  const topThree = useMemo(() => {
    return sortedRanking.slice(0, 3);
  }, [sortedRanking]);

  // Viewers in positions 4-10
  const topTenAndRest = useMemo(() => {
    return sortedRanking.slice(3);
  }, [sortedRanking]);

  // Level info helper based on karma score
  const getKarmaLevelDetails = (score: number) => {
    if (score >= 1000) {
      return {
        level: "Lenda Analógica",
        badge: "👑 PLATINUM S-CLASS",
        desc: "Curadoria histórica reconhecida mundialmente.",
        color: "text-amber-400 border-amber-500/40 bg-amber-500/5",
        textGlow: "shadow-[0_0_15px_rgba(245,158,11,0.25)]",
        borderNeon: "border-amber-500",
        progressMax: 1500,
        nextLevel: "Eternidade",
      };
    }
    if (score >= 500) {
      return {
        level: "Arquivista Sênior",
        badge: "📼 VHS SUPER GOLD",
        desc: "Fiel zelador das fitas magnéticas mais raras.",
        color: "text-purple-400 border-purple-500/40 bg-purple-500/5",
        textGlow: "shadow-[0_0_15px_rgba(168,85,247,0.25)]",
        borderNeon: "border-purple-500",
        progressMax: 1000,
        nextLevel: "Lenda Analógica",
      };
    }
    if (score >= 200) {
      return {
        level: "Curador de Fitas",
        badge: "🎚️ HI-FI SOUNDMASTER",
        desc: "Mestre da equalização e curador de bom gosto.",
        color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/5",
        textGlow: "shadow-[0_0_15px_rgba(6,182,212,0.25)]",
        borderNeon: "border-cyan-500",
        progressMax: 500,
        nextLevel: "Arquivista Sênior",
      };
    }
    if (score >= 50) {
      return {
        level: "Colecionador Ativo",
        badge: "📻 RADIO ACTIVE",
        desc: "Provedor constante de relíquias e reações.",
        color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
        textGlow: "shadow-[0_0_15px_rgba(16,185,129,0.25)]",
        borderNeon: "border-emerald-500",
        progressMax: 200,
        nextLevel: "Curador de Fitas",
      };
    }
    return {
      level: "Fita Virgem",
      badge: "📼 AMATEUR RETRO",
      desc: "Primeira fita adicionada na biblioteca da live.",
      color: "text-zinc-400 border-zinc-700 bg-zinc-800/10",
      textGlow: "shadow-none",
      borderNeon: "border-zinc-800",
      progressMax: 50,
      nextLevel: "Colecionador Ativo",
    };
  };

  const renderPodiumAvatar = (user: User, rank: number) => {
    const avatarUrl = user.twitchData?.avatarUrl;
    const name = user.name || "?";
    const initials = name.trim().substring(0, 2).toUpperCase();
    const color = user.twitchData?.color || "#505050";

    const podiumBorderColor = 
      rank === 1 ? "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : 
      rank === 2 ? "border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.2)]" : 
      "border-amber-700 shadow-[0_0_15px_rgba(180,83,9,0.2)]";

    return (
      <div className="relative flex justify-center mb-2">
        <div className={clsx("w-20 h-20 rounded-sm border-2 p-1 bg-[#121212]", podiumBorderColor)}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-sm"
            />
          ) : (
            <div
              className="w-full h-full rounded-sm flex items-center justify-center font-black text-lg text-white"
              style={{ backgroundColor: color }}
            >
              {initials}
            </div>
          )}
        </div>
        
        {/* Ring Badge */}
        <div className={clsx(
          "absolute -bottom-2 px-3 py-0.5 rounded-full text-[9px] font-mono font-black border uppercase tracking-wider shadow-md",
          rank === 1 ? "bg-amber-400 border-amber-300 text-black" :
          rank === 2 ? "bg-slate-300 border-slate-200 text-black" :
          "bg-amber-800 border-amber-700 text-white"
        )}>
          {rank === 1 ? "🥇 TOP 1" : rank === 2 ? "🥈 TOP 2" : "🥉 TOP 3"}
        </div>
      </div>
    );
  };

  // Coletivos stats calculating
  const totalKarmaColetivo = useMemo(() => {
    return users.reduce((acc, current) => {
      const score = current.karmaDetails?.karma_score ?? current.reputation ?? 0;
      return acc + (score > 0 ? score : 0);
    }, 0);
  }, [users]);

  // Current collective goals progress
  const collectiveGoal = 3500;
  const collectivePercent = Math.min(100, Math.round((totalKarmaColetivo / collectiveGoal) * 100));

  return (
    <div className="w-full h-full flex flex-col bg-transparent text-zinc-400 animate-in fade-in" id="viewer_ranking_view">
      
      {/* Header */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-6 p-6 border-b border-zinc-800 bg-black/80" style={{ height: '80px' }}>
        <h1 className="text-2xl font-black text-white uppercase tracking-widest font-mono">
          RANKING
        </h1>
      </div>

      {/* 2. Bento Grid structured Layout */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-16">
        
        {/* Podium for top 3: High priority cards */}
        {topThree.length === 0 ? (
          <div className="p-10 border border-dashed border-zinc-800 rounded text-center bg-zinc-950/20 max-w-xl mx-auto">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin mx-auto mb-3" />
            <span className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Aguardando cálculo de karma no banco de dados local...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            
            {/* Podium Rank 2 */}
            {topThree[1] && (
              <div 
                onClick={() => onSelectUser && onSelectUser(topThree[1])}
                className="group relative bg-[#0C0C0D] border border-slate-400/20 hover:border-slate-300/60 p-5 rounded-sm transition-all duration-300 cursor-pointer shadow-lg flex flex-col justify-between overflow-hidden text-center h-[340px]"
              >
                {/* Decorative border bar */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-300" />
                
                <div className="absolute top-3 right-3 text-[10px] font-mono text-zinc-650 uppercase font-black tracking-widest pl-1 border-l-2 border-slate-400/40">
                  HQ-60
                </div>

                <div className="mt-4">
                  {renderPodiumAvatar(topThree[1], 2)}
                  <h3 className="text-base font-black tracking-tight text-white mt-4 truncate" style={{ color: topThree[1].twitchData?.color }}>
                    @{topThree[1].name}
                  </h3>
                  <p className="text-[9px] font-mono text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                    {getKarmaLevelDetails(topThree[1].karmaDetails?.karma_score ?? topThree[1].reputation ?? 0).level}
                  </p>
                </div>

                <div className="bg-zinc-950/80 p-3 border border-zinc-900 rounded-sm flex items-center justify-between font-mono mt-4">
                  <div className="text-left">
                    <span className="text-[7.5px] text-zinc-600 block font-bold uppercase">Reputation Score</span>
                    <span className="text-base font-black text-slate-300 tracking-tighter">
                      {topThree[1].karmaDetails?.karma_score ?? topThree[1].reputation ?? 0}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[7.5px] text-zinc-605 block font-bold uppercase">Positive Ratio</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {topThree[1].karmaDetails?.positive_ratings ?? 0} UP
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Podium Rank 1: King of Retro */}
            {topThree[0] && (
              <div 
                onClick={() => onSelectUser && onSelectUser(topThree[0])}
                className="group relative bg-[#0D0B09] border border-amber-500/40 hover:border-amber-400 p-5 rounded-sm transition-all duration-300 cursor-pointer shadow-2xl flex flex-col justify-between overflow-hidden text-center h-[380px] -translate-y-2 md:z-10"
              >
                {/* Polaroid/VHS colors bar on top */}
                <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300" />
                
                {/* Crown glow indicator */}
                <span className="absolute top-4 right-4 text-[9px] font-mono text-amber-500 font-black tracking-widest bg-amber-500/10 px-2 py-0.5 border border-amber-500/30 rounded">
                  👑 S-CLASS
                </span>

                <div className="mt-4">
                  {renderPodiumAvatar(topThree[0], 1)}
                  <h2 className="text-lg font-black tracking-tight text-white mt-4 truncate" style={{ color: topThree[0].twitchData?.color }}>
                    @{topThree[0].name}
                  </h2>
                  <p className="text-[9px] font-mono text-amber-400 font-bold uppercase tracking-widest mt-1">
                    {getKarmaLevelDetails(topThree[0].karmaDetails?.karma_score ?? topThree[0].reputation ?? 0).level}
                  </p>
                </div>

                <div className="space-y-3 mt-4">
                  {/* Performance slider bar */}
                  <div className="space-y-1 text-left font-mono">
                    <div className="flex justify-between text-[8px] uppercase font-semibold text-zinc-550">
                      <span>Accel Level S</span>
                      <span>Next: {getKarmaLevelDetails(topThree[0].karmaDetails?.karma_score ?? topThree[0].reputation ?? 0).nextLevel}</span>
                    </div>
                    <div className="w-full h-1 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: "85%" }} />
                    </div>
                  </div>

                  <div className="bg-zinc-950 p-3.5 border border-zinc-900 rounded-sm flex items-center justify-between font-mono">
                    <div className="text-left">
                      <span className="text-[7.5px] text-zinc-650 block font-bold uppercase">Supreme Score</span>
                      <span className="text-lg font-black text-amber-400 tracking-tighter">
                        {topThree[0].karmaDetails?.karma_score ?? topThree[0].reputation ?? 0}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[7.5px] text-zinc-650 block font-bold uppercase font-sans">Reviews Ratio</span>
                      <span className="text-xs font-black text-emerald-400 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-orange-500 animate-pulse" />
                        {topThree[0].karmaDetails?.positive_ratings ?? 0} UP
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Podium Rank 3 */}
            {topThree[2] && (
              <div 
                onClick={() => onSelectUser && onSelectUser(topThree[2])}
                className="group relative bg-[#0C0C0D] border border-amber-900/30 hover:border-amber-700/60 p-5 rounded-sm transition-all duration-300 cursor-pointer shadow-lg flex flex-col justify-between overflow-hidden text-center h-[340px]"
              >
                {/* Decorative border bar */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-800" />

                <div className="absolute top-3 right-3 text-[10px] font-mono text-zinc-650 uppercase font-black tracking-widest pl-1 border-l-2 border-amber-900/40">
                  HQ-120
                </div>

                <div className="mt-4">
                  {renderPodiumAvatar(topThree[2], 3)}
                  <h3 className="text-base font-black tracking-tight text-white mt-4 truncate" style={{ color: topThree[2].twitchData?.color }}>
                    @{topThree[2].name}
                  </h3>
                  <p className="text-[9px] font-mono text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                    {getKarmaLevelDetails(topThree[2].karmaDetails?.karma_score ?? topThree[2].reputation ?? 0).level}
                  </p>
                </div>

                <div className="bg-zinc-950/80 p-3 border border-zinc-900 rounded-sm flex items-center justify-between font-mono mt-4">
                  <div className="text-left">
                    <span className="text-[7.5px] text-zinc-650 block font-bold uppercase">Reputation Score</span>
                    <span className="text-base font-black text-amber-705 tracking-tighter">
                      {topThree[2].karmaDetails?.karma_score ?? topThree[2].reputation ?? 0}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[7.5px] text-zinc-655 block font-bold uppercase">Positive Ratio</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {topThree[2].karmaDetails?.positive_ratings ?? 0} UP
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Major Columns Layout: Leading Board & Status Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start">
          
          {/* COLUMN 1-2: Leaderboard Top 10 List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between bg-zinc-950/80 px-4 py-3 border-l-2 border-[#9146FF] rounded border border-zinc-900 text-left font-mono">
              <span className="text-xs font-bold uppercase text-zinc-200 flex items-center gap-2">
                <Award className="w-3.5 h-3.5 text-purple-400" />
                Leaderboard Retropontos (Top 10 & Rest)
              </span>
              <span className="text-[9px] bg-purple-500/10 text-purple-400 font-mono px-2 py-0.5 rounded border border-purple-500/20 font-black">
                STABLE SYNC
              </span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {topTenAndRest.length === 0 ? (
                <div className="text-center p-10 border border-dashed border-zinc-900 bg-zinc-950/5 rounded">
                  <p className="text-xs text-zinc-600 font-mono italic">
                    Não existem outros espectadores listados além do Top 3.
                  </p>
                </div>
              ) : (
                topTenAndRest.map((user, idx) => {
                  const valIndex = idx + 4; // Podium is 3
                  const score = user.karmaDetails?.karma_score ?? user.reputation ?? 0;
                  const levelDetails = getKarmaLevelDetails(score);

                  // Next level percentage progress
                  const currentMax = levelDetails.progressMax;
                  const pct = Math.min(100, Math.round((score / currentMax) * 100));

                  return (
                    <div
                      key={`list-rank-${user.id}`}
                      onClick={() => onSelectUser && onSelectUser(user)}
                      className="relative p-3 pl-5 bg-[#0C0C0E] border border-zinc-800/60 hover:bg-[#121215] hover:border-zinc-700/80 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-150 cursor-pointer text-left group overflow-hidden"
                    >
                      {/* Left side VHS spine accent color */}
                      <div className={clsx(
                        "absolute top-0 bottom-0 left-0 w-1.5 opacity-90",
                        valIndex === 4 ? "bg-gradient-to-b from-cyan-400 to-blue-600" :
                        valIndex === 5 ? "bg-gradient-to-b from-emerald-400 to-teal-600" :
                        valIndex === 6 ? "bg-gradient-to-b from-amber-400 to-orange-500" :
                        valIndex === 7 ? "bg-gradient-to-b from-purple-400 to-indigo-600" :
                        valIndex === 8 ? "bg-gradient-to-b from-fuchsia-400 to-pink-600" :
                        valIndex === 9 ? "bg-gradient-to-b from-rose-400 to-red-600" :
                        "bg-zinc-700"
                      )} />

                      <div className="flex items-center gap-4 min-w-0 flex-1 relative z-10">
                        {/* Position designator */}
                        <div className="w-8 h-8 rounded-sm flex items-center justify-center font-black text-xs shrink-0 font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-zinc-200 transition-colors shadow-inner">
                          {String(valIndex).padStart(2, '0')}
                        </div>

                        {/* Avatar */}
                        <div className="relative">
                          {user.twitchData?.avatarUrl ? (
                            <img
                              src={user.twitchData?.avatarUrl}
                              alt=""
                              className="w-10 h-10 rounded-sm border-2 border-zinc-800 shrink-0 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div 
                              className="w-10 h-10 rounded-sm border-2 border-zinc-800 font-black text-center text-xs flex items-center justify-center shrink-0"
                              style={{ backgroundColor: user.twitchData?.color || "#444" }}
                            >
                              {user.name.trim().substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-zinc-900 border border-zinc-700 rounded-sm flex items-center justify-center">
                            <span className={clsx("w-1.5 h-1.5 rounded-full", levelDetails.borderNeon?.replace('border-', 'bg-') || 'bg-zinc-500')} />
                          </div>
                        </div>

                        {/* User Metadata info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="text-sm font-black tracking-tight text-white truncate md:max-w-[140px]" style={{ color: user.twitchData?.color || '#fff' }}>
                              {user.name.toUpperCase()}
                            </span>
                            {user.twitchData?.isSubscriber && (
                              <span className="text-[7px] font-black uppercase text-amber-950 bg-amber-500 px-1 py-0.5 rounded-sm font-mono tracking-widest">
                                SUB
                              </span>
                            )}
                            {user.twitchData?.isModerator && (
                              <span className="text-[7px] font-black uppercase text-green-950 bg-green-500 px-1 py-0.5 rounded-sm font-mono tracking-widest">
                                MOD
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[8px] font-mono text-zinc-500 uppercase font-bold tracking-widest">
                              {levelDetails.badge}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Progress bar slider */}
                      <div className="hidden md:flex flex-col w-32 gap-1.5 shrink-0 text-left font-mono">
                        <div className="flex justify-between text-[7px] text-zinc-500 font-bold uppercase tracking-widest">
                          <span>Progress</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-1 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      {/* Right: Scores */}
                      <div className="flex items-center gap-4 shrink-0 px-4 border-t md:border-t-0 md:border-l border-zinc-800/60 pt-3 md:pt-0 font-mono bg-[#0C0C0E] py-1">
                        <div className="text-right">
                          <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mb-0.5">Karma</div>
                          <div className="text-xs font-black text-zinc-100">{score}</div>
                        </div>
                        <div className="h-6 w-px bg-zinc-800/60 mx-1 hidden md:block"></div>
                        <div className="text-right">
                          <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mb-0.5">Ups</div>
                          <div className="text-xs font-black text-emerald-400">{user.karmaDetails?.positive_ratings || 0}</div>
                        </div>
                        <div className="h-6 w-px bg-zinc-800/60 mx-1 hidden md:block"></div>
                        <div className="text-right">
                          <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mb-0.5">Apprv</div>
                          <div className="text-xs font-black text-zinc-400">{user.approvedCount || user.totalSubmitted || 0}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 3: Achievements & Karma directory rules */}
          <div className="space-y-4">
            {/* Dynamic global metrics card (Moved here) */}
            <div className="flex items-center justify-between gap-5 p-3.5 bg-zinc-950/84 border border-zinc-900 rounded-sm w-full relative">
              <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-emerald-500" />
              <div className="text-left font-mono flex-1">
                <div className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest">Score Coletivo Chat</div>
                <div className="text-xl font-black text-emerald-400 flex items-baseline gap-1.5 mt-0.5">
                  <span>{totalKarmaColetivo} pts</span>
                  <span className="text-[10px] text-zinc-650 font-normal">/ {collectiveGoal} para Fita</span>
                </div>
                
                {/* Small Goal Progress Bar */}
                <div className="w-full h-1.5 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full bg-emerald-400 transition-all duration-1000 ease-out" style={{ width: `${collectivePercent}%` }} />
                </div>
              </div>
              <div className="flex flex-col items-end text-right font-mono ml-3 shrink-0">
                <div className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-500/25">
                  {collectivePercent}%
                </div>
                <span className="text-[8px] text-zinc-600 uppercase tracking-tighter mt-1 font-bold">Progress</span>
              </div>
            </div>

            <div className="flex items-center justify-between bg-zinc-950/80 px-4 py-3 border-l-2 border-emerald-500 rounded border border-zinc-900 text-left font-mono">
              <span className="text-xs font-bold uppercase text-zinc-200 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Tiers de Conquistas & Karma
              </span>
            </div>

            <div className="space-y-4">
              {[
                { title: "Lenda Analógica", req: "1000+", desc: "Status divino de curadoria. Suas mídias se sobressaem acima de todas.", color: "border-amber-500/20 bg-[#121214] shadow-[0_0_15px_rgba(245,158,11,0.05)]", active: users.filter(u => (u.karmaDetails?.karma_score ?? u.reputation ?? 0) >= 1000).length, label: "👑 S-CLASS", gradient: "from-amber-400 via-orange-500 to-red-600", accent: "text-amber-500", hqLabel: "MASTER RATED" },
                { title: "Arquivista Sênior", req: "500-999", desc: "Aprovador experiente de vídeos finos. Status especial de auto-retorno.", color: "border-purple-500/20 bg-[#121214] shadow-[0_0_15px_rgba(168,85,247,0.05)]", active: users.filter(u => { const s = u.karmaDetails?.karma_score ?? u.reputation ?? 0; return s >= 500 && s < 1000; }).length, label: "📼 SUPER GOLD", gradient: "from-fuchsia-400 via-purple-500 to-violet-700", accent: "text-purple-500", hqLabel: "GOLD RATED" },
                { title: "Curador de Fitas", req: "200-499", desc: "Zelador sênior da biblioteca. Cool-downs atenuados para novos envios.", color: "border-cyan-500/20 bg-[#121214] shadow-[0_0_15px_rgba(6,182,212,0.05)]", active: users.filter(u => { const s = u.karmaDetails?.karma_score ?? u.reputation ?? 0; return s >= 200 && s < 500; }).length, label: "🎚️ HI-FI MIXED", gradient: "from-cyan-400 via-teal-500 to-blue-600", accent: "text-cyan-500", hqLabel: "HI-FI RATED" },
                { title: "Colecionador", req: "50-199", desc: "Participante regular. Liberação de reações exclusivas e interações.", color: "border-emerald-500/20 bg-[#121214] shadow-[0_0_15px_rgba(16,185,129,0.05)]", active: users.filter(u => { const s = u.karmaDetails?.karma_score ?? u.reputation ?? 0; return s >= 50 && s < 200; }).length, label: "📻 RADIO ACTIVE", gradient: "from-emerald-400 via-green-500 to-lime-600", accent: "text-emerald-500", hqLabel: "SP RATED" }
              ].map((ach, idx) => (
                <div key={idx} className={clsx("relative flex flex-col justify-between border rounded-sm text-left overflow-hidden min-h-[145px] transition-all duration-300 hover:border-zinc-500/50 hover:-translate-y-0.5", ach.color)}>
                  <div className="p-4 z-10 pb-10">
                    <div className="flex justify-between items-start mb-3">
                      <span className={clsx("text-[8.5px] font-black uppercase tracking-widest font-mono", ach.accent)}>{ach.hqLabel}</span>
                      <div className="text-[7px] font-mono text-zinc-300 bg-zinc-950/80 px-1.5 py-0.5 rounded border border-zinc-800 uppercase tracking-widest flex items-center gap-1 shadow-sm font-extrabold">
                        {ach.label}
                      </div>
                    </div>
                    <h4 className="text-sm font-black text-white font-sans uppercase tracking-tight leading-none mb-2">{ach.title}</h4>
                    <p className="text-[9.5px] text-zinc-500 leading-snug font-mono uppercase tracking-tight max-w-[95%]">{ach.desc}</p>
                    
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[8px] font-black font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded-sm uppercase flex items-center gap-1">
                         <Zap className="w-2.5 h-2.5 text-zinc-500" />
                         Min: {ach.req}
                      </span>
                      <span className="text-[8px] font-black font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-1 rounded-sm uppercase text-right">
                         Viewers: {ach.active}
                      </span>
                    </div>
                  </div>
                  
                  {/* Decorative VHS Stripes at the bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-4 flex overflow-hidden opacity-90 border-t border-zinc-900/50">
                    <div className={clsx("h-full w-full bg-gradient-to-r", ach.gradient)}>
                       <div className="w-full h-full opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
