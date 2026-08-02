const express = require('express');
const router = express.Router();
const Habit = require('../models/Habit');
const auth = require('../middleware/auth');

// REMOVE DailyStats import temporarily - we'll fix the logic differently

// Get all habits for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const habits = await Habit.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json({ habits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new habit
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Habit name is required' });
    }
    
    const habit = new Habit({
      user: req.user._id,
      name: name.trim()
    });
    
    await habit.save();
    res.status(201).json({ habit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark habit as complete for today
router.patch('/:id/complete', auth, async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    const completed = habit.completeForToday();
    
    if (!completed) {
      return res.status(400).json({ 
        error: 'Habit already completed today',
        habit 
      });
    }
    
    await habit.save();
    
    // Update daily stats ONLY if DailyStats model exists
    try {
      const DailyStats = require('../models/DailyStats');
      const stats = await DailyStats.getTodayStats(req.user._id);
      stats.habitsCompleted += 1;
      
      if (req.user.calculateFocusScore && req.user.calculateProductivityScore) {
        const focusScore = await req.user.calculateFocusScore();
        const productivityScore = await req.user.calculateProductivityScore();
        stats.focusScore = focusScore;
        stats.productivityScore = productivityScore;
      }
      
      await stats.save();
    } catch (err) {
      console.log('DailyStats not available:', err.message);
      // Continue without stats update
    }
    
    res.json({ habit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete habit
router.delete('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    res.json({ message: 'Habit deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;