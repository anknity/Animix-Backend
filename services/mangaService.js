import axios from 'axios';

const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_UPLOAD = 'https://uploads.mangadex.org';

const languageParams = ['en'];
const contentRatings = ['safe', 'suggestive'];

const buildCoverUrl = (manga) => {
  const cover = manga?.relationships?.find((rel) => rel.type === 'cover_art');
  const fileName = cover?.attributes?.fileName;
  if (!fileName) return null;
  return `${MANGADEX_UPLOAD}/covers/${manga.id}/${fileName}.512.jpg`;
};

const mapTags = (manga) => {
  if (!Array.isArray(manga?.attributes?.tags)) return [];
  return manga.attributes.tags
    .map((tag) => tag?.attributes?.name?.en)
    .filter(Boolean);
};

const mapManga = (manga, stats = {}) => ({
  id: manga.id,
  title: {
    english: manga.attributes?.title?.en || manga.attributes?.altTitles?.find((alt) => alt.en)?.en || null,
    romaji: manga.attributes?.title?.ja || manga.attributes?.title?.jp || null,
    native: manga.attributes?.title?.ja || manga.attributes?.title?.jp || null
  },
  description: manga.attributes?.description?.en || null,
  status: manga.attributes?.status || null,
  genres: mapTags(manga),
  image: buildCoverUrl(manga),
  cover: buildCoverUrl(manga),
  rating: stats.rating ?? null,
  ratingVotes: stats.ratingVotes ?? null,
  follows: stats.follows ?? manga.attributes?.follows ?? null,
  lastChapter: manga.attributes?.lastChapter || null,
  publicationYear: manga.attributes?.year || null,
  demographic: manga.attributes?.publicationDemographic || null,
  contentRating: manga.attributes?.contentRating || null,
  tags: mapTags(manga)
});

const mapChapter = (chapter) => ({
  id: chapter.id,
  title: chapter.attributes?.title || null,
  chapter: chapter.attributes?.chapter || chapter.attributes?.hash || '—',
  volume: chapter.attributes?.volume || null,
  pages: chapter.attributes?.pages || 0,
  readableAt: chapter.attributes?.readableAt || chapter.attributes?.publishAt || null,
  translatedLanguage: chapter.attributes?.translatedLanguage || null
});

const fetchStatistics = async (ids = []) => {
  if (!ids.length) return {};
  try {
    const { data } = await axios.get(`${MANGADEX_API}/statistics/manga`, {
      params: { 'manga[]': ids }
    });

    const stats = data?.statistics || {};
    return Object.keys(stats).reduce((acc, key) => {
      const entry = stats[key];
      acc[key] = {
        rating: entry?.rating?.bayesian ?? null,
        ratingVotes: entry?.rating?.votes ?? null,
        follows: entry?.follows ?? null
      };
      return acc;
    }, {});
  } catch (error) {
    console.warn('Failed to fetch manga statistics:', error.message);
    return {};
  }
};

const fetchMangaList = async ({
  page = 1,
  limit = 12,
  order = {},
  query
} = {}) => {
  const offset = (page - 1) * limit;
  const params = {
    limit,
    offset,
    'includes[]': ['cover_art'],
    'contentRating[]': contentRatings,
    'availableTranslatedLanguage[]': languageParams
  };

  Object.entries(order).forEach(([key, value]) => {
    params[`order[${key}]`] = value;
  });

  if (query) {
    params.title = query;
  }

  const { data } = await axios.get(`${MANGADEX_API}/manga`, { params });
  const list = data?.data || [];
  const stats = await fetchStatistics(list.map((item) => item.id));

  const results = list.map((item) => mapManga(item, stats[item.id]));

  return {
    results,
    total: data?.total ?? results.length,
    limit,
    page,
    hasNextPage: offset + limit < (data?.total ?? 0)
  };
};

const getTrending = async ({ page = 1, limit = 12 } = {}) => fetchMangaList({
  page,
  limit,
  order: { rating: 'desc' }
});

const getPopular = async ({ page = 1, limit = 12 } = {}) => fetchMangaList({
  page,
  limit,
  order: { followedCount: 'desc' }
});

const searchManga = async ({ query, page = 1, limit = 20 } = {}) => fetchMangaList({
  query,
  page,
  limit,
  order: { relevance: 'desc' }
});

const getMangaDetails = async (id) => {
  const { data } = await axios.get(`${MANGADEX_API}/manga/${id}`, {
    params: {
      'includes[]': ['cover_art', 'author', 'artist']
    }
  });

  if (!data?.data) {
    throw new Error('Manga not found');
  }

  const stats = await fetchStatistics([id]);
  const manga = mapManga(data.data, stats[id]);

  const authors = (data.data.relationships || [])
    .filter((rel) => rel.type === 'author' || rel.type === 'artist')
    .map((rel) => rel.attributes?.name)
    .filter(Boolean);

  return {
    ...manga,
    authors
  };
};

const getMangaChapters = async ({ mangaId, page = 1, limit = 100 } = {}) => {
  const offset = (page - 1) * limit;

  const { data } = await axios.get(`${MANGADEX_API}/chapter`, {
    params: {
      limit,
      offset,
      manga: mangaId,
      'includes[]': ['scanlation_group'],
      'translatedLanguage[]': languageParams,
      'contentRating[]': contentRatings,
      'order[chapter]': 'asc'
    }
  });

  const chapters = (data?.data || []).map(mapChapter);

  return {
    results: chapters,
    total: data?.total ?? chapters.length,
    limit,
    page,
    hasNextPage: offset + limit < (data?.total ?? 0)
  };
};

const getLatestChapters = async ({ limit = 12 } = {}) => {
  const { data } = await axios.get(`${MANGADEX_API}/chapter`, {
    params: {
      limit,
      'includes[]': ['manga'],
      'translatedLanguage[]': languageParams,
      'contentRating[]': contentRatings,
      'order[readableAt]': 'desc'
    }
  });

  const chapters = data?.data || [];
  const includedManga = new Map();

  chapters.forEach((chapter) => {
    (chapter.relationships || []).forEach((rel) => {
      if (rel.type === 'manga' && rel?.attributes) {
        includedManga.set(rel.id, rel);
      }
    });
  });

  const stats = await fetchStatistics(Array.from(includedManga.keys()));

  return {
    results: chapters.map((chapter) => {
      const mangaRel = (chapter.relationships || []).find((rel) => rel.type === 'manga');
      const mangaData = mangaRel?.attributes ? mapManga(mangaRel, stats[mangaRel.id]) : null;

      return {
        ...mapChapter(chapter),
        manga: mangaData ? mangaData : null
      };
    })
  };
};

const getChapterPages = async (chapterId) => {
  const { data } = await axios.get(`${MANGADEX_API}/at-home/server/${chapterId}`);

  const baseUrl = data?.baseUrl;
  const hash = data?.chapter?.hash;
  const files = data?.chapter?.data || [];

  if (!baseUrl || !hash || !files.length) {
    throw new Error('Pages not available for this chapter');
  }

  const pages = files.map((fileName, index) => ({
    index: index + 1,
    url: `${baseUrl}/data/${hash}/${fileName}`
  }));

  return {
    chapterId,
    pages,
    pageCount: pages.length
  };
};

export default {
  getTrending,
  getPopular,
  searchManga,
  getMangaDetails,
  getMangaChapters,
  getLatestChapters,
  getChapterPages
};
