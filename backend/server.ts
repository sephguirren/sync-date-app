import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables (like your MongoDB password)
dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// --- MongoDB Setup ---

const MONGO_URI = process.env.MONGO_URI || "YOUR_MONGODB_CONNECTION_STRING_HERE";

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Connected to MongoDB cloud database!"))
        .catch(err => console.error("❌ MongoDB connection error:", err));
} else {
    console.warn("⚠️ No MONGO_URI found! Please add it to your Render Environment Variables.");
}

// Define what a "Message" looks like in the database
const messageSchema = new mongoose.Schema({
  roomCode: String,
  senderId: String, // 'Host' or 'Guest'
  text: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// --- Socket.io Logic ---
const rooms = new Map<string, { host: string, guest: string | null }>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Host creates a persistent room
  socket.on('create-room', () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms.set(code, { host: socket.id, guest: null });
    
    socket.join(code);
    socket.emit('room-created', code);
    console.log(`Room ${code} created by ${socket.id}`);
  });

  // 2. Guest (or returning host) joins a room via code
  socket.on('join-room', async (code: string) => {
    const roomCode = code.toUpperCase();
    
    // We allow joining even if the room isn't currently "active" in memory, 
    // so offline chat history works!
    socket.join(roomCode);
    
    // Fetch chat history for this specific room from MongoDB
    try {
      const history = await Message.find({ roomCode }).sort({ timestamp: 1 }).limit(50);
      socket.emit('chat-history', history);
    } catch (err) {
      console.error("Error fetching history", err);
    }

    // If it's a live room, notify both that it's ready
    const room = rooms.get(roomCode);
    if (room) {
      room.guest = socket.id;
      io.to(roomCode).emit('room-ready', roomCode);
    } else {
      // If the server restarted, just let them in to see the chat
      socket.emit('room-ready', roomCode);
    }
    console.log(`User ${socket.id} joined room ${roomCode}`);
  });

  // 3. Handle Chat Messages
  socket.on('send-chat', async ({ code, senderId, text }) => {
    try {
      // Save message to database
      const newMessage = new Message({ roomCode: code, senderId, text });
      await newMessage.save();

      // Broadcast to everyone in the room
      io.to(code).emit('receive-chat', newMessage);
    } catch (err) {
      console.error("Error saving message", err);
    }
  });

  // 4. Relay game/activity events
  socket.on('game-event', ({ code, event }: { code: string, event: any }) => {
     socket.to(code).emit('game-event', event);
  });

  socket.on('disconnect', () => {
     console.log('User disconnected:', socket.id);
     rooms.forEach((value, key) => {
        if (value.host === socket.id || value.guest === socket.id) {
           socket.to(key).emit('peer-disconnected');
           rooms.delete(key);
        }
     });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Sync Server running on port ${PORT}`);
});