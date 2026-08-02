const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// Get all tasks
router.get('/', auth, async (req, res) => {
  try {
    const { status, priority } = req.query;
    
    let query = { user: req.user._id };
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/', auth, async (req, res) => {
  try {
    const task = new Task({
      ...req.body,
      user: req.user._id
    });

    await task.save();
    res.status(201).json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task
// PATCH /api/tasks/:id
// PATCH /api/tasks/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const DailyStats = require('../models/DailyStats');
    
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const allowedUpdates = ['title', 'description', 'status', 'priority', 'dueDate'];
    const updates = Object.keys(req.body);
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({ error: 'Invalid updates' });
    }

    const previousStatus = task.status;
    
    updates.forEach(update => task[update] = req.body[update]);
    await task.save();

    // Increment daily stats if status changed TO completed
    if (previousStatus !== 'completed' && task.status === 'completed') {
      const stats = await DailyStats.getTodayStats(req.user._id);
      stats.tasksCompleted += 1;
      
      // Calculate and save scores
      const focusScore = await req.user.calculateFocusScore();
      const productivityScore = await req.user.calculateProductivityScore();
      stats.focusScore = focusScore;
      stats.productivityScore = productivityScore;
      
      await stats.save();
    }

    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id });
    
    const stats = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      todo: tasks.filter(t => t.status === 'todo').length,
      byPriority: {
        low: tasks.filter(t => t.priority === 'low').length,
        medium: tasks.filter(t => t.priority === 'medium').length,
        high: tasks.filter(t => t.priority === 'high').length
      }
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;