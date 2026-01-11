import express from 'express';
import axios from 'axios';
import mangaService from '../services/mangaService.js';

const router = express.Router();

// Image proxy to bypass CORS/hotlinking restrictions
router.get('/proxy/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Only allow MangaDex image URLs
    if (!url.startsWith('https://uploads.mangadex.org/') && !url.startsWith('https://mangadex.org/')) {
      return res.status(403).json({ error: 'Invalid image URL' });
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'Referer': 'https://mangadex.org/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(response.data);
  } catch (error) {
    console.error('Error proxying image:', error.message);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

router.get('/manga/trending', async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const data = await mangaService.getTrending({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching trending manga:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending manga', message: error.message });
  }
});

router.get('/manga/popular', async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const data = await mangaService.getPopular({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching popular manga:', error.message);
    res.status(500).json({ error: 'Failed to fetch popular manga', message: error.message });
  }
});

router.get('/manga/latest', async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const data = await mangaService.getLatestChapters({
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching latest chapters:', error.message);
    res.status(500).json({ error: 'Failed to fetch latest chapters', message: error.message });
  }
});

router.get('/manga/search', async (req, res) => {
  try {
    const { query = '', page = 1, limit = 20 } = req.query;
    if (!query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const data = await mangaService.searchManga({
      query,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (error) {
    console.error('Error searching manga:', error.message);
    res.status(500).json({ error: 'Failed to search manga', message: error.message });
  }
});

router.get('/manga/:id', async (req, res) => {
  try {
    const data = await mangaService.getMangaDetails(req.params.id);
    res.json(data);
  } catch (error) {
    console.error('Error fetching manga details:', error.message);
    res.status(500).json({ error: 'Failed to fetch manga details', message: error.message });
  }
});

router.get('/manga/:id/chapters', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const data = await mangaService.getMangaChapters({
      mangaId: req.params.id,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching manga chapters:', error.message);
    res.status(500).json({ error: 'Failed to fetch manga chapters', message: error.message });
  }
});

router.get('/chapters/:chapterId/pages', async (req, res) => {
  try {
    const data = await mangaService.getChapterPages(req.params.chapterId);
    res.json(data);
  } catch (error) {
    console.error('Error fetching chapter pages:', error.message);
    res.status(500).json({ error: 'Failed to fetch chapter pages', message: error.message });
  }
});

export default router;
