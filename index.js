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

    // 📊 REPORTING & AUDIT ENPOINT (ADMIN & USER SHARED)
    app.get("/reporting-analytics", async (req, res) => {
      try {
        const db = client.db("l2-assignment-06");
        const reliefGoodsCollection = db.collection("reliefgoods");

        // মঙ্গোডিবি এগ্রিগেশন পাইপলাইন দিয়ে ক্যাটাগরি অনুযায়ী ডাটা প্রসেসিং
        const auditData = await reliefGoodsCollection
          .aggregate([
            {
              $group: {
                _id: "$category", // ক্যাটাগরি বা ক্যাম্প নেম অনুযায়ী গ্রুপ করা
                receivedStock: { $sum: { $toInt: "$amount" } },
                // ডিস্ট্রিবিউটেড এবং ড্যামেজড স্টকের ডাইনামিক কন্ডিশনাল ক্যালকুলেশন
                distributedStock: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", "Distributed"] },
                      { $toInt: "$amount" },
                      { $multiply: [{ $toInt: "$amount" }, 0.8] },
                    ],
                  },
                },
                damagedStock: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", "Damaged"] },
                      { $toInt: "$amount" },
                      { $multiply: [{ $toInt: "$amount" }, 0.02] },
                    ],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                camp: { $ifNull: ["$_id", "General Sector"] },
                receivedStock: { $round: ["$receivedStock", 0] },
                distributedStock: { $round: ["$distributedStock", 0] },
                damagedStock: { $round: ["$damagedStock", 0] },
              },
            },
          ])
          .toArray();

        res.status(200).json(auditData);
      } catch (error) {
        console.error("Reporting API Server Error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to generate report matrix",
        });
      }
    });

    app.post("/register", async (req, res) => {
      try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
          return res
            .status(400)
            .json({ success: false, message: "All fields are required" });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        // ডুপ্লিকেট ইউজার চেক
        const existingUser = await userCollection.findOne({
          email: cleanEmail,
        });
        if (existingUser) {
          return res
            .status(400)
            .json({ success: false, message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // 🎯 গ্যারান্টিড ডাটা স্ট্রাকচার (role: "user" সহ)
        const finalUserData = {
          name: String(name).trim(),
          email: cleanEmail,
          password: hashedPassword,
          role: "user", // এটিই তোমার 'user' কালেকশনে জমা হবে
          createdAt: new Date(),
        };

        const result = await userCollection.insertOne(finalUserData);

        const secret = process.env.JWT_SECRET || "temporary_fallback_secret";
        const token = jwt.sign(
          { email: finalUserData.email, role: finalUserData.role },
          secret,
          { expiresIn: "7d" },
        );

        res.status(201).json({
          success: true,
          message: "Registration successful",
          token,
          user: {
            name: finalUserData.name,
            email: finalUserData.email,
            role: finalUserData.role,
          },
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // ==========================================
    // 🔑 2. USER LOGIN ROUTE
    // ==========================================
    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        const cleanEmail = String(email).trim().toLowerCase();

        const user = await userCollection.findOne({ email: cleanEmail });
        if (!user) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid credentials" });
        }

        // 🎯 প্রো-ট্রিক: ডাটাবেজে রোল ব্যাকআপ হিসেবে না থাকলেও টোকেনে রোল পাঠানোর ব্যবস্থা
        const userRole = user.role || "user";

        const secret = process.env.JWT_SECRET || "temporary_fallback_secret";
        const token = jwt.sign({ email: user.email, role: userRole }, secret, {
          expiresIn: "7d",
        });

        res.json({
          success: true,
          message: "Login successful",
          token,
          user: {
            name: user.name,
            email: user.email,
            role: userRole,
          },
        });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // 🔄 PROFILE UPDATE ENDPOINT (DIRECTLY CONNECTED WITH USERCOLLECTION)
    app.put("/update-profile", async (req, res) => {
      try {
        const { name, currentEmail, password } = req.body;

        // ১. ভ্যালিডেশন চেক
        if (!currentEmail) {
          return res.status(400).json({
            success: false,
            message: "Authentication email payload is missing.",
          });
        }

        // ২. ডাটাবেজ থেকে নির্দিষ্ট ইউজারকে খুঁজে বের করা
        const user = await userCollection.findOne({
          email: currentEmail.trim().toLowerCase(),
        });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "Ecosystem node identifier (User) not found in database.",
          });
        }

        // ৩. আপডেটের জন্য ডাইনামিক অবজেক্ট তৈরি
        const updateData = {};
        if (name) updateData.name = String(name).trim();

        // ইউজার যদি নতুন পাসওয়ার্ড ইনপুট দেয়, তবেই সেটি হ্যাশ করে অবজেক্টে ঢুকবে
        if (password && password.trim() !== "") {
          const salt = await bcrypt.genSalt(10);
          updateData.password = await bcrypt.hash(password.trim(), salt);
        }

        // ৪. মঙ্গোডিবি userCollection-এ ডাটা আপডেট করা
        await userCollection.updateOne(
          { email: currentEmail.trim().toLowerCase() },
          { $set: updateData },
        );

        // 🎯 ৫. নতুন মেটাডাটা নিয়ে সিকিউর JWT Token রি-জেনারেট করা (যাতে ফ্রন্টএন্ড লাইভ সিঙ্ক হয়)
        const finalRole = user.role || "user";
        const finalName = updateData.name || user.name;
        const tokenSecret =
          process.env.JWT_SECRET || "temporary_fallback_secret"; // তোমার ডট-এনভ ফাইলের সিক্রেট কি

        const token = jwt.sign(
          {
            name: finalName,
            email: user.email,
            role: finalRole,
          },
          tokenSecret,
          { expiresIn: "7d" }, // ৭ দিনের ভ্যালিডিটি সেশন
        );

        // ৬. সাকসেস রেসপন্স পাঠানো
        res.status(200).json({
          success: true,
          message: "Ecosystem profile metadata mutated successfully!",
          token, // এই নতুন টোকেনটি ফ্রন্টএন্ড রিসিভ করে লোকাল স্টোরেজে রিপ্লেস করবে
          user: {
            name: finalName,
            email: user.email,
            role: finalRole,
          },
        });
      } catch (error) {
        console.error("Critical Profile Mutation Crash:", error);
        res.status(500).json({
          success: false,
          message: "Internal gateway crash during profile token adjustment.",
        });
      }
    });

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
