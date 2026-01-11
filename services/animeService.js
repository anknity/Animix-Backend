import axios from 'axios';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const ANILIST_BASE = 'https://graphql.anilist.co';

// Helper to add delay between requests to respect rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map Jikan anime data to our format
const mapAnime = (anime) => {
  return {
    id: anime.mal_id?.toString() || anime.id?.toString(),
    title: anime.title || anime.title_english || 'Unknown',
    titleEnglish: anime.title_english || anime.title,
    titleJapanese: anime.title_japanese,
    synopsis: anime.synopsis || 'No description available.',
    coverImage: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
    bannerImage: anime.trailer?.images?.maximum_image_url || anime.images?.jpg?.large_image_url,
    episodes: anime.episodes,
    status: anime.status,
    score: anime.score,
    rating: anime.rating,
    year: anime.year || anime.aired?.prop?.from?.year,
    season: anime.season,
    studios: anime.studios?.map(s => s.name) || [],
    genres: anime.genres?.map(g => g.name) || [],
    themes: anime.themes?.map(t => t.name) || [],
    type: anime.type,
    source: anime.source,
    duration: anime.duration,
    aired: {
      from: anime.aired?.from,
      to: anime.aired?.to,
      string: anime.aired?.string
    }
  };
};

const stripHtml = (value = '') => value ? value.replace(/<[^>]+>/g, '').trim() : '';

// Map AniList data to our format
const mapAniListAnime = (anime) => {
  const descriptionHtml = anime.description || '';

  return {
    id: anime.id?.toString(),
    malId: anime.idMal || null,
    title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
    titleEnglish: anime.title?.english,
    titleJapanese: anime.title?.native,
    synopsis: stripHtml(descriptionHtml) || 'No description available.',
    descriptionHtml,
    coverImage: anime.coverImage?.large || anime.coverImage?.medium,
    bannerImage: anime.bannerImage || anime.coverImage?.large,
    episodes: anime.episodes,
    status: anime.status,
    score: anime.averageScore ? anime.averageScore / 10 : null,
    rating: anime.averageScore,
    year: anime.seasonYear || anime.startDate?.year,
    season: anime.season?.toLowerCase(),
    studios: anime.studios?.nodes?.map((s) => s.name) || [],
    genres: anime.genres || [],
    themes: anime.tags?.map((t) => t.name) || [],
    type: anime.format,
    source: anime.source,
    duration: anime.duration,
    synonyms: anime.synonyms || [],
    stats: {
      averageScore: anime.averageScore ?? null,
      popularity: anime.popularity ?? null,
      favourites: anime.favourites ?? null,
      trending: anime.trending ?? null
    },
    aired: {
      from: anime.startDate ? new Date(anime.startDate.year, anime.startDate.month - 1, anime.startDate.day) : null,
      to: anime.endDate ? new Date(anime.endDate.year, anime.endDate.month - 1, anime.endDate.day) : null,
      string: null
    }
  };
};

// Map schedule data
const mapScheduleItem = (anime) => {
  return {
    id: anime.mal_id?.toString(),
    title: anime.title,
    titleEnglish: anime.title_english,
    coverImage: anime.images?.jpg?.image_url,
    airingTime: anime.broadcast?.time,
    airingDay: anime.broadcast?.day,
    timezone: anime.broadcast?.timezone,
    episodes: anime.episodes,
    score: anime.score,
    type: anime.type,
    year: anime.year
  };
};

const mapAniListRelations = (edges = []) =>
  edges
    .map((edge) => {
      if (!edge?.node?.id) return null;
      return {
        id: edge.node.id.toString(),
        relationType: edge.relationType,
        title: edge.node.title?.english || edge.node.title?.romaji || 'Untitled',
        coverImage: edge.node.coverImage?.medium || edge.node.coverImage?.large,
        episodes: edge.node.episodes ?? null,
        seasonYear: edge.node.seasonYear ?? null,
        season: edge.node.season ? edge.node.season.toLowerCase() : null,
        format: edge.node.format || null,
        duration: edge.node.duration ?? null
      };
    })
    .filter(Boolean);

const mapAniListRecommendations = (nodes = []) =>
  nodes
    .map((node) => {
      const rec = node?.mediaRecommendation;
      if (!rec?.id) return null;
      return {
        id: rec.id.toString(),
        title: rec.title?.english || rec.title?.romaji || 'Untitled',
        coverImage: rec.coverImage?.large || rec.coverImage?.medium,
        score: rec.averageScore ? rec.averageScore / 10 : null
      };
    })
    .filter(Boolean);

const fetchJikanExtras = async (malId) => {
  if (!malId) return null;

  try {
    const { data } = await axios.get(`${JIKAN_BASE}/anime/${malId}/full`);
    const payload = data?.data;
    if (!payload) return null;

    return {
      stats: {
        rank: payload.rank ?? null,
        popularity: payload.popularity ?? null,
        members: payload.members ?? null,
        favorites: payload.favorites ?? null,
        score: payload.score ?? null,
        scoredBy: payload.scored_by ?? null
      },
      broadcast: payload.broadcast || null,
      producers: payload.producers?.map((entry) => entry.name).filter(Boolean) || [],
      licensors: payload.licensors?.map((entry) => entry.name).filter(Boolean) || [],
      studios: payload.studios?.map((entry) => entry.name).filter(Boolean) || [],
      streaming: payload.streaming?.map((service) => ({
        name: service.name,
        url: service.url
      })).filter((service) => service.name && service.url) || [],
      trailer: payload.trailer?.url
        ? {
            url: payload.trailer.url,
            site: payload.trailer.site,
            thumbnail: payload.trailer.images?.maximum_image_url || payload.trailer.images?.large_image_url
          }
        : null
    };
  } catch (error) {
    console.warn('Failed to fetch Jikan extras:', error.message);
    return null;
  }
};

// Get top anime by filter using AniList API (more reliable)
export const getTopAnime = async (type = 'anime', filter = 'airing', page = 1, limit = 20) => {
  try {
    // Determine sort based on filter
    let sort = 'POPULARITY_DESC';
    if (filter === 'airing') sort = 'POPULARITY_DESC';
    else if (filter === 'upcoming') sort = 'POPULARITY_DESC';
    else if (filter === 'favorite') sort = 'FAVOURITES_DESC';

    // Determine status based on filter
    let status = null;
    if (filter === 'airing') status = 'RELEASING';
    else if (filter === 'upcoming') status = 'NOT_YET_RELEASED';

    const query = `
      query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            lastPage
            hasNextPage
            perPage
          }
          media(type: ANIME, sort: $sort, status: $status) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              large
              medium
            }
            bannerImage
            episodes
            status
            averageScore
            popularity
            favourites
            synonyms
            seasonYear
            season
            genres
            studios {
              nodes {
                name
              }
            }
            tags {
              name
            }
            format
            source
            duration
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
          }
        }
      }
    `;

    const variables = {
      page,
      perPage: limit,
      sort: [sort],
      status
    };

    const response = await axios.post(ANILIST_BASE, {
      query,
      variables
    });

    const data = response.data.data.Page;

    return {
      results: data.media?.map(mapAniListAnime) || [],
      pagination: {
        current_page: data.pageInfo.currentPage,
        has_next_page: data.pageInfo.hasNextPage,
        last_visible_page: data.pageInfo.lastPage,
        items: {
          count: data.media?.length || 0,
          total: data.pageInfo.total,
          per_page: data.pageInfo.perPage
        }
      }
    };
  } catch (error) {
    console.error('Error fetching top anime:', error.message);
    // Fallback to Jikan if AniList fails
    return getTopAnimeJikan(type, filter, page, limit);
  }
};

// Jikan API fallback
const getTopAnimeJikan = async (type = 'anime', filter = 'bypopularity', page = 1, limit = 20) => {
  try {
    await delay(500); // Rate limiting
    const response = await axios.get(`${JIKAN_BASE}/top/anime`, {
      params: { page, limit }
    });

    return {
      results: response.data.data?.map(mapAnime) || [],
      pagination: response.data.pagination || {}
    };
  } catch (error) {
    console.error('Error fetching from Jikan:', error.message);
    throw new Error('Unable to fetch anime data from any source');
  }
};

// Get seasonal anime
export const getSeasonalAnime = async (year, season, page = 1) => {
  try {
    const response = await axios.get(`${JIKAN_BASE}/seasons/${year}/${season}`, {
      params: { page }
    });

    return {
      results: response.data.data?.map(mapAnime) || [],
      pagination: response.data.pagination || {}
    };
  } catch (error) {
    console.error('Error fetching seasonal anime:', error.message);
    throw error;
  }
};

// Get current season anime
export const getCurrentSeasonAnime = async (page = 1) => {
  try {
    const response = await axios.get(`${JIKAN_BASE}/seasons/now`, {
      params: { page }
    });

    return {
      results: response.data.data?.map(mapAnime) || [],
      pagination: response.data.pagination || {}
    };
  } catch (error) {
    console.error('Error fetching current season anime:', error.message);
    throw error;
  }
};

// Get anime schedule for the week
export const getAnimeSchedule = async (day) => {
  try {
    // Use AniList for airing anime
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            hasNextPage
          }
          airingSchedules(notYetAired: false, sort: TIME_DESC) {
            airingAt
            episode
            media {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                medium
              }
              episodes
              status
              averageScore
              seasonYear
              genres
              format
            }
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_BASE, {
      query,
      variables: { page: 1, perPage: 50 }
    });

    const schedules = response.data.data.Page.airingSchedules || [];
    
    // Map to our format with day info
    const results = schedules.map(schedule => {
      const airingDate = new Date(schedule.airingAt * 1000);
      const dayName = airingDate.toLocaleDateString('en-US', { weekday: 'long' });
      const time = airingDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      return {
        id: schedule.media.id?.toString(),
        title: schedule.media.title.english || schedule.media.title.romaji,
        titleEnglish: schedule.media.title.english,
        coverImage: schedule.media.coverImage.large,
        airingTime: time,
        airingDay: dayName,
        timezone: 'UTC',
        episodes: schedule.media.episodes,
        score: schedule.media.averageScore ? schedule.media.averageScore / 10 : null,
        type: schedule.media.format,
        year: schedule.media.seasonYear,
        episode: schedule.episode,
        airingAt: airingDate.toISOString()
      };
    });

    // Filter by day if specified
    const filtered = day 
      ? results.filter(r => r.airingDay.toLowerCase() === day.toLowerCase())
      : results;

    return {
      results: filtered,
      pagination: response.data.data.Page.pageInfo
    };
  } catch (error) {
    console.error('Error fetching anime schedule:', error.message);
    // Fallback to Jikan
    return getScheduleJikan(day);
  }
};

// Jikan schedule fallback
const getScheduleJikan = async (day) => {
  try {
    await delay(500);
    const params = day ? { filter: day.toLowerCase() } : {};
    const response = await axios.get(`${JIKAN_BASE}/schedules`, { params });

    return {
      results: response.data.data?.map(mapScheduleItem) || [],
      pagination: response.data.pagination || {}
    };
  } catch (error) {
    console.error('Error fetching schedule from Jikan:', error.message);
    return { results: [], pagination: {} };
  }
};

// Search anime
export const searchAnime = async (queryText, page = 1, limit = 20) => {
  try {
    const query = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            hasNextPage
          }
          media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              large
              medium
            }
            bannerImage
            episodes
            status
            averageScore
            popularity
            favourites
            synonyms
            seasonYear
            season
            genres
            studios {
              nodes {
                name
              }
            }
            format
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_BASE, {
      query,
      variables: {
        search: queryText,
        page,
        perPage: limit
      }
    });

    const data = response.data.data.Page;

    return {
      results: data.media?.map(mapAniListAnime) || [],
      pagination: {
        current_page: data.pageInfo.currentPage,
        has_next_page: data.pageInfo.hasNextPage
      }
    };
  } catch (error) {
    console.error('Error searching anime:', error.message);
    throw error;
  }
};

// Get anime by ID
export const getAnimeById = async (id) => {
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          description
          coverImage {
            large
            medium
          }
          bannerImage
          episodes
          status
          averageScore
          popularity
          favourites
          trending
          synonyms
          seasonYear
          season
          genres
          studios {
            nodes {
              name
            }
          }
          tags {
            name
          }
          format
          source
          duration
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          relations {
            edges {
              relationType
              node {
                id
                title {
                  english
                  romaji
                }
                coverImage {
                  medium
                }
                episodes
                season
                seasonYear
                format
                duration
              }
            }
          }
          recommendations {
            nodes {
              mediaRecommendation {
                id
                title {
                  english
                  romaji
                }
                coverImage {
                  large
                }
                averageScore
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_BASE, {
      query,
      variables: { id: parseInt(id) }
    });

    const media = response.data.data.Media;
    const base = mapAniListAnime(media);
    const relations = mapAniListRelations(media.relations?.edges || []);
    const recommendations = mapAniListRecommendations(media.recommendations?.nodes || []);
    const jikanExtras = await fetchJikanExtras(base.malId);

    return {
      ...base,
      relations,
      recommendations,
      externalLinks: {
        anilist: base.id ? `https://anilist.co/anime/${base.id}` : null,
        mal: base.malId ? `https://myanimelist.net/anime/${base.malId}` : null
      },
      producers: jikanExtras?.producers || [],
      licensors: jikanExtras?.licensors || [],
      streamingPlatforms: jikanExtras?.streaming || [],
      broadcast: jikanExtras?.broadcast || null,
      trailer: jikanExtras?.trailer || null,
      malStats: jikanExtras?.stats || null,
      additionalStudios: jikanExtras?.studios || []
    };
  } catch (error) {
    console.error('Error fetching anime by ID:', error.message);
    throw error;
  }
};

// Get anime episodes (requires MyAnimeList id)
export const getAnimeEpisodes = async ({ malId, page = 1 } = {}) => {
  if (!malId) {
    throw new Error('A MyAnimeList id is required to fetch episodes.');
  }

  try {
    const response = await axios.get(`${JIKAN_BASE}/anime/${malId}/episodes`, {
      params: { page }
    });

    return {
      results: response.data.data?.map((ep) => ({
        id: ep.mal_id?.toString(),
        number: ep.mal_id,
        title: ep.title,
        titleJapanese: ep.title_japanese,
        titleRomanji: ep.title_romanji,
        aired: ep.aired,
        score: ep.score,
        filler: ep.filler,
        recap: ep.recap,
        forumUrl: ep.forum_url
      })) || [],
      pagination: response.data.pagination || {}
    };
  } catch (error) {
    console.error('Error fetching anime episodes:', error.message);
    throw error;
  }
};

// Get recommendations
export const getAnimeRecommendations = async (malId) => {
  if (!malId) return [];

  try {
    await delay(1000); // Rate limiting
    const response = await axios.get(`${JIKAN_BASE}/anime/${malId}/recommendations`);
    
    return response.data.data?.slice(0, 10).map((rec) => mapAnime(rec.entry)) || [];
  } catch (error) {
    console.error('Error fetching anime recommendations:', error.message);
    return [];
  }
};

// Get famous anime by IDs (Naruto, One Piece, etc.)
export const getFamousAnimeByIds = async (ids) => {
  try {
    const query = `
      query ($ids: [Int]) {
        Page {
          media(id_in: $ids, type: ANIME) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              large
              medium
            }
            bannerImage
            episodes
            status
            averageScore
            seasonYear
            season
            genres
            studios {
              nodes {
                name
              }
            }
            format
            popularity
            favourites
            synonyms
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_BASE, {
      query,
      variables: { ids }
    });

    return response.data.data.Page.media?.map(mapAniListAnime) || [];
  } catch (error) {
    console.error('Error fetching famous anime:', error.message);
    return [];
  }
};

// Get top episodes of the week from recent airing schedule
export const getTopEpisodesOfWeek = async () => {
  try {
    const query = `
      query {
        Page(page: 1, perPage: 20) {
          airingSchedules(
            airingAt_greater: ${Math.floor(Date.now() / 1000) - 604800}
            airingAt_lesser: ${Math.floor(Date.now() / 1000)}
            sort: [TIME_DESC]
          ) {
            id
            episode
            airingAt
            media {
              id
              idMal
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                medium
              }
              bannerImage
              episodes
              status
              averageScore
              seasonYear
              popularity
              genres
              format
            }
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_BASE, { query });
    const schedules = response.data.data.Page.airingSchedules || [];

    // Sort by popularity and get top episodes
    const topEpisodes = schedules
      .sort((a, b) => (b.media.popularity || 0) - (a.media.popularity || 0))
      .slice(0, 10)
      .map(schedule => {
        const anime = mapAniListAnime(schedule.media);
        return {
          ...anime,
          episode: schedule.episode,
          airedAt: new Date(schedule.airingAt * 1000).toISOString(),
          episodeTitle: `Episode ${schedule.episode}`
        };
      });

    return { results: topEpisodes };
  } catch (error) {
    console.error('Error fetching top episodes:', error.message);
    return { results: [] };
  }
};
