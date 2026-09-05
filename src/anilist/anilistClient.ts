import type { AniListActivityPage, AniListListActivity, AniListUserResponse } from "./types";

const ANILIST_API_URL = "https://graphql.anilist.co";
const MAX_RETRIES = 4;
const DEFAULT_BACKOFF_MS = 30_000;

const USER_QUERY = `
  query ($name: String) {
    User(name: $name) {
      id
      name
    }
  }
`;

const ACTIVITIES_QUERY = `
  query ($userId: Int, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      activities(userId: $userId, type: ANIME_LIST, sort: ID_DESC) {
        ... on ListActivity {
          id
          type
          status
          progress
          createdAt
          media {
            id
            siteUrl
            episodes
            title {
              userPreferred
              romaji
              english
            }
            coverImage {
              large
            }
          }
        }
      }
    }
  }
`;

class AniListApiError extends Error {}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let attempt = 0;

  while (true) {
    let response: Response;

    try {
      response = await fetch(ANILIST_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        throw new AniListApiError(`Network error contacting AniList: ${(err as Error).message}`);
      }
      attempt++;
      await sleep(DEFAULT_BACKOFF_MS * attempt);
      continue;
    }

    if (response.status === 429) {
      if (attempt >= MAX_RETRIES) {
        throw new AniListApiError("AniList rate limit exceeded and retries were exhausted.");
      }
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : DEFAULT_BACKOFF_MS;
      attempt++;
      await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : DEFAULT_BACKOFF_MS * attempt);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AniListApiError(`AniList API responded with ${response.status}: ${body}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new AniListApiError(`AniList API returned errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveUserId(username: string): Promise<number> {
  const data = await request<AniListUserResponse>(USER_QUERY, { name: username });
  if (!data.User) {
    throw new AniListApiError(`AniList user "${username}" was not found.`);
  }
  return data.User.id;
}

export async function fetchAnimeListActivities(
  userId: number,
  perPage = 25,
): Promise<AniListListActivity[]> {
  const data = await request<AniListActivityPage>(ACTIVITIES_QUERY, { userId, perPage });
  return data.Page.activities;
}
