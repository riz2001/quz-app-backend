const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { spawn } = require('child_process');
// Import the Question model
const Question = require('./models/Question');
const Submission=require('./models/Submission');
const userModel = require("./models/users");
const Jobsubmission = require("./models/Jobsubmissions");
const Cquestions= require("./models/Cquestion");
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const CompilerSubmission = require('./models/CompilerSubmission');



const multer = require('multer');
// Initialize the Express app
const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads')); // Serve the uploads folder



mongoose.connect('mongodb+srv://rizwan2001:rizwan2001@cluster0.6ucejfl.mongodb.net/quiz?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => {
    console.log('Connected to MongoDB Atlas');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1); // Exit the app if connection fails
  });





// Sign-In Route
app.post("/signin", async (req, res) => {
  try {
      const { email, password } = req.body;
      const user = await userModel.findOne({ email });

      if (user) {
          // Check if the user is approved
          if (!user.approved) {
              // If the user is not approved, send the specific message
              return res.json({ status: "User is not approved by admin" });
          }

          // Check if the password is correct
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


// Sign-Up Route
app.post("/signup", async (req, res) => {
  try {
      // Destructure fields from request body
      const { email, password, phoneno, rollno, name, admissionno, semester } = req.body; // Include semester
      
      // Hash the password
      const hashedPassword = bcrypt.hashSync(password, 10);

      // Check if the email already exists
      const existingUser = await userModel.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (existingUser) {
          return res.json({ status: "email id already exists" });
      }

      // Create a new user with the provided details
      const newUser = new userModel({
          name,
          admissionno,
          phoneno,
          rollno, // Save rollno in the database
          semester, // Save semester in the database
          email: email.toLowerCase(),
          password: hashedPassword,
          approved: false,
      });

      // Save the new user to the database
      await newUser.save();
      res.json({ status: "success", message: "User registered. Awaiting approval." });
  } catch (error) {
      res.json({ status: "error", message: error.message });
  }
});



// Route to get all unapproved users
app.get("/unapproved-users", async (req, res) => {
  try {
      const users = await userModel.find({ approved: false }); // Fetch only unapproved users
      res.json({ users });
  } catch (error) {
      res.json({ status: "error", message: error.message });
  }
});


// Route to approve a user by ID
app.put("/approve/:id", async (req, res) => {
  try {
      await userModel.findByIdAndUpdate(req.params.id, { approved: true });
      res.json({ message: "User approved successfully" });
  } catch (error) {
      res.json({ status: "error", message: error.message });
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
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
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

    console.log(submissions); // Log submissions to debug population

    if (!submissions.length) {
      return res.status(404).json({ message: 'No submissions found for this week' });
    }

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions', error: error.message });
  }
});

// Fetch user submissions
app.get("/api/submissionsss", async (req, res) => {
  try {
    const userId = req.headers['user-id']; // Retrieve userId from headers

    if (!userId) {
      return res.status(403).json({ status: "error", message: "User not logged in" });
    }

    const submissions = await Submission.find({ userId })
      .select("week score submissionTime")
      .exec();

    if (!submissions.length) {
      return res.status(404).json({ status: "error", message: "No submissions found for this user" });
    }

    res.json({ status: "success", submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ status: "error", message: error.message });
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
  const { userId, timeSlot, date, meetingLink } = req.body; // Add meetingLink to the request body

  try {
    // Find the user
    const user = await userModel.findById(userId);

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

    // If not booked, push the new time slot and meeting link into the timeSlots array
    await userModel.findByIdAndUpdate(userId, {
      $push: {
        timeSlots: { timeSlot, date, meetingLink }, // Store the meetingLink along with timeSlot and date
      },
    });

    res.json({ status: 'success', message: 'Time slot added!' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch distinct months (you may want to adjust this based on your data structure)

app.get('/api/users', async (req, res) => {
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
    res.json({ status: 'error', message: error.message });
  }
});
  
app.get('/api/months', async (req, res) => {
  try {
    const users = await userModel.find({}, { timeSlots: 1 });
    const months = new Set();

    users.forEach(user => {
      user.timeSlots.forEach(slot => {
        const date = new Date(slot.date);
        const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`; // Format: YYYY-MM
        months.add(monthYear);
      });
    });

    res.json(Array.from(months)); // Return unique months as an array
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get time slots for a specific month
app.get('/api/timeslots/:month', async (req, res) => {
  const { month } = req.params; // e.g., "2024-9"
  const [year, monthNumber] = month.split('-').map(Number);

  try {
    const users = await userModel.find({}, { name: 1, email: 1, admissionno: 1, timeSlots: 1 });
    const timeSlots = [];

    users.forEach(user => {
      user.timeSlots.forEach(slot => {
        const slotDate = new Date(slot.date);
        if (slotDate.getFullYear() === year && slotDate.getMonth() + 1 === monthNumber) {
          timeSlots.push({ 
            _id: slot._id, 
            timeSlot: slot.timeSlot, 
            date: slot.date, 
            attended: slot.attended, // Include attended status
            userId: user._id, 
            name: user.name, 
            email: user.email, 
            admissionno: user.admissionno 
          });
        }
      });
    });

    res.json(timeSlots); // Return the time slots along with user details
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Mark a time slot as attended
app.post('/api/markattended', async (req, res) => {
  const { userId, slotId } = req.body;

  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const slot = user.timeSlots.id(slotId);
    if (!slot) {
      return res.status(404).json({ status: 'error', message: 'Slot not found' });
    }

    // Mark the slot as attended
    slot.attended = true;
    await user.save();

    res.json({ status: 'success', message: 'Time slot marked as attended!' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});





// Function to execute the code
const executeCode = (code, language, input, callback) => {
  const fileName = `Main.${language === 'python' ? 'py' : language === 'java' ? 'java' : 'c'}`;
  fs.writeFileSync(fileName, code);

  let command, args;

  switch (language) {
      case 'python':
          // First, try using 'python', then fallback to 'python3' if 'python' fails
          command = 'python'; // Try 'python'
          args = [fileName];

          const pythonProcess = spawn(command, args);

          let pythonOutput = '';
          let pythonError = '';

          pythonProcess.stdin.write(input); // Pass the input to stdin
          pythonProcess.stdin.end(); // Close stdin after input is passed

          pythonProcess.stdout.on('data', (data) => {
              pythonOutput += data.toString();
          });

          pythonProcess.stderr.on('data', (data) => {
              pythonError += data.toString();
          });

          pythonProcess.on('close', (code) => {
              if (code !== 0 || pythonError) {
                  // If 'python' fails, fallback to 'python3'
                  command = 'python'; // Try 'python3'
                  const python3Process = spawn(command, args);

                  let python3Output = '';
                  let python3Error = '';

                  python3Process.stdin.write(input); // Pass the input to stdin
                  python3Process.stdin.end(); // Close stdin after input is passed

                  python3Process.stdout.on('data', (data) => {
                      python3Output += data.toString();
                  });

                  python3Process.stderr.on('data', (data) => {
                      python3Error += data.toString();
                  });

                  python3Process.on('close', (code) => {
                      if (code !== 0 || python3Error) {
                          callback(python3Error || 'Error executing Python code');
                      } else {
                          callback(null, python3Output.trim());
                      }
                  });
              } else {
                  callback(null, pythonOutput.trim());
              }
          });
          return;

      case 'java':
          // First, compile the Java file
          command = 'javac';
          args = [fileName];

          const compileProcess = spawn(command, args);

          compileProcess.on('close', (code) => {
              if (code !== 0) {
                  return callback('Error compiling Java code');
              }

              // If compilation succeeds, execute the compiled Java program
              command = 'java';
              args = ['Main']; // The compiled class file name is 'Main'

              const runProcess = spawn(command, args);

              let output = '';
              let error = '';

              runProcess.stdin.write(input); // Pass the input to stdin
              runProcess.stdin.end(); // Close stdin after input is passed

              runProcess.stdout.on('data', (data) => {
                  output += data.toString();
              });

              runProcess.stderr.on('data', (data) => {
                  error += data.toString();
              });

              runProcess.on('close', (code) => {
                  if (code !== 0 || error) {
                      callback(error || 'Execution error');
                  } else {
                      callback(null, output.trim());
                  }
              });
          });
          return;

      case 'c':
          // Compile the C code
          command = 'gcc';
          args = [fileName, '-o', 'code']; // Output executable will be named 'code.exe'

          const compileCProcess = spawn(command, args);

          compileCProcess.on('close', (compileCode) => {
              if (compileCode !== 0) {
                  return callback('Error compiling C code');
              }

              // Execute the compiled code (use 'code.exe' on Windows)
              const runCProcess = spawn('./code.exe'); // For Windows

              let output = '';
              let error = '';

              runCProcess.stdin.write(input); // Pass input to stdin
              runCProcess.stdin.end(); // Close stdin after input

              runCProcess.stdout.on('data', (data) => {
                  output += data.toString();
              });

              runCProcess.stderr.on('data', (data) => {
                  error += data.toString();
              });

              runCProcess.on('close', (runCode) => {
                  if (runCode !== 0 || error) {
                      callback(error || 'Execution error');
                  } else {
                      callback(null, output.trim());
                  }
              });
          });
          return;

      default:
          return callback('Unsupported language');
  }
};

// Route to run code
app.post('/api/compiler/run', (req, res) => {
  const { code, language, input, expectedOutput } = req.body;

  // Validate input
  if (!code || !language || expectedOutput === undefined) {
      return res.status(400).json({ error: 'Code, language, and expected output are required.' });
  }

  // Run the code with input
  executeCode(code, language, input, (err, output) => {
      if (err) {
          return res.status(500).json({ output: 'Error executing code', error: err });
      }

      // Trim both output and expectedOutput before comparison
      const testPassed = output.trim() === expectedOutput.trim();

      res.json({
          output,
          result: {
              expected: expectedOutput,
              actual: output,
              passed: testPassed,
          },
      });
  });
});


 // Import your model

app.post('/api/cquestions', (req, res) => {
    const { title, description, inputFormat, outputFormat, testCases, difficulty, week } = req.body;

    // Check if all required fields are present
    if (!title || !description || !inputFormat || !outputFormat || !testCases || !difficulty || !week) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    // Create a new question object using the Cquestions model
    const newcQuestions = new Cquestions({
        title,
        description,
        inputFormat,
        outputFormat,
        testCases: testCases.map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput })), // Map each test case
        difficulty,
        week
    });

    // Save the question to the database
    newcQuestions.save()
        .then(() => res.status(201).json({ message: 'Question added successfully!' }))
        .catch(err => res.status(500).json({ error: err.message }));
});




// Get all unique weeks from questions
app.get('/api/cquestions/weeks', async (req, res) => {
  try {
      const weeks = await Cquestions.find().distinct('week');
      res.status(200).json(weeks);
  } catch (error) {
      res.status(500).json({ error: 'Error fetching weeks' });
  }
});

// Get all questions for a specific week
app.get('/api/cquestions/week/:week', async (req, res) => {
  const { week } = req.params;
  try {
      const questions = await Cquestions.find({ week });
      res.status(200).json(questions);
  } catch (error) {
      res.status(500).json({ error: 'Error fetching questions for the week' });
  }
});




app.use(express.json()); // Middleware to parse JSON requests

// CompilerSubmission endpoint

app.post('/api/compilerSubmissions', async (req, res) => {
  const { userId, week, questionId, passedCount, totalTestCases, testResults } = req.body;

  // Validate required fields
  if (!userId || !week || !questionId || passedCount === undefined || !totalTestCases || !testResults) {
      return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
      // Check if the user has already submitted for this week and question
      const existingSubmission = await CompilerSubmission.findOne({ userId, week, questionId });

      if (existingSubmission) {
          return res.status(400).json({ error: 'You have already submitted for this week.' });
      }

      // Get current date and time
      const submissionDate = new Date(); // Get current date and time
      const submissionTime = submissionDate.toLocaleTimeString(); // Get submission time as a string

      // Create new submission object
      const newCompilerSubmission = new CompilerSubmission({
          userId,
          week,
          questionId,
          passedCount,
          totalTestCases,
          testResults,
          submissionDate,  // Add date to submission
          submissionTime,   // Add time to submission
      });

      // Save submission to database
      await newCompilerSubmission.save();
      return res.status(201).json({ message: 'Submission recorded successfully!' });
  } catch (err) {
      console.error('Error saving submission:', err);
      return res.status(500).json({ error: 'Failed to record submission. Please try again later.' });
  }
});


// Submission Route
// Fetch all submissions grouped by week with user details
app.get('/api/compilerSubmissionss', async (req, res) => {
  try {
      const submissions = await CompilerSubmission.find({})
          .populate('userId', 'name admissionno') // Populate name and admissionNo from the User model
      
      // Group submissions by week
      const groupedSubmissions = submissions.reduce((acc, submission) => {
          const week = submission.week;
          if (!acc[week]) {
              acc[week] = [];
          }
          acc[week].push({
              _id: submission._id,
              userId: submission.userId._id,
              name: submission.userId.name,
              admissionno: submission.userId.admissionno,
              passedCount: submission.passedCount,
              totalTestCases: submission.totalTestCases,
          });
          return acc;
      }, {});

      res.json(groupedSubmissions);
  } catch (err) {
      console.error('Error fetching submissions:', err);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Endpoint to fetch submissions for a specific week
// Fetch submissions for a specific week with user details
app.get('/api/compilerSubmissions/week/:week', async (req, res) => {
  const { week } = req.params;
  
  try {
      // Fetch submissions for the given week, populating user details
      const submissions = await CompilerSubmission.find({ week: parseInt(week) })
          .populate('userId', 'name admissionno email'); // Add any other fields as needed
      
      if (!submissions.length) {
          return res.status(404).json({ message: `No submissions found for week ${week}` });
      }

      // Prepare the response data
      const submissionData = submissions.map(submission => ({
          _id: submission._id,
          userId: submission.userId._id,
          name: submission.userId.name,
          admissionno: submission.userId.admissionno,
          email: submission.userId.email,
          passedCount: submission.passedCount,
          totalTestCases: submission.totalTestCases,
          submissionTime: submission.submissionDate
      }));

      // Debug to ensure correct data is fetched
      console.log(`Submissions for Week ${week}:`, submissionData);

      res.json(submissionData);
  } catch (err) {
      console.error('Error fetching submissions for week:', err);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Fetch user compiler submissions
app.get('/api/compiler-submissionsss', async (req, res) => {
  try {
      // Retrieve userId from session storage or request headers
      const userId = req.headers['user-id'] // Adjust this if you're using a different method

      // Fetch submissions for the logged-in user
      const submissions = await CompilerSubmission.find({ userId })
          .select('week submissionDate passedCount totalTestCases') // Select only the fields you need
          .exec();

      // Check if submissions were found
      if (!submissions.length) {
          return res.status(404).json({ message: 'No submissions found for this user' });
      }

      res.json({ status: 'success', submissions });
  } catch (error) {
      console.error('Error fetching compiler submissions:', error);
      res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start the server

app.listen(5050, () => {
  console.log(`Server running on port 5050`);
});
