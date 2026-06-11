import * as fs from 'fs';
import * as path from 'path';

// TYPES SCHEMA FOR PERSISTENCE

export interface UserLifetimeProfile {
  userId: string;
  username: string;
  firstAccess: number;
  lastAccess: number;
  totalSubmitted: number;
  approvedCount: number;
  rejectedCount: number;
  playedCount: number;
  ignoredCount: number;
  strikes: number;       // active strikes (clears when timeout expires or manually)
  allTimeStrikes: number;
  allTimeBans: number;
  reputation: number;     // reputation score 0-100 (starts at 50)
  lastSubmittedAt?: number;
  submitSecondsDiffs: number[]; // stored to calculate median/average submission cooldowns
  adminNotes: string[];
  restrictedUntil?: number; // timestamp until when they are prohibited from sending videos
  timeoutUntil?: number;    // timestamp until when they are blocked from the room entirety
  shadowBanned?: boolean;   // if they are shadow banned
  lastKnownIp: string;
  lastReputationUpdate?: number;
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
    action: 'ban' | 'forgive' | 'edit';
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
  status: 'pending' | 'approved' | 'rejected' | 'playing' | 'watched' | 'ignored';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BANS_FILE = path.join(DATA_DIR, 'bans.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Initialize Storage Directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class PersistentDataStore {
  private users: Map<string, UserLifetimeProfile> = new Map();
  private bans: PersistentBanRecord[] = [];
  private historyLogs: PersistentHistoryLog[] = [];
  private liveAlerts: SuspiciousActivityAlert[] = [];

  constructor() {
    this.loadAll();
  }

  // Load from Disk helper
  private loadAll() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const uData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        Object.keys(uData).forEach(id => {
          this.users.set(id, uData[id]);
        });
        console.log(`[Database] Loaded ${this.users.size} user profiles.`);
      }
    } catch (e: any) {
      console.error('[Database] Failed to load users file:', e.message);
    }

    try {
      if (fs.existsSync(BANS_FILE)) {
        this.bans = JSON.parse(fs.readFileSync(BANS_FILE, 'utf-8'));
        console.log(`[Database] Loaded ${this.bans.length} ban records.`);
      }
    } catch (e: any) {
      console.error('[Database] Failed to load bans file:', e.message);
    }

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        this.historyLogs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        console.log(`[Database] Loaded ${this.historyLogs.length} history logs.`);
      }
    } catch (e: any) {
      console.error('[Database] Failed to load history file:', e.message);
    }
  }

  // Save to Disk safely
  private saveUsers() {
    try {
      const obj: Record<string, UserLifetimeProfile> = {};
      this.users.forEach((profile, id) => {
        obj[id] = profile;
      });
      fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[Database] Failed to write users file:', e.message);
    }
  }

  private saveBans() {
    try {
      fs.writeFileSync(BANS_FILE, JSON.stringify(this.bans, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[Database] Failed to write bans file:', e.message);
    }
  }

  private saveHistory() {
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.historyLogs, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[Database] Failed to write history file:', e.message);
    }
  }

  // USER PROFILES METHODS

  public getOrCreateUserProfile(userId: string, username: string, ip: string): UserLifetimeProfile {
    let profile = this.users.get(userId);
    const now = Date.now();

    if (!profile) {
      profile = {
        userId,
        username,
        firstAccess: now,
        lastAccess: now,
        totalSubmitted: 0,
        approvedCount: 0,
        rejectedCount: 0,
        playedCount: 0,
        ignoredCount: 0,
        strikes: 0,
        allTimeStrikes: 0,
        allTimeBans: 0,
        reputation: 50, // default neutral score
        submitSecondsDiffs: [],
        adminNotes: [],
        lastKnownIp: ip,
        lastReputationUpdate: now
      };
      this.users.set(userId, profile);
      this.saveUsers();
    } else {
      // update info
      profile.username = username;
      profile.lastAccess = now;
      profile.lastKnownIp = ip;
      this.saveUsers();
    }

    return profile;
  }

  public getProfile(userId: string): UserLifetimeProfile | undefined {
    return this.users.get(userId);
  }

  public getAllProfiles(): UserLifetimeProfile[] {
    return Array.from(this.users.values());
  }

  public updateProfile(userId: string, updater: (p: UserLifetimeProfile) => void): UserLifetimeProfile | undefined {
    const profile = this.users.get(userId);
    if (profile) {
      updater(profile);
      // Bound reputation in [0, 100]
      profile.reputation = Math.max(0, Math.min(100, profile.reputation));
      this.saveUsers();
      return profile;
    }
    return undefined;
  }

  // AUTOMATIC REPUTATION ADAPTER
  public adjustReputation(userId: string, delta: number, actionName: string) {
    this.updateProfile(userId, (profile) => {
      const oldRep = profile.reputation;
      profile.reputation += delta;
      profile.lastReputationUpdate = Date.now();
      console.log(`[Reputation] User @${profile.username} adjusted by ${delta > 0 ? '+' : ''}${delta} (${oldRep} -> ${profile.reputation}). Reason: ${actionName}`);
    });
  }

  // RECORD MOUNTING STATISTIC COOLDOWN
  public trackSubmissionTime(userId: string) {
    const now = Date.now();
    this.updateProfile(userId, (profile) => {
      if (profile.lastSubmittedAt) {
        const diffSeconds = Math.floor((now - profile.lastSubmittedAt) / 1000);
        if (diffSeconds > 0 && diffSeconds < 86400) { // filter outliers > 1 day
          profile.submitSecondsDiffs.push(diffSeconds);
          // keep last 20 samples to maintain responsive statistics
          if (profile.submitSecondsDiffs.length > 20) {
            profile.submitSecondsDiffs.shift();
          }
        }
      }
      profile.lastSubmittedAt = now;
      profile.totalSubmitted += 1;
    });
  }

  // Get average submissions frequency in seconds
  public getAverageCooldown(profile: UserLifetimeProfile): number {
    if (!profile.submitSecondsDiffs || profile.submitSecondsDiffs.length === 0) return 0;
    const sum = profile.submitSecondsDiffs.reduce((a, b) => a + b, 0);
    return Math.round(sum / profile.submitSecondsDiffs.length);
  }

  // BAN RECORDS DATABASE

  public addBanRecord(record: Omit<PersistentBanRecord, 'active' | 'history'>): PersistentBanRecord {
    const newRecord: PersistentBanRecord = {
      ...record,
      active: true,
      history: [{
        timestamp: Date.now(),
        action: 'ban',
        reason: record.reason,
        moderator: record.moderator
      }]
    };
    this.bans.push(newRecord);
    this.saveBans();
    return newRecord;
  }

  public getBansOfUserAndIp(userId: string, ip: string): PersistentBanRecord[] {
    const now = Date.now();
    return this.bans.filter(ban => {
      if (!ban.active) return false;
      
      // Check expiration for temporary bans
      if (ban.expiresAt && now > ban.expiresAt) {
        ban.active = false;
        ban.history.push({
          timestamp: now,
          action: 'forgive',
          reason: 'Expiração automática de tempo de timeout',
          moderator: 'SISTEMA'
        });
        this.saveBans();
        return false;
      }

      const isUserIdMatch = ban.userId === userId;
      const isIpMatch = ip && (ban.ip === ip || ip.includes(ban.ip) || ban.ip.includes(ip));
      return isUserIdMatch || isIpMatch;
    });
  }

  public getBanRecords(): PersistentBanRecord[] {
    // Check timeout expirations on query
    const now = Date.now();
    let modified = false;
    this.bans.forEach(ban => {
      if (ban.active && ban.expiresAt && now > ban.expiresAt) {
        ban.active = false;
        ban.history.push({
          timestamp: now,
          action: 'forgive',
          reason: 'Expiração automática de duração',
          moderator: 'SISTEMA'
        });
        modified = true;
      }
    });
    if (modified) this.saveBans();
    return this.bans;
  }

  public removeBanRecord(userId: string, moderator: string, reason: string): boolean {
    let forgiven = false;
    const now = Date.now();
    this.bans.forEach(ban => {
      if (ban.userId === userId && ban.active) {
        ban.active = false;
        ban.history.push({
          timestamp: now,
          action: 'forgive',
          reason,
          moderator
        });
        forgiven = true;
      }
    });

    if (forgiven) {
      this.saveBans();
    }
    return forgiven;
  }

  // DETAILED HISTORY LOGS

  public logEvent(logEntry: Omit<PersistentHistoryLog, 'id' | 'timestamp'>): PersistentHistoryLog {
    const newLog: PersistentHistoryLog = {
      ...logEntry,
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      timestamp: Date.now()
    };
    this.historyLogs.unshift(newLog);
    // keep history clean to avoid bloating (max 3000 results kept)
    if (this.historyLogs.length > 3000) {
      this.historyLogs.pop();
    }
    this.saveHistory();
    return newLog;
  }

  public getHistoryLogs(filters?: {
    userId?: string;
    status?: string;
    platform?: string;
    searchKeyword?: string;
  }): PersistentHistoryLog[] {
    return this.historyLogs.filter(log => {
      if (filters?.userId && log.submitterId !== filters.userId) return false;
      if (filters?.status && log.status !== filters.status) return false;
      if (filters?.platform && log.platform !== filters.platform) return false;
      if (filters?.searchKeyword) {
        const kw = filters.searchKeyword.toLowerCase();
        const matchTitle = log.title?.toLowerCase().includes(kw);
        const matchUrl = log.url?.toLowerCase().includes(kw);
        const matchUser = log.submitterName?.toLowerCase().includes(kw);
        const matchReason = log.rejectionReason?.toLowerCase().includes(kw);
        if (!matchTitle && !matchUrl && !matchUser && !matchReason) return false;
      }
      return true;
    });
  }

  // SUSPICIOUS ACTIVITIES ALERTS SYSTEM (Real-time in-memory caching)

  public triggerAlert(alert: Omit<SuspiciousActivityAlert, 'id' | 'timestamp'>): SuspiciousActivityAlert {
    const newAlert: SuspiciousActivityAlert = {
      ...alert,
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      timestamp: Date.now()
    };
    this.liveAlerts.unshift(newAlert);
    if (this.liveAlerts.length > 100) {
      this.liveAlerts.pop();
    }
    return newAlert;
  }

  public getLiveAlerts(): SuspiciousActivityAlert[] {
    return this.liveAlerts;
  }

  public clearLiveAlerts() {
    this.liveAlerts = [];
  }
}

export const dbStore = new PersistentDataStore();
