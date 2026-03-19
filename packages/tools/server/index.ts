import express from 'express';
import cors from 'cors';
import configRoutes from './routes/configs.js';
import simulationRoutes from './routes/simulations.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/configs', configRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/reports', reportRoutes);

// Only start listening when run directly (not imported by tests)
if (process.argv[1]?.includes('server/index')) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Tools server running on port ${PORT}`);
  });
}

export { app };
