import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mangaRoutes from './routes/manga.js';
import animeRoutes from './routes/anime.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', mangaRoutes);
app.use('/api/anime', animeRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'ANIMIX API is live.' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
