const mongoose = require('mongoose');

// Define the individual question schema
const questionItemSchema = new mongoose.Schema({
  question: String,
  options: [String],
  answer: String,
});

// Main schema that stores questions for each week
const questionSchema = new mongoose.Schema({
  week: { type: Number, required: true }, // Week number
  question: String,  // question field should be correctly defined here
  options: [String],
  answer: String,
  availableFrom: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Question', questionSchema);
