const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
// Import the Question model
const Question = require('./models/Question');
const Submission=require('./models/Submission');
const userModel = require("./models/users");
const Jobsubmission = require("./models/Jobsubmissions");


const multer = require('multer');
// Initialize the Express app
const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads')); // Serve the uploads folder



mongoose.connect('mongodb+srv://rizwan2001:rizwan2001@cluster0.6ucejfl.mongodb.net/quiz?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => {
    console.log('Connected to MongoDB Atlas');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1); // Exit the app if connection fails
  });



  app.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });

        if (user) {
            const passwordValid = bcrypt.compareSync(password, user.password);
            if (passwordValid) {
                const token = jwt.sign({ userId: user._id }, "quiz", { expiresIn: "1d" });

                // Return user details along with the token
                res.json({
                    status: "success",
                    token: token,
                    user: {
                        _id: user._id,
                        name: user.name,
                        admissionno: user.admissionno,
                        email: user.email,
                        timeSlot: user.timeSlot || "", // Use existing timeSlot or empty string
                        date: user.date || "",         // Use existing date or empty string
                    },
                });
            } else {
                res.json({ status: "incorrect password" });
            }
        } else {
            res.json({ status: "invalid email id" });
        }
    } catch (error) {
        res.json({ status: "error", message: error.message });
    }
});


// User Sign-Up
app.post("/signup", async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = bcrypt.hashSync(password, 10);

        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            res.json({ "status": "email id already exists" });
        } else {
            req.body.password = hashedPassword;
            const newUser = new userModel(req.body);
            await newUser.save();
            res.json({ "status": "success" });
        }
    } catch (error) {
        res.json({ "status": "error", "message": error.message });
    }
});

// Correct the route method to GET to fetch weeks
app.get('/api/weeks', async (req, res) => {
  try {
    const weeks = await Question.distinct('week');
    res.json(weeks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


  
// Route to handle storing multiple questions for the same week
app.post('/api/questions', async (req, res) => {
    const questions = req.body;
  
    // Log the incoming request body
    console.log('Incoming questions:', questions);
  
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'No questions provided' });
    }
  
    const week = questions[0].week; 
    const validQuestions = questions.every(q => q.week === week);
  
    if (!validQuestions) {
      return res.status(400).json({ error: 'All questions must be for the same week' });
    }
  
    try {
      // Insert multiple questions into the database
      const result = await Question.insertMany(questions);
      res.status(201).json({ message: 'Questions added successfully!', result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  

// Route to retrieve all questions for a specific week (user)
app.get('/api/questions/:week', async (req, res) => {
  const weekNumber = req.params.week;

  try {
    const questions = await Question.find({ week: weekNumber });
    if (questions.length === 0) {
      return res.status(404).json({ message: 'No questions found for this week' });
    }
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Route to handle quiz submission and evaluate answers
app.post('/api/submit-quiz', async (req, res) => {
  const { week, answers } = req.body;

  // Ensure answers are provided
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ message: 'No answers provided' });
  }

  try {
    // Extract userId from token
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, 'quiz');
    const userId = decoded.userId;

    // Check if the user has already submitted the quiz for this week
    const existingSubmission = await Submission.findOne({ week, userId });
    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this quiz.' });
    }

    // Fetch questions for the specified week
    const questions = await Question.find({ week });
    if (!questions.length) {
      return res.status(404).json({ message: 'No questions found for this week' });
    }

    // Create a map for quick lookup of correct answers
    const correctAnswersMap = questions.reduce((acc, question) => {
      acc[question._id.toString()] = question.answer;
      return acc;
    }, {});

    // Evaluate answers and calculate score
    let score = 0;
    const results = answers.map(answer => {
      const correctAnswer = correctAnswersMap[answer.questionId];
      const isCorrect = correctAnswer && correctAnswer === answer.answer;
      if (isCorrect) {
        score++;
      }
      return {
        questionId: answer.questionId,
        userAnswer: answer.answer,
        correctAnswer,
        isCorrect,
      };
    });

    // Save submission to the database with the userId
    const newSubmission = new Submission({
      week,
      userId,
      answers,
      score,
      submissionTime: new Date(), // Save submission time
    });
    await newSubmission.save();

    // Respond with quiz results
    res.json({
      score,
      totalQuestions: questions.length,
      results,
    });

  } catch (error) {
    console.error('Error processing quiz submission:', error.message);
    res.status(500).json({ message: 'Error processing quiz submission', error: error.message });
  }
});

// Route to get submissions for a specific week
app.get('/api/submissions/:week', async (req, res) => {
  const weekNumber = req.params.week;

  try {
    const submissions = await Submission.find({ week: weekNumber })
      .populate('userId', 'email name admissionno') // Populate user details
      .exec();

    if (!submissions.length) {
      return res.status(404).json({ message: 'No submissions found for this week' });
    }

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions', error: error.message });
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads'); // Directory to store uploaded images
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // File naming convention
  },
});

const upload = multer({ storage });

// Route to handle form submissions
app.post('/api/offcampussubmit-form', upload.single('image'), async (req, res) => {
  const { companyName, salary, applicationLink, location } = req.body;
  const imagePath = req.file ? req.file.path : null; // Get the uploaded image path

  // Check if required fields are present
  if (!companyName || !salary || !imagePath || !applicationLink || !location) {
    return res.status(400).json({ message: 'Company name, salary, image, application link, and location are required.' });
  }

  try {
    const newSubmission = new Jobsubmission({
      companyName,
      salary,
      image: imagePath, // Save image path
      applicationLink, // Save application link
      location, // Save location
    });
    
    await newSubmission.save();
    res.status(201).json({ message: 'Form submitted successfully!', submission: newSubmission });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({ message: 'Error saving submission', error: error.message });
  }
});

// Route to get all submissions
app.get('/api/offcampussubmissions', async (req, res) => {
  try {
    const submissions = await Jobsubmission.find();
    console.log(submissions); // Log submissions to ensure they are fetched
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions', error: error.message });
  }
});


// Route to get user details (name, admission number, email)
// Fetch users with additional timeSlots field
app.get("/api/users", async (req, res) => {
  try {
    const users = await userModel.find({}, { 
      name: 1, 
      admissionno: 1, 
      email: 1, 
      _id: 1, 
      timeSlots: 1 
    });
    res.json(users);
  } catch (error) {
    res.json({ status: "error", message: error.message });
  }
});

// Add time slot with meeting link
app.post('/api/addtimeslot', async (req, res) => {
  const { userId, timeSlot, date, meetingLink } = req.body;

  try {
    // Find the user by userId
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Check if the time slot for the given month is already booked
    const month = new Date(date).getMonth();
    const year = new Date(date).getFullYear();

    const isSlotBooked = user.timeSlots.some(slot => {
      const slotDate = new Date(slot.date);
      return slotDate.getMonth() === month && slotDate.getFullYear() === year;
    });

    if (isSlotBooked) {
      return res.status(400).json({ status: 'error', message: 'Time slot already booked for this month.' });
    }

    // Push the new time slot into the timeSlots array
    user.timeSlots.push({ timeSlot, date, meetingLink });
    await user.save(); // Save the user document

    res.json({ status: 'success', message: 'Time slot added!', slotId: user.timeSlots[user.timeSlots.length - 1]._id }); // Return the new slot ID
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});



  app.get('/api/users/:userId/timeslots', async (req, res) => {
    const { userId } = req.params; // Extract userId from the URL

    try {
      const user = await userModel.findById(userId, { timeSlots: 1 }); // Fetch only the timeSlots field
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      res.json(user.timeSlots); // Send the time slots as the response
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });


// Fetch distinct months (you may want to adjust this based on your data structure)
app.get('/api/months', async (req, res) => {
  try {
    const users = await userModel.find({}, { timeSlots: 1 });
    const months = new Set();

    users.forEach(user => {
      user.timeSlots.forEach(slot => {
        const date = new Date(slot.date);
        const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`;
        months.add(monthYear);
      });
    });

    res.json(Array.from(months)); // Return an array of unique month-year strings
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch time slots for a specific month
app.get('/api/timeslots/:month', async (req, res) => {
  const { month } = req.params; // e.g., "2024-9"
  const [year, monthNumber] = month.split('-').map(Number);

  try {
    const users = await userModel.find({});
    const timeSlots = [];

    users.forEach(user => {
      user.timeSlots.forEach(slot => {
        const slotDate = new Date(slot.date);
        if (slotDate.getFullYear() === year && slotDate.getMonth() + 1 === monthNumber) {
          timeSlots.push({ ...slot, userId: user._id }); // Include userId for marking attended
        }
      });
    });

    res.json(timeSlots);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Mark time slot as attended
app.post('/api/attendSlot', async (req, res) => {
  const { userId, slotId } = req.body;

  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const slot = user.timeSlots.id(slotId); // Find the specific slot by ID
    if (!slot) {
      return res.status(404).json({ status: 'error', message: 'Time slot not found' });
    }

    // Update the slot to mark it as attended (you can add a property to track attended status)
    slot.attended = true; // Example property to track attended status
    await user.save();

    res.json({ status: 'success', message: 'Time slot marked as attended!' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});




  


  
  
  
  
  
  
  
// Start the server

app.listen(5050, () => {
  console.log(`Server running on port 5050`);
});
