const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URL
const uri = process.env.MONGODB_URI;

// You no longer need useNewUrlParser or useUnifiedTopology
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("l2-assignment-06");
    const userCollection = db.collection("user");
    const reliefGoodsCollection = db.collection("reliefgoods");
    const ourRecentWorksCollection = db.collection("ourRecentlyWorks");

    // --- Authentication Routes ---

    app.post("/register", async (req, res) => {
      console.log("--- 2. Request received at /api/v1/register ---");
      console.log("Payload:", req.body);

      try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
          console.log("❌ Error: Missing fields");
          return res
            .status(400)
            .json({ success: false, message: "All fields are required" });
        }

        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          console.log("❌ Error: User exists");
          return res
            .status(400)
            .json({ success: false, message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await userCollection.insertOne({
          name,
          email,
          password: hashedPassword,
          createdAt: new Date(),
        });

        console.log(
          "✅ 3. User Registered Successfully. ID:",
          result.insertedId,
        );
        res.status(201).json({
          success: true,
          message: "Registration successful",
          userId: result.insertedId,
        });
      } catch (err) {
        console.error("🔥 Route Error:", err);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // --- End Authentication Routes ---

    // --- LOGIN ROUTE ---

    app.post("/login", async (req, res) => {
      console.log("1. Login attempt for:", req.body.email);

      try {
        const { email, password } = req.body;

        // 2. Basic Validation: Ensure fields aren't empty
        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });
        }

        // 3. Find user by email
        const user = await userCollection.findOne({ email });
        if (!user) {
          console.log("❌ User not found in DB");
          return res.status(401).json({
            success: false,
            message: "Invalid email or password",
          });
        }

        // 4. Compare hashed password using bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          console.log("❌ Password mismatch");
          return res.status(401).json({
            success: false,
            message: "Invalid email or password",
          });
        }

        // 5. Generate JWT token
        // Ensure JWT_SECRET and EXPIRES_IN are in your .env file
        const token = jwt.sign(
          { email: user.email, name: user.name },
          process.env.JWT_SECRET,
          { expiresIn: process.env.EXPIRES_IN || "1h" },
        );

        // 6. Send Success Response
        console.log("✅ Login successful for:", user.email);
        res.status(200).json({
          success: true,
          message: "Login successful",
          token,
          user: {
            name: user.name,
            email: user.email,
          },
        });
      } catch (error) {
        // This catch block prevents the "j is not defined" or server crash
        console.error("🔥 Login Route Error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
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

    app.put("/relief-goods/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const task = req.body;

      try {
        const filter = { _id: new ObjectId(id) }; // Convert id to ObjectId
        const updateDoc = {
          $set: {
            title: task.title,
            category: task.category,
            item: task.item,
            reason: task.reason,
            amount: task.amount,
            description: task.description,
            priority: task.priority,
          },
        };
        const options = { upsert: true };
        const result = await reliefGoodsCollection.updateOne(
          filter,
          updateDoc,
          options,
        );

        res.json(result);
      } catch (error) {
        console.error("Error updating relief goods:", error);
        res.status(500).json({ message: "Error updating relief goods" });
      }
    });

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
