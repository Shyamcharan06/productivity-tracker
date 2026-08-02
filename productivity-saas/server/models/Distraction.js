const mongoose = require('mongoose');

const distractionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['auto', 'manual'],
    required: true
  },
  reason: {
    type: String,
    default: ''
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FocusSession',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
distractionSchema.index({ user: 1, createdAt: -1 });
distractionSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Distraction', distractionSchema);