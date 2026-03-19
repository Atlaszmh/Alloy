import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// List all configs
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('game_configs')
    .select('id, name, version, parent_id, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get single config with full data
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('game_configs')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// Create or update config
router.post('/', async (req, res) => {
  const { name, version, config, parent_id } = req.body;
  const { data, error } = await supabase
    .from('game_configs')
    .insert({ name, version, config, parent_id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
