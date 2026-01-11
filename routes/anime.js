import express from 'express';
import {
  getTopAnime,
  getCurrentSeasonAnime,
  getAnimeSchedule,
  searchAnime,
  getAnimeById,
  getAnimeEpisodes,
  getAnimeRecommendations
} from '../services/animeService.js';

const router = express.Router();

// Get top anime
router.get('/top', async (req, res, next) => {
  try {
    const { type = 'anime', filter = 'airing', page = 1, limit = 20 } = req.query;
    const data = await getTopAnime(type, filter, parseInt(page), parseInt(limit));
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get current season anime
router.get('/season/now', async (req, res, next) => {
  try {
    const { page = 1 } = req.query;
    const data = await getCurrentSeasonAnime(parseInt(page));
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get anime schedule
router.get('/schedule', async (req, res, next) => {
  try {
    const { day } = req.query;
    const data = await getAnimeSchedule(day);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Search anime
router.get('/search', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const data = await searchAnime(q, parseInt(page), parseInt(limit));
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get famous anime (must be before /:id route)
router.get('/famous', async (req, res, next) => {
  try {
    // Famous anime IDs from AniList
    const famousIds = [
      20,    // Naruto
      21,    // One Piece  
      269,   // Bleach
      813,   // Dragon Ball Z
      6702,  // Fairy Tail
      1535,  // Death Note
      11061, // Hunter x Hunter (2011)
      16498, // Attack on Titan
      31964, // Boku no Hero Academia
      101922 // Demon Slayer
    ];

    const { getFamousAnimeByIds } = await import('../services/animeService.js');
    const data = await getFamousAnimeByIds(famousIds);
    res.json({ results: data });
  } catch (error) {
    next(error);
  }
});

// Get top episodes of the week (must be before /:id route)
router.get('/episodes/weekly-top', async (req, res, next) => {
  try {
    const { getTopEpisodesOfWeek } = await import('../services/animeService.js');
    const data = await getTopEpisodesOfWeek();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get anime by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await getAnimeById(id);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get anime episodes
router.get('/:id/episodes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, malId } = req.query;
    const sourceMalId = parseInt(malId || id, 10);

    if (Number.isNaN(sourceMalId)) {
      return res.status(400).json({ error: 'A valid MyAnimeList id is required to fetch episodes.' });
    }

    const data = await getAnimeEpisodes({
      malId: sourceMalId,
      page: parseInt(page, 10)
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get anime recommendations
router.get('/:id/recommendations', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { malId } = req.query;
    const sourceMalId = parseInt(malId || id, 10);
    if (Number.isNaN(sourceMalId)) {
      return res.status(400).json({ error: 'A valid MyAnimeList id is required to fetch recommendations.' });
    }
    const data = await getAnimeRecommendations(sourceMalId);
    res.json({ results: data });
  } catch (error) {
    next(error);
  }
});

export default router;
