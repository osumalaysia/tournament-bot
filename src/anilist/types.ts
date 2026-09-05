export interface AniListMediaTitle {
  userPreferred: string | null;
  romaji: string | null;
  english: string | null;
}

export interface AniListMedia {
  id: number;
  siteUrl: string;
  episodes: number | null;
  title: AniListMediaTitle;
  coverImage: {
    large: string | null;
  };
}

export interface AniListListActivity {
  id: number;
  type: "ANIME_LIST" | string;
  status: string;
  progress: string | null;
  createdAt: number;
  media: AniListMedia | null;
}

export interface AniListActivityPage {
  Page: {
    pageInfo: {
      hasNextPage: boolean;
    };
    activities: AniListListActivity[];
  };
}

export interface AniListUserResponse {
  User: {
    id: number;
    name: string;
  };
}
