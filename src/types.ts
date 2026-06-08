export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'playing' | 'watched' | 'ignored';

export interface Video {
  id: string;
  submitterId: string;    // Persistent UUID of sender (viewer)
  url: string;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'other';
  status: VideoStatus;
  timestamp: number;
}



