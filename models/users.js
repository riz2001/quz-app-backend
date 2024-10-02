const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  admissionno: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
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

