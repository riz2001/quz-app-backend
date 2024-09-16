const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
// Import the Question model
const Question = require('./models/Question');
const Submission=require('./models/Submission');
const userModel = require("./models/users");
// Initialize the Express app
const app = express();
app.use(express.json());
app.use(cors());



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
                res.json({ "status": "success", "token": token });
            } else {
                res.json({ "status": "incorrect password" });
            }
        } else {
            res.json({ "status": "invalid email id" });
        }
    } catch (error) {
        res.json({ "status": "error", "message": error.message });
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

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ message: 'No answers provided' });
  }

  try {
    // Extract userId from token
    const token = req.headers.token;
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, 'quiz');
    const userId = decoded.userId;

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

    // Evaluate answers
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
      userId, // Store the user ID with the submission
      answers
    });
    await newSubmission.save();

    res.json({
      score,
      totalQuestions: questions.length,
      results, // Include detailed results
    });
  } catch (error) {
    console.error('Error processing quiz submission:', error);
    res.status(500).json({ message: 'Error processing quiz submission', error: error.message });
  }
});

// Start the server

app.listen(5050, () => {
  console.log(`Server running on port 5000`);
});
