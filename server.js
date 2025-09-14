const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===== ৩ মিনিট TTL সহ "সর্বশেষ SMS" স্টোরেজ =====
let latest = null;           // { message, timestamp, expiresAt }
let autoClearTimer = null;   // setTimeout হ্যান্ডেল

// SMS রিসিভ (JSON বা x-www-form-urlencoded—দুইভাবেই কাজ করবে)
app.post('/sms', (req, res) => {
  const message = req.body.key || 'No message received';
  const timestamp = req.body.time || new Date().toISOString();

  // আগের অটো-ক্লিয়ার থাকলে বন্ধ করুন
  if (autoClearTimer) clearTimeout(autoClearTimer);

  // এখন থেকে ৩ মিনিটের TTL
  const ttlMs = 3 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  latest = { message, timestamp, expiresAt };

  console.log('Processed SMS:', { message, timestamp, expiresAt: new Date(expiresAt).toISOString() });

  // সকল কানেক্টেড ক্লায়েন্টকে পাঠান
  io.emit('newMessage', latest);

  // TTL পার হলে অটো-ডিলিট
  autoClearTimer = setTimeout(() => {
    latest = null;
    io.emit('messageDeleted', { reason: 'expired' });
    console.log('Latest SMS auto-removed after 3 minutes.');
  }, ttlMs);

  res.status(200).json({ success: true, message: 'SMS received successfully', expiresAt });
});

// ম্যানুয়াল ডিলিট (DELETE পছন্দনীয়)
app.delete('/sms', (req, res) => {
  if (autoClearTimer) clearTimeout(autoClearTimer);
  if (!latest) return res.status(200).json({ success: true, message: 'No SMS to delete' });
  latest = null;
  io.emit('messageDeleted', { reason: 'deleted' });
  console.log('Latest SMS deleted by user (DELETE).');
  res.status(200).json({ success: true, message: 'SMS deleted' });
});

// কিছু হোস্ট/প্রক্সিতে DELETE ব্লক থাকলে—ফলব্যাক
app.post('/sms/delete', (req, res) => {
  if (autoClearTimer) clearTimeout(autoClearTimer);
  if (!latest) return res.status(200).json({ success: true, message: 'No SMS to delete' });
  latest = null;
  io.emit('messageDeleted', { reason: 'deleted' });
  console.log('Latest SMS deleted by user (POST fallback).');
  res.status(200).json({ success: true, message: 'SMS deleted (fallback)' });
});

// UI সার্ভ করুন
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('A user connected');
  if (latest) socket.emit('newMessage', latest);
  else socket.emit('messageDeleted', { reason: 'none' });
  socket.on('disconnect', () => console.log('A user disconnected'));
});

// Render ইত্যাদিতে PORT এনভাইরনমেন্ট ভ্যারিয়েবল থেকে নিবে
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
