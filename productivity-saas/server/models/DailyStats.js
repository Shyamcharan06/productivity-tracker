const mongoose = require('mongoose');

const dailyStatsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  tasksCompleted: { type: Number, default: 0 },
  habitsCompleted: { type: Number, default: 0 },
  focusMinutes: { type: Number, default: 0 },
  sessions: { type: Number, default: 0 },
  distractions: { type: Number, default: 0 },
  focusScore: { type: Number, default: 0 },
  productivityScore: { type: Number, default: 0 }
});

dailyStatsSchema.index({ user: 1, date: -1 });

dailyStatsSchema.statics.getTodayStats = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let stats = await this.findOne({ user: userId, date: today });
  if (!stats) {
    stats = new this({ user: userId, date: today });
    await stats.save();
  }
  return stats;
};

module.exports = mongoose.model('DailyStats', dailyStatsSchema);