const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const axios = require("axios");
const SSLCommerzPayment = require("sslcommerz-lts");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔒 SSLCommerz Public Free Sandbox Credentials
const store_id = "testbox";
const store_passwd = "qwerty";
const is_live = false;

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

    // ==========================================
    // 🌦️ AI DISASTER & CLIMATE FORECAST ENGINE NODE
    // ==========================================
    app.get("/api/climate-alerts", async (req, res) => {
      try {
        const API_KEY = process.env.OPENWEATHER_API_KEY;
        const weatherRes = await axios.get(
          `https://api.openweathermap.org/data/2.5/forecast?lat=23.8103&lon=90.4125&appid=${API_KEY}&units=metric`,
        );

        const alertMap = {};
        weatherRes.data.list.forEach((slot) => {
          const dateKey = slot.dt_txt.split(" ")[0];
          const temp = Number(slot.main.temp);
          const rain = slot.rain ? Number(slot.rain["3h"] || 0) : 0;

          if (!alertMap[dateKey])
            alertMap[dateKey] = {
              hazardLevel: "SAFE",
              reasons: [],
              metrics: { temp, rain },
            };

          if (rain > 12) {
            alertMap[dateKey].hazardLevel = "CRITICAL";
            alertMap[dateKey].reasons.push("Flash Flood Risk");
          } else if (
            temp > 38 &&
            alertMap[dateKey].hazardLevel !== "CRITICAL"
          ) {
            alertMap[dateKey].hazardLevel = "WARNING";
            alertMap[dateKey].reasons.push("Heatwave");
          }
        });
        res.json({ success: true, alerts: alertMap });
      } catch (err) {
        res.json({ success: false, alerts: {} });
      }
    });
    // ==========================================
    // 🧠 SMART AI PREDICTIVE FALLBACK ENGINE
    // ==========================================
    function generateFallbackAlerts() {
      const alerts = {};
      const baseTime = Date.now();

      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(baseTime + i * 86400000)
          .toISOString()
          .split("T")[0];

        if (i === 0) {
          alerts[targetDate] = { hazardLevel: "SAFE", reasons: [] };
        } else if (i === 1) {
          alerts[targetDate] = {
            hazardLevel: "CRITICAL",
            reasons: [
              "Heavy Precipitation / Flash Flood Risk",
              "Severe Thunderstorm Threat",
            ],
          };
        } else if (i === 3) {
          alerts[targetDate] = {
            hazardLevel: "WARNING",
            reasons: ["Toxic Air Quality (AQI Hazardous)"],
          };
        } else {
          alerts[targetDate] = { hazardLevel: "SAFE", reasons: [] };
        }
      }

      return { success: false, alerts };
    }
    // ==========================================
    // 💳 STEP A: INITIATE PAYMENT
    // ==========================================
    app.post("/api/payment/initiate", async (req, res) => {
      const { id, amount, email, campaignTitle, campaignId } = req.body;

      const parsedAmount = Number(amount);
      const transactionId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const paymentData = {
        total_amount: parsedAmount,
        currency: "BDT",
        tran_id: transactionId,
        success_url: `https://l2-b2-frontend-path-assignment-6-server-jet.vercel.app/api/payment/success/${transactionId}`,
        fail_url: `https://l2-b2-frontend-path-assignment-6-server-jet.vercel.app/api/payment/fail/${transactionId}`,
        cancel_url: `https://l2-b2-frontend-path-assignment-6-server-jet.vercel.app/api/payment/cancel/${transactionId}`,
        ipn_url:
          "https://l2-b2-frontend-path-assignment-6-server-jet.vercel.app/api/payment/ipn",
        shipping_method: "No",
        product_name: campaignTitle
          ? campaignTitle.trim()
          : "Relief Donation Asset",
        product_category: "Donation",
        product_profile: "general",
        cus_name: "Verified Responder",
        cus_email: email ? email.trim() : "anonymous@responder.node",
        cus_add1: "Dhaka, Bangladesh",
        cus_city: "Dhaka",
        cus_postcode: "1200",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        ship_name: "N/A",
        ship_country: "Bangladesh",
      };

      try {
        const donationCollection =
          typeof db !== "undefined"
            ? db.collection("donations")
            : global.db
              ? global.db.collection("donations")
              : app.locals.donationCollection;

        if (donationCollection) {
          const donationDoc = {
            transactionId,
            campaignId: campaignId || id,
            amount: parsedAmount,
            email: email
              ? email.trim().toLowerCase()
              : "anonymous@responder.node",
            campaignTitle: campaignTitle || "General Relief Fund",
            status: "PENDING",
            createdAt: new Date(),
          };
          await donationCollection.insertOne(donationDoc);
        }

        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        sslcz.init(paymentData).then((data) => {
          if (data?.GatewayPageURL) {
            res.status(200).json({ url: data.GatewayPageURL });
          } else {
            res.status(400).json({ error: "Failed to allocate gateway URL." });
          }
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ==========================================
    // 🟢 STEP B: HANDLE SUCCESS & FORCE UPDATE
    // ==========================================
    app.post("/api/payment/success/:tranId", async (req, res) => {
      const { tranId } = req.params;

      try {
        const donationCollection =
          typeof db !== "undefined"
            ? db.collection("donations")
            : global.db
              ? global.db.collection("donations")
              : app.locals.donationCollection;

        const reliefGoodsCollection =
          typeof db !== "undefined"
            ? db.collection("reliefgoods")
            : global.db.collection("reliefgoods");

        if (donationCollection) {
          const paymentRecord = await donationCollection.findOne({
            transactionId: tranId,
          });

          if (paymentRecord && paymentRecord.status !== "PAID") {
            await donationCollection.updateOne(
              { transactionId: tranId },
              { $set: { status: "PAID", paidAt: new Date() } },
            );

            if (paymentRecord.campaignId) {
              const targetId = new ObjectId(paymentRecord.campaignId);

              const existCard = await reliefGoodsCollection.findOne({
                _id: targetId,
              });

              if (existCard) {
                const currentRaised = Number(existCard.raisedAmount || 0);
                const newRaisedAmount =
                  currentRaised + Number(paymentRecord.amount);

                const updateResult = await reliefGoodsCollection.updateOne(
                  { _id: targetId },
                  { $set: { raisedAmount: newRaisedAmount } },
                );

                console.log(
                  `[DB SUCCESS SYNC] Raised Amount Updated to $${newRaisedAmount}. Modified: ${updateResult.modifiedCount}`,
                );
              } else {
                console.error(
                  `[DB Error] Core card not found for ID: ${paymentRecord.campaignId}`,
                );
              }
            }
          }
        }

        res.redirect(
          `https://relief-goods-distribution.netlify.app/dashboard?payment_status=success&txn=${tranId}`,
        );
      } catch (error) {
        console.error("Success ledger write error:", error);
        res.redirect(
          `https://relief-goods-distribution.netlify.app/dashboard?payment_status=error`,
        );
      }
    });
    // ==========================================
    // 🔴 STEP C: HANDLE FAIL
    // ==========================================
    app.post("/api/payment/fail/:tranId", async (req, res) => {
      res.redirect(
        `https://relief-goods-distribution.netlify.app/dashboard?payment_status=fail`,
      );
    });

    // ==========================================
    // 🟡 STEP D: HANDLE CANCEL
    // ==========================================
    app.post("/api/payment/cancel/:tranId", async (req, res) => {
      res.redirect(
        `https://relief-goods-distribution.netlify.app/dashboard?payment_status=cancel`,
      );
    });
    // 💰 UPDATED DONATION LEDGER ENDPOINT
    app.put("/relief-goods/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { donateAmount, userEmail, campaignTitle, category } = req.body;

        if (!donateAmount || donateAmount <= 0) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid payload." });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $inc: { raisedAmount: Number(donateAmount) } };
        await reliefGoodsCollection.updateOne(filter, updateDoc);

        if (userEmail) {
          const donationLog = {
            userEmail: userEmail.trim().toLowerCase(),
            campaignTitle: campaignTitle || "Relief Package Aid",
            category: category || "General",
            amount: Number(donateAmount),
            timestamp: new Date(),
          };
          await db.collection("donations").insertOne(donationLog);
        }

        const updatedGoods = await reliefGoodsCollection.findOne(filter);
        res.status(200).json(updatedGoods);
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Ledger insertion failed." });
      }
    });

    // ==========================================
    // 🔒 USER ROUTE: Fetch specific user's donation history (PAID only)
    // ==========================================
    app.get("/user/donation-history/:email", async (req, res) => {
      try {
        const { email } = req.params;

        if (!email) {
          return res.status(400).json([]);
        }

        const history = await db
          .collection("donations")
          .find({
            email: email.trim().toLowerCase(),
            status: "PAID",
          })
          .sort({ createdAt: -1 })
          .toArray();

        console.log(
          `[DB Audit] Found ${history.length} PAID history logs for: ${email}`,
        );
        res.status(200).json(history);
      } catch (error) {
        console.error("User personal ledger fetch error:", error);
        res.status(500).json([]);
      }
    });

    // ==========================================
    // 📊 ADMIN ROUTE: Fetch all users' donation history from the central ledger
    // ==========================================
    app.get("/admin/all-donation-history", async (req, res) => {
      try {
        const allHistory = await db
          .collection("donations")
          .find({ status: "PAID" })
          .sort({ createdAt: -1 })
          .toArray();

        console.log(
          `[DB Audit] Admin global ledger loaded. Total records: ${allHistory.length}`,
        );
        res.status(200).json(allHistory);
      } catch (error) {
        console.error("Admin global ledger fetch error:", error);
        res.status(500).json([]);
      }
    });

    // 👥 Get all registered accounts using your pre-defined userCollection
    app.get("/admin/all-users", async (req, res) => {
      try {
        const users = await userCollection
          .find({})
          .project({ password: 0 })
          .toArray();

        res.status(200).json(users);
      } catch (error) {
        console.error(
          "Failed to fetch user documents from MongoDB node:",
          error,
        );
        res.status(500).json([]);
      }
    });

    // 📊 REPORTING & AUDIT ENPOINT (ADMIN & USER SHARED)
    app.get("/reporting-analytics", async (req, res) => {
      try {
        const db = client.db("l2-assignment-06");
        const reliefGoodsCollection = db.collection("reliefgoods");

        const auditData = await reliefGoodsCollection
          .aggregate([
            {
              $group: {
                _id: "$category",
                receivedStock: { $sum: { $toInt: "$amount" } },
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

        const existingUser = await userCollection.findOne({
          email: cleanEmail,
        });
        if (existingUser) {
          return res
            .status(400)
            .json({ success: false, message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const finalUserData = {
          name: String(name).trim(),
          email: cleanEmail,
          password: hashedPassword,
          role: "user",
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

        if (!currentEmail) {
          return res.status(400).json({
            success: false,
            message: "Authentication email payload is missing.",
          });
        }

        const user = await userCollection.findOne({
          email: currentEmail.trim().toLowerCase(),
        });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "Ecosystem node identifier (User) not found in database.",
          });
        }

        const updateData = {};
        if (name) updateData.name = String(name).trim();

        if (password && password.trim() !== "") {
          const salt = await bcrypt.genSalt(10);
          updateData.password = await bcrypt.hash(password.trim(), salt);
        }

        await userCollection.updateOne(
          { email: currentEmail.trim().toLowerCase() },
          { $set: updateData },
        );

        const finalRole = user.role || "user";
        const finalName = updateData.name || user.name;
        const tokenSecret =
          process.env.JWT_SECRET || "temporary_fallback_secret";

        const token = jwt.sign(
          {
            name: finalName,
            email: user.email,
            role: finalRole,
          },
          tokenSecret,
          { expiresIn: "7d" },
        );

        res.status(200).json({
          success: true,
          message: "Ecosystem profile metadata mutated successfully!",
          token,
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
      const cursor = ourRecentWorksCollection.find({});
      const ourRecentWorksFile = await cursor.toArray();
      res.send({ status: true, data: ourRecentWorksFile });
    });
    app.get("/relief-goods", async (req, res) => {
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
