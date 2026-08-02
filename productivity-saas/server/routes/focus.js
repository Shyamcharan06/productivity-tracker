const express = require('express');
const router = express.Router();
const FocusSession = require('../models/FocusSession');
const DailyStats = require('../models/DailyStats');
const auth = require('../middleware/auth');

// Get all focus sessions
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const sessions = await FocusSession.find({ user: req.user._id })
      .sort({ startedAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create focus session
// POST /api/focus
// POST /api/focus
router.post('/', auth, async (req, res) => {
  try {
    const DailyStats = require('../models/DailyStats');
    
    const session = new FocusSession({
      ...req.body,
      user: req.user._id
    });
    
    await session.save();
    
    // Update daily stats
    const stats = await DailyStats.getTodayStats(req.user._id);
    stats.sessions += 1;
    stats.focusMinutes += Math.floor(session.duration / 60);
    stats.distractions += (session.distractions || 0);
    
    // Calculate and save scores
    const focusScore = await req.user.calculateFocusScore();
    const productivityScore = await req.user.calculateProductivityScore();
    stats.focusScore = focusScore;
    stats.productivityScore = productivityScore;
    
    await stats.save();
    
    res.status(201).json({ session, focusScore });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update focus session
router.patch('/:id', auth, async (req, res) => {
  try {
    const session = await FocusSession.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updates = req.body;
    const allowedUpdates = ['notes', 'interrupted'];

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        session[key] = updates[key];
      }
    });

    await session.save();
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete focus session
router.delete('/:id', auth, async (req, res) => {
  try {
    const session = await FocusSession.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get focus statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate = new Date();
    if (period === '7d') startDate.setDate(startDate.getDate() - 7);
    else if (period === '30d') startDate.setDate(startDate.getDate() - 30);
    else if (period === '90d') startDate.setDate(startDate.getDate() - 90);
    
    const sessions = await FocusSession.find({
      user: req.user._id,
      startedAt: { $gte: startDate }
    });

    const stats = {
      totalSessions: sessions.length,
      totalMinutes: Math.floor(sessions.reduce((sum, s) => sum + s.duration, 0) / 60),
      completedSessions: sessions.filter(s => !s.interrupted).length,
      interruptedSessions: sessions.filter(s => s.interrupted).length,
      averageSessionMinutes: sessions.length > 0
        ? Math.floor(sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length / 60)
        : 0
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;