export interface InstagramPost {
  shortcode: string;
  originalLink: string;
  embedFixLink: string;
}

export interface XPost {
  statusPath: string;
  originalLink: string;
  embedFixLink: string;
}

export interface MediaItem {
  url: string;
  isVideo: boolean;
}

export interface XPostDetails {
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string | null;
  text: string;
  likeCount: number;
  repostCount: number;
  postedAt: Date;
  mediaItems: MediaItem[];
}

export interface EmbedPageMediaNode {
  is_video: boolean;
  display_url: string;
  video_url?: string;
  edge_sidecar_to_children?: { edges: Array<{ node: EmbedPageMediaNode }> };
}
