const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'dark'
    },
    defaultFocusDuration: {
      type: Number,
      default: 25
    },
    blacklistedSites: {
      type: [String],
      default: []
    }
  },

  scores: {
    focus: { type: Number, default: 0 },
    productivity: { type: Number, default: 0 },
    lastFocusReset: { type: Date, default: Date.now },
    lastProductivityReset: { type: Date, default: Date.now }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.checkAndResetScores = function() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const lastFocus = new Date(this.scores.lastFocusReset);
  lastFocus.setHours(0, 0, 0, 0);
  
  const lastProd = new Date(this.scores.lastProductivityReset);
  lastProd.setHours(0, 0, 0, 0);
  
  if (lastFocus.getTime() !== now.getTime()) {
    this.scores.focus = 0;
    this.scores.lastFocusReset = now;
  }
  
  const lastProdWeek = this.getWeekNumber(lastProd);
  const currentWeek = this.getWeekNumber(now);
  
  if (lastProdWeek !== currentWeek) {
    this.scores.productivity = 0;
    this.scores.lastProductivityReset = now;
  }
};

userSchema.methods.getWeekNumber = function(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

userSchema.methods.calculateFocusScore = async function() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  
  const FocusSession = require('./FocusSession');
  const sessions = await FocusSession.find({
    user: this._id,
    startedAt: { $gte: dayStart }
  });
  
  if (sessions.length === 0) {
    return 50;
  }
  
  let baseScore = 50;
  
  const totalMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
  const timeScore = Math.min(30, (totalMinutes / 120) * 30);
  
  const completedSessions = sessions.filter(s => !s.interrupted).length;
  const consistencyScore = (completedSessions / sessions.length) * 10;
  
  const totalDistractions = sessions.reduce((sum, s) => sum + (s.distractions || 0), 0);
  const distractionPenalty = totalDistractions * 2;
  
  const interruptPenalty = (sessions.length - completedSessions) * 5;
  
  const tinySessionPenalty = sessions.filter(s => s.duration < 300).length * 3;
  
  const score = baseScore + timeScore + consistencyScore - distractionPenalty - interruptPenalty - tinySessionPenalty;
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

userSchema.methods.calculateProductivityScore = async function() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const Task = require('./Task');
  const Habit = require('./Habit');
  const FocusSession = require('./FocusSession');
  const Distraction = require('./Distraction');
  
  const [tasks, habits, sessions, distractions] = await Promise.all([
    Task.find({ user: this._id, createdAt: { $gte: weekStart } }),
    Habit.find({ user: this._id }),
    FocusSession.find({ user: this._id, startedAt: { $gte: weekStart } }),
    Distraction.find({ user: this._id, createdAt: { $gte: weekStart } })
  ]);
  
  const hasAnyData = tasks.length > 0 || sessions.length > 0 || habits.length > 0;
  
  if (!hasAnyData) {
    return 0;
  }
  
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const taskScore = totalTasks > 0 ? completedTasks / totalTasks : 0;
  
  const totalFocusMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
  const targetFocusMinutes = 300;
  const focusTimeScore = targetFocusMinutes > 0 && totalFocusMinutes > 0 ? Math.min(totalFocusMinutes / targetFocusMinutes, 1) : 0;
  
  const totalHabits = habits.length;
  const habitsCompletedThisWeek = habits.filter(h => {
    if (!h.lastCompletedDate) return false;
    const lastCompleted = new Date(h.lastCompletedDate);
    return lastCompleted >= weekStart;
  }).length;
  const habitScore = totalHabits > 0 ? habitsCompletedThisWeek / totalHabits : 0;
  
  const distractionCount = distractions.length;
  const maxAllowedDistractions = 20;
  const distractionScore = maxAllowedDistractions > 0 ? Math.max(0, 1 - (distractionCount / maxAllowedDistractions)) : 0;
  
  const clampedTaskScore = Math.max(0, Math.min(1, isNaN(taskScore) ? 0 : taskScore));
  const clampedFocusTimeScore = Math.max(0, Math.min(1, isNaN(focusTimeScore) ? 0 : focusTimeScore));
  const clampedHabitScore = Math.max(0, Math.min(1, isNaN(habitScore) ? 0 : habitScore));
  const clampedDistractionScore = Math.max(0, Math.min(1, isNaN(distractionScore) ? 0 : distractionScore));
  
  const rawScore = (0.4 * clampedTaskScore + 0.3 * clampedFocusTimeScore + 0.2 * clampedHabitScore + 0.1 * clampedDistractionScore) * 100;
  const finalScore = isNaN(rawScore) ? 0 : Math.round(Math.max(0, Math.min(100, rawScore)));
  
  return finalScore;
};

module.exports = mongoose.model('User', userSchema);