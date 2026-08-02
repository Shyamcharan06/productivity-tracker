const mongoose = require('mongoose');

const focusSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  duration: {
    type: Number,
    required: true
  },
  plannedDuration: {
    type: Number,
    required: true
  },
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date,
    required: true
  },
  interrupted: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    default: ''
  },
  distractions: {
    type: Number,
    default: 0
  }
});

focusSessionSchema.index({ user: 1, startedAt: -1 });

module.exports = mongoose.model('FocusSession', focusSessionSchema);