const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  admissionno: { type: String, required: true },
  semester: { type: String, required: true },
  phoneno: { type: String, required: true }, // Added phone number
  rollno: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  approved: { type: Boolean, default: false },
  timeSlots: [
    {
      timeSlot: { type: String, required: true },
      date: { type: Date, required: true },
      meetingLink: String
     
    },
  ],
});

const userModel = mongoose.model('users', userSchema);
module.exports = userModel;

