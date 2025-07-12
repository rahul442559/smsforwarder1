const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); // Use http server for Socket.IO
const io = new Server(server); // Attach Socket.IO to the server

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let latestMessage = 'No messages received yet.'; // Store the latest message

// Endpoint to receive SMS data
app.post('/sms', (req, res) => {
    const message = req.body.key || 'No message received'; // Extract message from "key"
    const timestamp = req.body.time || 'Unknown time'; // Extract timestamp

    latestMessage = `Received at: ${timestamp}\nMessage: ${message}`;
    console.log('Processed SMS:', latestMessage);

    // Broadcast the message to all connected clients
    io.emit('newMessage', { timestamp, message });

    res.status(200).json({ success: true, message: 'SMS received successfully' });
});

// Serve a simple HTML page for real-time message display
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Socket.IO connection event
io.on('connection', (socket) => {
    console.log('A user connected');
    // Send the latest message to the newly connected client
    socket.emit('newMessage', { message: latestMessage });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});