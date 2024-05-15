const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");

require("dotenv").config();
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URL
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("l2-assignment-06");
    const collection = db.collection("user");
    const reliefGoodsCollection = db.collection("reliefgoods");
    const ourRecentWorksCollection = db.collection("ourRecentlyWorks");

    // User Registration
    app.post("/api/v1/register", async (req, res) => {
      const { name, email, password } = req.body;

      // Check if email already exists
      const existingUser = await collection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user into the database
      await collection.insertOne({ name, email, password: hashedPassword });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
      });
    });

    // User Login
    app.post("/api/v1/login", async (req, res) => {
      const { email, password } = req.body;

      // Find user by email
      const user = await collection.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Compare hashed password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate JWT token
      const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
        expiresIn: process.env.EXPIRES_IN,
      });

      res.json({
        success: true,
        message: "Login successful",
        token,
      });
    });

    // ======================================================
    // WRITE YOUR CODE HERE

    app.get("/our-recent-works", async (req, res) => {
      // let query = {};
      // if (req.query.priority) {
      //   query.priority = req.query.priority;
      // }
      const cursor = ourRecentWorksCollection.find({});
      const ourRecentWorksFile = await cursor.toArray();
      res.send({ status: true, data: ourRecentWorksFile });
    });
    app.get("/relief-goods", async (req, res) => {
      // let query = {};
      // if (req.query.priority) {
      //   query.priority = req.query.priority;
      // }
      const cursor = reliefGoodsCollection.find({});
      const reliefGoodsFile = await cursor.toArray();
      res.send({ status: true, data: reliefGoodsFile });
    });
    app.post("/relief-goods", async (req, res) => {
      const reliefGoods = req.body;
      const result = await reliefGoodsCollection.insertOne(reliefGoods);
      res.send(result);
    });

    app.get("/relief-goods/:id", async (req, res) => {
      const id = req.params.id;
      console.log("getting specific service", id);
      const nid = new ObjectId(id);
      const query = { _id: nid };
      const result = await reliefGoodsCollection.findOne(query);
      console.log(result);
      res.send(result);
    });

    app.delete("/relief-goods/:id", async (req, res) => {
      const id = req.params.id;
      const delId = new ObjectId(id);
      const delOne = { _id: delId };
      const result = await reliefGoodsCollection.deleteOne(delOne);
      // console.log(result);
      res.send(result);
    });

    // ==============================================================

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } finally {
  }
}

run().catch(console.dir);

// Test route
app.get("/", (req, res) => {
  const serverStatus = {
    message: "Server is running smoothly",
    timestamp: new Date(),
  };
  res.json(serverStatus);
});
