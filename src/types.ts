export interface TwitchData {
  avatarUrl?: string;
  login?: string;
  displayName?: string;
  isSubscriber?: boolean;
  isModerator?: boolean;
  isVip?: boolean;
  isBroadcaster?: boolean;
  isFollower?: boolean;
  followedAt?: string; // ISO String of follow date
  color?: string;
  badges?: string[]; // e.g. ["broadcaster", "moderator", "vip", "subscriber"]
}

export interface User {
  id: string; // Socket ID
  userId: string; // Persistent Unique ID (Saved in client localStorage)
  name: string;
  isHost: boolean;
  ip?: string;
  isWhitelisted?: boolean;
  strikes?: number;
  isBanned?: boolean;
  banReason?: string;
  lastSubmitted?: number;
  submissionsTimeline?: number[];

  // Twitch Integrated Metadata
  twitchData?: TwitchData;

  // Advanced Streamer Management features
  reputation?: number;         // Automatically calculated 0-100 reputation
  restrictedUntil?: number;   // Video sending prohibition expiration timestamp
  timeoutUntil?: number;      // Total participation timeout expiration timestamp
  shadowBanned?: boolean;     // Stealth shadow ban status
  totalSubmitted?: number;    // All-time uploads count
  approvedCount?: number;     // All-time approved videos count
  rejectedCount?: number;     // All-time rejected videos count
  averageCooldown?: number;   // Average seconds between submissions
  firstAccess?: number;       // Date of first join
  lastAccess?: number;        // Date of last join
  adminNotes?: string[];      // Host-written internal warning/general notes
  lastPresenceAt?: number;    // UTC timestamp of last live chat typing or presence event
}

export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'playing' | 'watched' | 'ignored';

export interface Video {
  id: string;
  submitter: string;
  submitterId: string;      // Persistent userId of sender
  url: string;
  title: string;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'other';
  status: VideoStatus;
  timestamp: number;
  duration?: number; // duration in seconds
  aspectRatio?: '16:9' | '9:16' | 'auto';
  rejectionReason?: string; // Mod rejection reason
  moderatorName?: string;   // Submitter/Mod approved
}

export interface ModeratorSettings {
  isManualApprovalRequired: boolean;
  maxVideoDuration: number; // in seconds, 0 = unlimited
  blockLiveStreams: boolean;
  globalCooldownSeconds: number;
  userCooldownSeconds: number;
  maxSubmissionsPerHour: number;
  maxStrikesBeforeBan: number; // custom strike threshold
  domainWhitelist: string[];
  domainBlacklist: string[];
  domainMode: 'whitelist_only' | 'blacklist_only' | 'both';
  requireFollower?: boolean;
  requireSub?: boolean;
  minFollowMinutes?: number; // min follow duration required
}

export interface SecurityAuditLog {
  id: string;
  timestamp: number;
  type: 'spam' | 'malicious_url' | 'unicode_bypass' | 'duplicate' | 'rate_limit' | 'strike_ban' | 'admin_action' | 'abuse_attempt';
  message: string;
  username: string;
  ip?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface PersistentBanRecord {
  id: string;
  userId: string;
  username: string;
  ip: string;
  banType: 'global' | 'temporary' | 'permanent' | 'shadow' | 'restrict_upload';
  reason: string;
  moderator: string;
  createdAt: number;
  expiresAt?: number; // timestamp
  active: boolean;
  history: Array<{
    timestamp: number;
    action: 'ban' | 'unban' | 'edit';
    reason: string;
    moderator: string;
  }>;
}

export interface PersistentHistoryLog {
  id: string;
  videoId: string;
  url: string;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'other';
  title: string;
  submitterName: string;
  submitterId: string;
  status: VideoStatus;
  moderatorName?: string;
  rejectionReason?: string;
  timestamp: number;
  actionDetails?: string;
}

export interface SuspiciousActivityAlert {
  id: string;
  timestamp: number;
  userId: string;
  username: string;
  ip: string;
  type: 'action_spam' | 'rule_bypass' | 'repetitive_reject' | 'session_abuse' | 'invalid_submission';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SessionState {
  id: string;
  hostId: string;
  users: User[];
  queue: Video[];
  currentVideoId: string | null;
  history: Video[];
  isPlaying: boolean;
  currentTime: number;
  settings: ModeratorSettings;
  blacklistIPs: string[];
  blacklistUsernames: string[];
  auditLogs: SecurityAuditLog[];

  // Streamer administration modules (broadcasting directly to active hosts)
  allBans?: PersistentBanRecord[];
  allHistoryLogs?: PersistentHistoryLog[];
  suspiciousAlerts?: SuspiciousActivityAlert[];
  allUserProfiles?: any[];
}


