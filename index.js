// server/index.js
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const axios = require("axios");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const User = require("./models/User");
const Customer = require('./models/Customer');
const Campaign = require("./models/Campaign");
const CommunicationLog = require("./models/CommunicationLog");

const mongoose = require("mongoose");

require('dotenv').config();
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));


app.get('/', (req, res) => {
  res.send('Hello World');
});

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,   // <-- required for code exchange
  "postmessage"           // used for installed apps / JS frontend
);

app.post("/auth/google", async (req, res) => {
  const { code } = req.body;

  try {
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // Check if user already exists
    let user = await User.findOne({ email: payload.email });

    if (!user) {
      // Create new user
      user = new User({
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      });
      await user.save();
      console.log("✅ New user saved:", payload.email);
    } else {
      console.log("ℹ️ User already exists:", payload.email);
    }

    res.json(user);
    // res.json(payload);
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(401).json({ error: "Invalid token" });
  }
});


// Middleware to verify user is logged in
function verifyAuth(req, res, next) {
  // Implement your auth check here (e.g., JWT token verification)
  // For demo, allow all:
  next();
}

app.post('/customers', verifyAuth, async (req, res) => {
  try {
    const data = req.body;

    // Accept array or single object
    const customers = Array.isArray(data) ? data : [data];

    let added = 0;
    let skipped = 0;
    let errors = [];

    for (const customer of customers) {
      const { name, email, phone, address, spend, visits, lastActive, addedBy } = customer;

      if (!name || !email) {
        errors.push({ customer, error: "Name and email are required" });
        continue;
      }

      const exists = await Customer.findOne({ email: email.toLowerCase(), addedBy:addedBy.toLowerCase() });
      if (exists) {
        skipped++;
        continue;
      }

      const newCustomer = new Customer({
        name,
        email,
        phone,
        address,
        spend,
        visits,
        lastActive,
        addedBy
      });

      try {
        await newCustomer.save();
        added++;
      } catch (saveErr) {
        errors.push({ customer, error: saveErr.message });
      }
    }

    res.status(201).json({
      message: `${added} customers added, ${skipped} skipped`,
      errors,
    });
  } catch (error) {
    console.error("Error creating customers:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



// Multer config
const upload = multer({ dest: "uploads/" });

router.post("/upload-csv", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const customers = [];
  const addedBy = req.body.addedBy; // 👈 Get the addedBy from frontend form field

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      customers.push(row);
    })
    .on("end", async () => {
      try {
        let added = 0,
          skipped = 0;

        for (const data of customers) {
          if (!data.email || !data.name) {
            skipped++;
            continue;
          }

          const exists = await Customer.findOne({ email: data.email, addedBy }); // optional: filter per user
          if (exists) {
            skipped++;
            continue;
          }

          await Customer.create({
            name: data.name,
            email: data.email,
            phone: data.phone || "",
            total_spent: data.total_spent || 0,
            last_active: data.last_active ? new Date(data.last_active) : null,
            visits: data.visits || 0,
            addedBy, // 👈 attach addedBy manually
          });
          added++;
        }

        fs.unlinkSync(filePath); // remove temp file
        res.json({ message: "Upload complete", added, skipped });
      } catch (error) {
        fs.unlinkSync(filePath);
        console.error(error);
        res.status(500).json({ error: "Error processing CSV" });
      }
    });
});


function buildMongoQuery(rules, logic) {
  const queryConditions = rules.map(rule => {
    const condition = {};
    const val = isNaN(rule.value) ? rule.value : Number(rule.value);

    switch (rule.operator) {
      case ">": condition[rule.field] = { $gt: val }; break;
      case "<": condition[rule.field] = { $lt: val }; break;
      case ">=": condition[rule.field] = { $gte: val }; break;
      case "<=": condition[rule.field] = { $lte: val }; break;
      case "==": condition[rule.field] = val; break;
      case "!=": condition[rule.field] = { $ne: val }; break;
    }

    return condition;
  });

  return logic === "OR" ? { $or: queryConditions } : { $and: queryConditions };
}

app.post("/campaigns/preview", async (req, res) => {
  try {
    const { rules, logic, addedBy } = req.body; // get addedBy from frontend

    const userFilter = { addedBy }; // filter customers added by this user
    const mongoQuery = buildMongoQuery(rules, logic);

    // Combine userFilter and mongoQuery with $and
    const combinedQuery = { $and: [userFilter, mongoQuery] };

    const audienceSize = await Customer.countDocuments(combinedQuery);
    res.json({ audienceSize });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ error: "Preview failed" });
  }
});


app.post("/campaigns", async (req, res) => {
  try {
    const { name, rules, logic, addedBy } = req.body;

    const userFilter = { addedBy };
    const mongoQuery = buildMongoQuery(rules, logic);
    const combinedQuery = { $and: [userFilter, mongoQuery] };

    const audience = await Customer.find(combinedQuery);
    const audienceSize = audience.length;

    const campaign = new Campaign({ name, rules, logic, audienceSize, createdBy: addedBy });
    await campaign.save();

    // Save communication logs and send messages
    for (const customer of audience) {
      const personalizedMsg = `Hi ${customer.name}, here’s 10% off on your next order!`;

      const log = new CommunicationLog({
        customerId: customer._id,
        customerName: customer.name,
        customerEmail: customer.email,
        campaignId: campaign._id,
        message: personalizedMsg,
        status: "PENDING"
      });
      await log.save();

      // Call dummy vendor API
      axios.post("http://localhost:5000/vendor/send", {
        logId: log._id,
        message: personalizedMsg,
        customerEmail: customer.email
      });
    }

    res.status(201).json(campaign);
  } catch (error) {
    console.error("Save error:", error);
    res.status(500).json({ error: "Save failed" });
  }
});

// Simulates 90% success, 10% failure
app.post("/vendor/send", async (req, res) => {
  const { logId, message, customerEmail } = req.body;

  // Randomly determine delivery success/failure
  const success = Math.random() < 0.9;
  const status = success ? "SENT" : "FAILED";

  // Simulate delay
  setTimeout(() => {
    // Call your delivery receipt API
    axios.post("http://localhost:5000/delivery/receipt", {
      logId,
      status
    });
  }, 1000 + Math.random() * 2000); // Simulate 1-3s delay

  res.json({ status: "Delivery initiated" });
});

app.post("/delivery/receipt", async (req, res) => {
  try {
    const { logId, status } = req.body;

    await CommunicationLog.findByIdAndUpdate(logId, { status });
    res.json({ message: "Status updated" });
  } catch (err) {
    console.error("Receipt error:", err);
    res.status(500).json({ error: "Failed to update delivery status" });
  }
});



app.get("/campaigns", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const campaigns = await Campaign.find({ createdBy: email }).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
});

app.get("/campaigns/:campaignId/logs", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const logs = await CommunicationLog.find({ campaignId }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (error) {
    console.error("Fetch logs error:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});





app.use('/api', router);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
