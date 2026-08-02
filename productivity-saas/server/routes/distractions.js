const express = require('express');
const router = express.Router();
const Distraction = require('../models/Distraction');
const DailyStats = require('../models/DailyStats');
const auth = require('../middleware/auth');

// Get all distractions for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const { sessionId, limit = 100 } = req.query;
    
    let query = { user: req.user._id };
    if (sessionId) {
      query.sessionId = sessionId;
    }
    
    const distractions = await Distraction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ distractions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new distraction
router.post('/', auth, async (req, res) => {
  try {
    const { type, reason, sessionId } = req.body;
    
    if (!type || !['auto', 'manual'].includes(type)) {
      return res.status(400).json({ error: 'Invalid distraction type' });
    }
    
    const distraction = new Distraction({
      user: req.user._id,
      type,
      reason: reason || (type === 'auto' ? 'Tab switched' : ''),
      sessionId: sessionId || null
    });
    
    await distraction.save();
    res.status(201).json({ distraction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete distraction
router.delete('/:id', auth, async (req, res) => {
  try {
    const distraction = await Distraction.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!distraction) {
      return res.status(404).json({ error: 'Distraction not found' });
    }
    
    res.json({ message: 'Distraction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get distraction statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate = new Date();
    if (period === '7d') startDate.setDate(startDate.getDate() - 7);
    else if (period === '30d') startDate.setDate(startDate.getDate() - 30);
    else if (period === '90d') startDate.setDate(startDate.getDate() - 90);
    
    const distractions = await Distraction.find({
      user: req.user._id,
      createdAt: { $gte: startDate }
    });

    const stats = {
      total: distractions.length,
      auto: distractions.filter(d => d.type === 'auto').length,
      manual: distractions.filter(d => d.type === 'manual').length,
      averagePerDay: distractions.length / parseInt(period)
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this route before module.exports

// Update distraction (e.g., add sessionId after session is saved)
router.patch('/:id', auth, async (req, res) => {
  try {
    const distraction = await Distraction.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!distraction) {
      return res.status(404).json({ error: 'Distraction not found' });
    }

    const { sessionId } = req.body;
    if (sessionId) {
      distraction.sessionId = sessionId;
    }

    await distraction.save();
    res.json({ distraction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;