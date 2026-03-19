import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes will be added in subsequent tasks
// app.use('/api/configs', configRoutes);
// app.use('/api/simulations', simulationRoutes);
// app.use('/api/reports', reportRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Tools server running on port ${PORT}`);
});

export { app };
