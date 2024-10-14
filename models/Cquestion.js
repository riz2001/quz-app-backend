const mongoose = require('mongoose');
const cquestionsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    inputFormat: { type: String, required: true },
    outputFormat: { type: String, required: true },
    testCases: [{ input: String, expectedOutput: String }], // Test cases structured as objects
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    week: { type: Number, required: true }
  });
  
  // Question Model
  const Cquestions = mongoose.model('Cquestions', cquestionsSchema);
  module.exports = Cquestions;