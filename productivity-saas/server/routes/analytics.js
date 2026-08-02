const express = require('express');
const router = express.Router();
const DailyStats = require('../models/DailyStats');
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const FocusSession = require('../models/FocusSession');
const Distraction = require('../models/Distraction');
const auth = require('../middleware/auth');

router.get('/daily/:date', auth, async (req, res) => {
  try {
    const date = new Date(req.params.date);
    date.setHours(0, 0, 0, 0);
    
    const stats = await DailyStats.findOne({ user: req.user._id, date });
    
    if (!stats) {
      return res.json({ stats: null });
    }
    
    const tasks = await Task.find({ 
      user: req.user._id,
      createdAt: { $gte: date, $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) }
    });
    
    const habits = await Habit.find({ user: req.user._id });
    const sessions = await FocusSession.find({
      user: req.user._id,
      startedAt: { $gte: date, $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) }
    });
    
    const distractions = await Distraction.find({
      user: req.user._id,
      createdAt: { $gte: date, $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) }
    });
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const taskScore = totalTasks > 0 ? completedTasks / totalTasks : 0;
    
    const totalFocusMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
    const targetFocusMinutes = 120;
    const focusTimeScore = targetFocusMinutes > 0 && totalFocusMinutes > 0 ? Math.min(totalFocusMinutes / targetFocusMinutes, 1) : 0;
    
    const totalHabits = habits.length;
    const habitsCompletedToday = habits.filter(h => {
      if (!h.lastCompletedDate) return false;
      const lastCompleted = new Date(h.lastCompletedDate);
      lastCompleted.setHours(0, 0, 0, 0);
      return lastCompleted.getTime() === date.getTime();
    }).length;
    const habitScore = totalHabits > 0 ? habitsCompletedToday / totalHabits : 0;
    
    const distractionCount = distractions.length;
    const maxAllowedDistractions = 10;
    const distractionScore = maxAllowedDistractions > 0 ? Math.max(0, 1 - (distractionCount / maxAllowedDistractions)) : 0;
    
    const hasAnyData = totalTasks > 0 || sessions.length > 0 || totalHabits > 0;
    
    if (!hasAnyData) {
      stats.productivityScore = 0;
      stats.focusScore = 0;
    } else {
      const clampedTaskScore = Math.max(0, Math.min(1, isNaN(taskScore) ? 0 : taskScore));
      const clampedFocusTimeScore = Math.max(0, Math.min(1, isNaN(focusTimeScore) ? 0 : focusTimeScore));
      const clampedHabitScore = Math.max(0, Math.min(1, isNaN(habitScore) ? 0 : habitScore));
      const clampedDistractionScore = Math.max(0, Math.min(1, isNaN(distractionScore) ? 0 : distractionScore));
      
      const rawProductivity = (0.4 * clampedTaskScore + 0.3 * clampedFocusTimeScore + 0.2 * clampedHabitScore + 0.1 * clampedDistractionScore) * 100;
      stats.productivityScore = isNaN(rawProductivity) ? 0 : Math.round(Math.max(0, Math.min(100, rawProductivity)));
      
      const avgDistractionScore = sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + Math.max(0, 1 - ((s.distractions || 0) * 0.2)), 0) / sessions.length
        : 0;
      const sessionCompletionRate = sessions.length > 0 ? sessions.filter(s => !s.interrupted).length / sessions.length : 0;
      const clampedAvgDistraction = Math.max(0, Math.min(1, avgDistractionScore || 0));
      const clampedCompletion = Math.max(0, Math.min(1, sessionCompletionRate || 0));
      
      const rawFocus = (0.6 * clampedAvgDistraction + 0.4 * clampedCompletion) * 100;
      stats.focusScore = isNaN(rawFocus) ? 0 : Math.round(Math.max(0, Math.min(100, rawFocus)));
    }
    
    await stats.save();
    
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/weekly', auth, async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    
    const today = new Date();
    today.setDate(today.getDate() + (offset * 7));
    
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const stats = await DailyStats.find({
      user: req.user._id,
      date: { $gte: weekStart, $lt: weekEnd }
    }).sort({ date: 1 });
    
    const tasks = await Task.find({ 
      user: req.user._id,
      createdAt: { $gte: weekStart, $lt: weekEnd }
    });
    
    const habits = await Habit.find({ user: req.user._id });
    const sessions = await FocusSession.find({
      user: req.user._id,
      startedAt: { $gte: weekStart, $lt: weekEnd }
    });
    
    const distractions = await Distraction.find({
      user: req.user._id,
      createdAt: { $gte: weekStart, $lt: weekEnd }
    });
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const taskScore = totalTasks > 0 ? completedTasks / totalTasks : 0;
    
    const totalFocusMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
    const targetFocusMinutes = 300;
    const focusTimeScore = targetFocusMinutes > 0 && totalFocusMinutes > 0 ? Math.min(totalFocusMinutes / targetFocusMinutes, 1) : 0;
    
    const totalHabits = habits.length;
    const daysInWeek = 7;
    const totalPossibleCompletions = totalHabits * daysInWeek;
    const actualCompletions = stats.reduce((sum, day) => sum + day.habitsCompleted, 0);
    const habitScore = totalPossibleCompletions > 0 ? actualCompletions / totalPossibleCompletions : 0;
    
    const distractionCount = distractions.length;
    const maxAllowedDistractions = 50;
    const distractionScore = maxAllowedDistractions > 0 ? Math.max(0, 1 - (distractionCount / maxAllowedDistractions)) : 0;
    
    const hasAnyData = totalTasks > 0 || sessions.length > 0 || totalHabits > 0;
    
    let productivityScore = 0;
    let weekFocusScore = 0;
    
    if (hasAnyData) {
      const clampedTaskScore = Math.max(0, Math.min(1, isNaN(taskScore) ? 0 : taskScore));
      const clampedFocusTimeScore = Math.max(0, Math.min(1, isNaN(focusTimeScore) ? 0 : focusTimeScore));
      const clampedHabitScore = Math.max(0, Math.min(1, isNaN(habitScore) ? 0 : habitScore));
      const clampedDistractionScore = Math.max(0, Math.min(1, isNaN(distractionScore) ? 0 : distractionScore));
      
      const rawProductivity = (0.4 * clampedTaskScore + 0.3 * clampedFocusTimeScore + 0.2 * clampedHabitScore + 0.1 * clampedDistractionScore) * 100;
      productivityScore = isNaN(rawProductivity) ? 0 : Math.round(Math.max(0, Math.min(100, rawProductivity)));
      
      const avgDistractionScore = sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + Math.max(0, 1 - ((s.distractions || 0) * 0.2)), 0) / sessions.length
        : 0;
      const completedSessions = sessions.filter(s => !s.interrupted).length;
      const sessionCompletionRate = sessions.length > 0 ? completedSessions / sessions.length : 0;
      const clampedAvgDistraction = Math.max(0, Math.min(1, avgDistractionScore || 0));
      const clampedCompletion = Math.max(0, Math.min(1, sessionCompletionRate || 0));
      
      const rawFocus = (0.6 * clampedAvgDistraction + 0.4 * clampedCompletion) * 100;
      weekFocusScore = isNaN(rawFocus) ? 0 : Math.round(Math.max(0, Math.min(100, rawFocus)));
    }
    
    const totals = {
      tasksCompleted: completedTasks,
      habitsCompleted: actualCompletions,
      focusMinutes: totalFocusMinutes,
      sessions: sessions.length,
      distractions: distractionCount,
      focusScore: weekFocusScore,
      productivityScore: productivityScore
    };
    
    res.json({ daily: stats, totals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/monthly', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    
    const monthStart = new Date(year, month - 1, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    const stats = await DailyStats.find({
      user: req.user._id,
      date: { $gte: monthStart, $lte: monthEnd }
    }).sort({ date: 1 });
    
    const tasks = await Task.find({ 
      user: req.user._id,
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    const habits = await Habit.find({ user: req.user._id });
    const sessions = await FocusSession.find({
      user: req.user._id,
      startedAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    const distractions = await Distraction.find({
      user: req.user._id,
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const taskScore = totalTasks > 0 ? completedTasks / totalTasks : 0;
    
    const totalFocusMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
    const targetFocusMinutes = 1200;
    const focusTimeScore = targetFocusMinutes > 0 && totalFocusMinutes > 0 ? Math.min(totalFocusMinutes / targetFocusMinutes, 1) : 0;
    
    const totalHabits = habits.length;
    const daysInMonth = monthEnd.getDate();
    const totalPossibleCompletions = totalHabits * daysInMonth;
    const actualCompletions = stats.reduce((sum, day) => sum + day.habitsCompleted, 0);
    const habitScore = totalPossibleCompletions > 0 ? actualCompletions / totalPossibleCompletions : 0;
    
    const distractionCount = distractions.length;
    const maxAllowedDistractions = 200;
    const distractionScore = maxAllowedDistractions > 0 ? Math.max(0, 1 - (distractionCount / maxAllowedDistractions)) : 0;
    
    const hasAnyData = totalTasks > 0 || sessions.length > 0 || totalHabits > 0;
    
    let productivityScore = 0;
    let monthFocusScore = 0;
    
    if (hasAnyData) {
      const clampedTaskScore = Math.max(0, Math.min(1, taskScore || 0));
      const clampedFocusTimeScore = Math.max(0, Math.min(1, focusTimeScore || 0));
      const clampedHabitScore = Math.max(0, Math.min(1, habitScore || 0));
      const clampedDistractionScore = Math.max(0, Math.min(1, distractionScore || 0));
      
      const rawProductivity = (0.4 * clampedTaskScore + 0.3 * clampedFocusTimeScore + 0.2 * clampedHabitScore + 0.1 * clampedDistractionScore) * 100;
      productivityScore = isNaN(rawProductivity) ? 0 : Math.round(Math.max(0, Math.min(100, rawProductivity)));
      
      const avgDistractionScore = sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + Math.max(0, 1 - ((s.distractions || 0) * 0.2)), 0) / sessions.length
        : 0;
      const completedSessions = sessions.filter(s => !s.interrupted).length;
      const sessionCompletionRate = sessions.length > 0 ? completedSessions / sessions.length : 0;
      const clampedAvgDistraction = Math.max(0, Math.min(1, isNaN(avgDistractionScore) ? 0 : avgDistractionScore));
      const clampedCompletion = Math.max(0, Math.min(1, isNaN(sessionCompletionRate) ? 0 : sessionCompletionRate));
      
      const rawFocus = (0.6 * clampedAvgDistraction + 0.4 * clampedCompletion) * 100;
      monthFocusScore = isNaN(rawFocus) ? 0 : Math.round(Math.max(0, Math.min(100, rawFocus)));
    }
    
    const totals = {
      tasksCompleted: completedTasks,
      habitsCompleted: actualCompletions,
      focusMinutes: totalFocusMinutes,
      sessions: sessions.length,
      distractions: distractionCount,
      focusScore: monthFocusScore,
      productivityScore: productivityScore
    };
    
    res.json({ daily: stats, totals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;