const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  streak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastCompletedDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

habitSchema.index({ user: 1, createdAt: -1 });

habitSchema.methods.completeForToday = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!this.lastCompletedDate) {
    this.streak = 1;
    this.longestStreak = 1;
    this.lastCompletedDate = today;
    return true;
  }
  
  const lastCompleted = new Date(this.lastCompletedDate);
  lastCompleted.setHours(0, 0, 0, 0);
  
  if (lastCompleted.getTime() === today.getTime()) {
    return false;
  }
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (lastCompleted.getTime() === yesterday.getTime()) {
    this.streak += 1;
  } else {
    this.streak = 1;
  }
  
  if (this.streak > this.longestStreak) {
    this.longestStreak = this.streak;
  }
  
  this.lastCompletedDate = today;
  return true;
};

module.exports = mongoose.model('Habit', habitSchema);