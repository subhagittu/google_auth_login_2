require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const cron       = require('node-cron');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const session    = require('express-session');
const { MongoStore } = require('connect-mongo');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app      = express();
const PORT     = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/todoapp';

// ─── EMAIL TRANSPORTER ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: 'https://your-app.vercel.app', // replace with your actual Vercel URL
  credentials: true
}));
app.use(express.json());

// Public config endpoint
app.get('/api/config', (req, res) => {
  res.json({ GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID });
});


// Session must come BEFORE static so API routes can read it
app.use(session({
  secret: process.env.SESSION_SECRET || 'taskflow-fallback-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
  }
}));

// ─── MONGOOSE SCHEMAS ────────────────────────────────────────────────────────

// ── Profiles (users) ──
const profileSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: false },
  googleId:     { type: String, trim: true, sparse: true, unique: true },
  displayName:  { type: String, trim: true, default: '' },
  profilePicture: { type: String, default: null },
  createdAt:    { type: Date, default: Date.now },
});

const Profile = mongoose.model('Profile', profileSchema);

// ── Deleted Profiles ──
const deletedProfileSchema = new mongoose.Schema({
  originalId:   { type: mongoose.Schema.Types.ObjectId },
  username:     { type: String },
  email:        { type: String },
  displayName:  { type: String },
  deletedAt:    { type: Date, default: Date.now },
});
const DeletedProfile = mongoose.model('DeletedProfile', deletedProfileSchema);

// ── OTPs (for registration verification) ──
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 } // automatically deletes document after 5 minutes (300 seconds)
});
const Otp = mongoose.model('Otp', otpSchema);

// ── Tasks ──
const taskSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
  title:        { type: String, required: true, trim: true },
  description:  { type: String, trim: true, default: '' },
  deadline:     { type: Date, default: null },
  deadlineText: { type: String, default: '' },
  priority:     { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: {
    type: String,
    enum: ['todo', 'doing', 'completed', 'deleted', 'wontdo', 'expired'],
    default: 'todo'
  },
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now },
  movedAt:        { type: Date, default: null },
  originalStatus: { type: String, default: null },
});

const Task = mongoose.model('Task', taskSchema);

// ─── DB CONNECTION ────────────────────────────────────────────────────────────

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB at localhost:27018/todoapp');
    await Task.collection.createIndex({ userId: 1, status: 1 });
    await Task.collection.createIndex({ userId: 1, deadline: 1 });
    await Task.collection.createIndex({ userId: 1, createdAt: -1 });
    await Profile.collection.createIndex({ username: 1 }, { unique: true });
    await Profile.collection.createIndex({ email: 1 },    { unique: true });
    // Note: Mongoose `expires` handles the TTL index for Otp schema automatically when we use .save(), but we can ensure it here if we want.
    console.log('✅ Indexes ensured');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

// ─── OTP COPY PAGE ────────────────────────────────────────────────────────────
// Auto-copies OTP on page load; linked from email "Copy Code" button
app.get('/otp-copy', (req, res) => {
  const otp = (req.query.code || '').replace(/\D/g, '').substring(0, 6);
  if (!otp) return res.status(400).send('Invalid OTP link.');
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TaskFlow - OTP Copied</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .card {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; padding: 48px 40px; text-align: center;
      max-width: 420px; width: 90%; backdrop-filter: blur(20px);
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
    @keyframes popIn  { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }
    .check { font-size: 4rem; animation: popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; display: block; }
    .title { color: #10b981; font-size: 1.8rem; font-weight: 800; margin: 12px 0 6px; }
    .sub   { color: rgba(255,255,255,0.55); font-size: 0.9rem; margin-bottom: 28px; }
    .otp-box {
      font-size: 2.6rem; font-weight: 800; letter-spacing: 10px; color: #fff;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(16,185,129,0.4);
      border-radius: 12px; padding: 14px 24px; margin-bottom: 24px;
      display: inline-block;
    }
    .copy-btn {
      padding: 14px 32px; background: #7c6ff7; color: #fff;
      border: none; border-radius: 12px; font-size: 1rem; font-weight: 700;
      cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(124,111,247,0.4);
    }
    .copy-btn:hover { background: #5e4de3; transform: translateY(-2px); }
    .copy-btn.done  { background: #10b981; box-shadow: 0 4px 15px rgba(16,185,129,0.4); }
    .close-hint { color: rgba(255,255,255,0.3); font-size: 0.78rem; margin-top: 20px; }
    #status { font-size: 0.85rem; margin-top: 14px; min-height: 20px; }
    .ok  { color: #10b981; }
    .err { color: #f87171; }
  </style>
</head>
<body>
  <div class="card">
    <span class="check" id="icon">📋</span>
    <div class="title" id="title">Copying...</div>
    <div class="sub" id="sub">Please wait</div>
    <div class="otp-box">${otp}</div><br/>
    <button class="copy-btn" id="copy-btn" onclick="manualCopy()">Copy Again</button>
    <div id="status"></div>
    <div class="close-hint" id="close-hint"></div>
  </div>
  <script>
    const OTP = '${otp}';

    async function doCopy() {
      try {
        await navigator.clipboard.writeText(OTP);
        return true;
      } catch(e) {
        try {
          const ta = document.createElement('textarea');
          ta.value = OTP; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
          document.body.appendChild(ta); ta.focus(); ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch(e2) { return false; }
      }
    }

    async function manualCopy() {
      const btn = document.getElementById('copy-btn');
      const ok = await doCopy();
      if (ok) {
        btn.textContent = 'Copied! ✓';
        btn.classList.add('done');
        setTimeout(() => { btn.textContent = 'Copy Again'; btn.classList.remove('done'); }, 3000);
      }
    }

    // Auto-copy on load
    window.addEventListener('load', async () => {
      const ok = await doCopy();
      const icon  = document.getElementById('icon');
      const title = document.getElementById('title');
      const sub   = document.getElementById('sub');
      const hint  = document.getElementById('close-hint');
      const btn   = document.getElementById('copy-btn');

      if (ok) {
        icon.textContent  = '✅';
        title.textContent = 'Copied!';
        title.style.color = '#10b981';
        sub.textContent   = 'OTP copied to your clipboard automatically.';
        btn.textContent   = 'Copy Again';
        btn.classList.add('done');
        hint.textContent  = 'You can close this tab and paste the code in TaskFlow.';
        // Try to auto-close after 3 seconds
        setTimeout(() => {
          try { window.close(); } catch(e) {}
        }, 3000);
      } else {
        icon.textContent  = '⚠️';
        title.textContent = 'Click to Copy';
        title.style.color = '#f59e0b';
        sub.textContent   = 'Auto-copy was blocked. Click the button below.';
        hint.textContent  = 'Close this tab after copying.';
      }
    });
  </script>
</body>
</html>`);
});

// ─── CRON JOB ─────────────────────────────────────────────────────────────────

cron.schedule('* * * * *', async () => {
  const now = new Date();
  try {
    const overdue = await Task.find({
      status: { $in: ['todo', 'doing'] },
      deadline: { $ne: null, $lt: now }
    });
    for (const task of overdue) {
      task.originalStatus = task.status;
      task.status    = 'expired';
      task.movedAt   = now;
      task.updatedAt = now;
      await task.save();
    }
    if (overdue.length > 0) console.log(`⏰ Cron: Moved ${overdue.length} task(s) to expired`);
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  next();
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

function statusToCollection(status) {
  const map = {
    todo: 'Will Do', doing: 'Doing', completed: 'Completed',
    deleted: 'Deleted', wontdo: 'Will Not Do', expired: 'Expired'
  };
  return map[status] || status;
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

// Delete Account
app.post('/api/auth/delete', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const profile = await Profile.findById(userId);
    if (!profile) return res.status(404).json({ success: false, error: 'User not found' });
    
    // Create backup in DeletedProfile
    await DeletedProfile.create({
      originalId: profile._id,
      username: profile.username,
      email: profile.email,
      displayName: profile.displayName
    });
    
    // Delete Tasks
    await Task.deleteMany({ userId });
    
    // Delete Profile
    await Profile.findByIdAndDelete(userId);
    
    // Destroy Session
    req.session.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, error: 'Server error deleting account' });
  }
});

// Forgot Password - Send OTP
app.post('/api/auth/forgot-password-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    
    const user = await Profile.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, error: 'No account found with that email' });
    if (!user.passwordHash && user.googleId) {
       return res.status(400).json({ success: false, error: 'This account uses Google Sign In' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Delete existing OTPs for this email to prevent spam
    await Otp.deleteMany({ email: email.toLowerCase().trim() });
    
    await Otp.create({
      email: email.toLowerCase().trim(),
      otp: otpCode
    });
    
    const mailOptions = {
      from: `"TaskFlow App" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase().trim(),
      subject: `TaskFlow - Password Reset Code`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr><td align="center" style="padding-bottom:24px;">
                <h2 style="margin:0;color:#7c6ff7;font-size:22px;">Password Reset Request</h2>
              </td></tr>
              <tr><td align="center" style="padding-bottom:20px;">
                <p style="margin:0;font-size:15px;color:#555;">Use the code below to reset your TaskFlow password. It expires in <strong>5 minutes</strong>.</p>
              </td></tr>
              <tr><td align="center" style="padding:20px 0;">
                <div style="display:inline-block;background:#f0eeff;border:2px solid #7c6ff7;border-radius:12px;padding:18px 40px;">
                  <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#3d2fa9;font-family:monospace;">${otpCode}</span>
                </div>
              </td></tr>
              <tr><td align="center" style="padding-top:24px;padding-bottom:12px;">
                <hr style="border:0;border-top:1px solid #eee;" />
              </td></tr>
              <tr><td align="center">
                <p style="margin:0;font-size:12px;color:#aaa;">If you did not request this, please ignore this email. Do not reply to this email.</p>
                <p style="margin:6px 0 0;font-size:12px;color:#aaa;">This is a system generated email so kindly do not reply to this.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('Forgot password OTP error:', err);
    res.status(500).json({ success: false, error: 'Server error sending OTP' });
  }
});

// Verify Reset OTP
app.post('/api/auth/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Missing fields' });
    const cleanOtp = otp.replace(/\D/g, '');
    const otpRecord = await Otp.findOne({ email: email.toLowerCase().trim(), otp: cleanOtp });
    if (!otpRecord) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error('Verify reset OTP error:', err);
    res.status(500).json({ success: false, error: 'Server error verifying OTP' });
  }
});

// Forgot Password - Reset
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, error: 'Missing fields' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const cleanOtp = otp.replace(/\D/g, '');
    const otpRecord = await Otp.findOne({ email: email.toLowerCase().trim(), otp: cleanOtp });
    if (!otpRecord) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });

    const user = await Profile.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();
    
    await Otp.deleteMany({ email: email.toLowerCase().trim() });
    
    // Log user in
    req.session.userId = user._id;
    res.json({ success: true, user: { username: user.username, displayName: user.displayName } });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error resetting password' });
  }
});

// Update Profile
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, profilePicture } = req.body;
    if (!displayName) {
      return res.status(400).json({ success: false, error: 'Display name is required' });
    }
    
    // Simple base64 size check (optional: limit strictly if needed, payload limit usually handles it)
    if (profilePicture && profilePicture.length > 3 * 1024 * 1024) { // roughly > 2MB base64
      return res.status(400).json({ success: false, error: 'Image too large' });
    }

    const updatedProfile = await Profile.findByIdAndUpdate(
      req.session.userId, 
      { displayName, profilePicture },
      { new: true }
    );
    
    if (!updatedProfile) return res.status(404).json({ success: false, error: 'User not found' });
    
    res.json({ success: true, user: { 
      username: updatedProfile.username, 
      displayName: updatedProfile.displayName,
      profilePicture: updatedProfile.profilePicture
    }});
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, error: 'Server error updating profile' });
  }
});

// Send OTP for Registration
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Username, email and password are required' });
    }
    if (username.length < 3) return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Please enter a valid email address' });

    // Check uniqueness
    const usernameTaken = await Profile.findOne({ username: username.toLowerCase().trim() });
    if (usernameTaken) return res.status(409).json({ success: false, error: 'Username already exists' });
    const emailTaken = await Profile.findOne({ email: email.toLowerCase().trim() });
    if (emailTaken) return res.status(409).json({ success: false, error: 'Email already exists' });

    // Generate 6 digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Clear any existing OTP for this email
    await Otp.deleteMany({ email: email.toLowerCase().trim() });
    
    // Save new OTP
    const newOtp = new Otp({ email: email.toLowerCase().trim(), otp: otpCode });
    await newOtp.save();

    // Send Email
    const mailOptions = {
      from: `"TaskFlow App" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase().trim(),
      subject: `Your TaskFlow Verification Code`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr><td align="center" style="padding-bottom:24px;">
                <h2 style="margin:0;color:#7c6ff7;font-size:22px;">Welcome to TaskFlow!</h2>
              </td></tr>
              <tr><td align="center" style="padding-bottom:20px;">
                <p style="margin:0;font-size:15px;color:#555;">Use the code below to complete your registration. It expires in <strong>5 minutes</strong>.</p>
              </td></tr>
              <tr><td align="center" style="padding:20px 0;">
                <div style="display:inline-block;background:#f0eeff;border:2px solid #7c6ff7;border-radius:12px;padding:18px 40px;">
                  <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#3d2fa9;font-family:monospace;">${otpCode}</span>
                </div>
              </td></tr>
              <tr><td align="center" style="padding-top:24px;padding-bottom:12px;">
                <hr style="border:0;border-top:1px solid #eee;" />
              </td></tr>
              <tr><td align="center">
                <p style="margin:0;font-size:12px;color:#aaa;">If you did not request this, please ignore this email. Do not reply to this email.</p>
                <p style="margin:6px 0 0;font-size:12px;color:#aaa;">This is a system generated email so kindly do not reply to this.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

// Register (Verifies OTP)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName, otp } = req.body;
    if (!username || !email || !password || !otp) {
      return res.status(400).json({ success: false, error: 'All fields including OTP are required' });
    }

    // Check OTP
    const cleanOtp = otp.replace(/\D/g, '');
    console.log(`Checking OTP for email: '${email.toLowerCase().trim()}', OTP: '${cleanOtp}'`);
    const allOtps = await Otp.find({ email: email.toLowerCase().trim() });
    console.log(`All OTPs for this email in DB:`, allOtps);
    
    const validOtp = await Otp.findOne({ email: email.toLowerCase().trim(), otp: cleanOtp });
    console.log(`Matched OTP:`, validOtp);
    if (!validOtp) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    // Re-check uniqueness just in case
    const usernameTaken = await Profile.findOne({ username: username.toLowerCase().trim() });
    if (usernameTaken) return res.status(409).json({ success: false, error: 'Username already exists' });
    const emailTaken = await Profile.findOne({ email: email.toLowerCase().trim() });
    if (emailTaken) return res.status(409).json({ success: false, error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const profile = new Profile({
      username:    username.toLowerCase().trim(),
      email:       email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName?.trim() || username.trim(),
    });
    await profile.save();
    
    // Cleanup OTP
    await Otp.deleteMany({ email: email.toLowerCase().trim() });

    req.session.userId      = profile._id;
    req.session.username    = profile.username;
    req.session.displayName = profile.displayName;

    res.status(201).json({
      success: true,
      message: 'Account created!',
      user: { username: profile.username, displayName: profile.displayName }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const profile = await Profile.findOne({ username: username.toLowerCase().trim() });
    if (!profile) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, profile.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    req.session.userId      = profile._id;
    req.session.username    = profile.username;
    req.session.displayName = profile.displayName;

    res.json({
      success: true,
      message: 'Logged in!',
      user: { username: profile.username, displayName: profile.displayName }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Sign In / Continue
app.post('/api/auth/google', async (req, res) => {
  try {
    const { token, mode } = req.body; // mode is 'login' or 'register'
    if (!token) return res.status(400).json({ success: false, error: 'No token provided' });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const profile = await Profile.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (mode === 'login') {
      if (!profile) {
        return res.status(401).json({ success: false, error: 'Account not found. Please register first.' });
      }
      // If found but doesn't have googleId yet, we can link it
      if (!profile.googleId) {
        profile.googleId = googleId;
        await profile.save();
      }
      
      req.session.userId      = profile._id;
      req.session.username    = profile.username;
      req.session.displayName = profile.displayName;

      return res.json({
        success: true,
        message: 'Logged in with Google!',
        user: { username: profile.username, displayName: profile.displayName }
      });
    } else {
      // mode === 'register'
      if (profile) {
        return res.status(409).json({ success: false, error: 'Email already registered. Please sign in.' });
      }
      
      // Store in session temporarily to let user choose username/password
      req.session.pendingGoogleUser = {
        googleId,
        email: email.toLowerCase(),
        displayName: name
      };

      return res.json({ success: true, requiresCompletion: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
});

// Google Register Completion
app.post('/api/auth/google/complete', async (req, res) => {
  try {
    const { username, password } = req.body;
    const pendingUser = req.session.pendingGoogleUser;

    if (!pendingUser) {
      return res.status(400).json({ success: false, error: 'Session expired. Please click Continue with Google again.' });
    }
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    if (username.length < 3) return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const usernameTaken = await Profile.findOne({ username: username.toLowerCase().trim() });
    if (usernameTaken) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const profile = new Profile({
      username:    username.toLowerCase().trim(),
      email:       pendingUser.email,
      googleId:    pendingUser.googleId,
      passwordHash,
      displayName: pendingUser.displayName,
    });
    await profile.save();

    // Clear pending session and log in
    delete req.session.pendingGoogleUser;
    req.session.userId      = profile._id;
    req.session.username    = profile.username;
    req.session.displayName = profile.displayName;

    res.status(201).json({
      success: true,
      message: 'Account created!',
      user: { username: profile.username, displayName: profile.displayName }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out' });
  });
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  try {
    const user = await Profile.findById(req.session.userId);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    res.json({
      success: true,
      user: {
        username:    user.username,
        displayName: user.displayName,
        email:       user.email,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── TASK ROUTES (all require auth + scoped by userId) ────────────────────────

// GET all tasks grouped by status
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    const grouped = { todo: [], doing: [], completed: [], deleted: [], wontdo: [], expired: [] };
    tasks.forEach(t => { if (grouped[t.status]) grouped[t.status].push(t); });
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET tasks by status
app.get('/api/tasks/:status', requireAuth, async (req, res) => {
  const { status } = req.params;
  const validStatuses = ['todo', 'doing', 'completed', 'deleted', 'wontdo', 'expired'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  try {
    const tasks = await Task.find({ userId: req.session.userId, status }).sort({ createdAt: -1 });
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new task
app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { title, description, deadline, deadlineText, priority, status } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    let finalStatus = status || 'todo';
    if (deadline && new Date(deadline) < new Date()) finalStatus = 'expired';

    const task = new Task({
      userId:       req.session.userId,
      title:        title.trim(),
      description:  description?.trim() || '',
      deadline:     deadline ? new Date(deadline) : null,
      deadlineText: deadlineText || '',
      priority:     priority || 'medium',
      status:       finalStatus,
    });

    await task.save();
    res.status(201).json({ success: true, data: task, message: `Task created in "${statusToCollection(finalStatus)}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update task status
app.patch('/api/tasks/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['todo', 'doing', 'completed', 'deleted', 'wontdo', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const task = await Task.findOne({ _id: id, userId: req.session.userId });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const prevStatus    = task.status;
    task.originalStatus = prevStatus;
    task.status         = status;
    task.movedAt        = new Date();
    task.updatedAt      = new Date();
    await task.save();

    res.json({ success: true, data: task, message: `Moved from "${statusToCollection(prevStatus)}" → "${statusToCollection(status)}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update task details
app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline, deadlineText, priority } = req.body;

    const task = await Task.findOne({ _id: id, userId: req.session.userId });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (title)                  task.title        = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (deadline !== undefined)    task.deadline    = deadline ? new Date(deadline) : null;
    if (deadlineText !== undefined) task.deadlineText = deadlineText;
    if (priority)               task.priority     = priority;
    task.updatedAt = new Date();

    await task.save();
    res.json({ success: true, data: task, message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE permanently remove task
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task permanently deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const stats = await Task.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.session.userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const result = { todo: 0, doing: 0, completed: 0, deleted: 0, wontdo: 0, expired: 0, total: 0 };
    stats.forEach(s => { result[s._id] = s.count; result.total += s.count; });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 MongoDB: ${MONGO_URI}`);
  });
});
