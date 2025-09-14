const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); // Use http server for Socket.IO
const io = new Server(server); // Attach Socket.IO to the server

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===== State for "latest SMS" with 3-minute TTL =====
let latest = null;           // { message, timestamp, expiresAt }
let autoClearTimer = null;   // Node timeout handle

// Endpoint to receive SMS data
app.post('/sms', (req, res) => {
  const message = req.body.key || 'No message received'; // Extract message from "key"
  const timestamp = req.body.time || new Date().toISOString(); // If not provided, use now

  // Cancel any existing auto-clear
  if (autoClearTimer) clearTimeout(autoClearTimer);

  // Persist for 3 minutes from now
  const ttlMs = 3 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  latest = { message, timestamp, expiresAt };

  console.log('Processed SMS:', { message, timestamp, expiresAt: new Date(expiresAt).toISOString() });

  // Broadcast the message (with expiry time) to all connected clients
  io.emit('newMessage', latest);

  // Auto-remove after TTL
  autoClearTimer = setTimeout(() => {
    latest = null;
    io.emit('messageDeleted', { reason: 'expired' });
    console.log('Latest SMS auto-removed after 3 minutes.');
  }, ttlMs);

  res.status(200).json({ success: true, message: 'SMS received successfully', expiresAt });
});

// Allow manual deletion of the latest SMS
app.delete('/sms', (req, res) => {
  if (!latest) {
    return res.status(200).json({ success: true, message: 'No SMS to delete' });
  }
  if (autoClearTimer) clearTimeout(autoClearTimer);
  latest = null;
  io.emit('messageDeleted', { reason: 'deleted' });
  console.log('Latest SMS deleted by user.');
  res.status(200).json({ success: true, message: 'SMS deleted' });
});

// Serve a simple HTML page for real-time message display
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Socket.IO connection event
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send either the current message or "no message" signal
  if (latest) {
    socket.emit('newMessage', latest);
  } else {
    socket.emit('messageDeleted', { reason: 'none' });
  }

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
