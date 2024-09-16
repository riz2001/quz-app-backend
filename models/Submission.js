const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  week: {
    type: Number,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  answers: [
    {
      questionId: mongoose.Schema.Types.ObjectId,
      answer: String,
    },
  ],
  score: {
    type: Number,
    required: true,
  },
  submissionTime: {
    type: Date,
    default: Date.now,
  }
 
});

module.exports = mongoose.model('Submission', submissionSchema);
