const mongoose = require('mongoose');

const jobsubmissionSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  salary: { type: Number, required: true },
  image: { type: String, required: true }, // Store image path
  applicationLink: { type: String, required: true }, // Store application link
  location: { type: String, required: true }, // Store location
});

const Jobsubmission = mongoose.model('Jobsubmission', jobsubmissionSchema); // Change the model name to Jobsubmission
module.exports = Jobsubmission; // Ensure you export the correct model
