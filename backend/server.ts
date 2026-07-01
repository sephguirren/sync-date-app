import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, restrict this to your React app's URL
    methods: ["GET", "POST"]
  }
});

// Store active rooms in memory
// Key: 5-letter code, Value: { hostSocketId, guestSocketId }
const rooms = new Map<string, { host: string, guest: string | null }>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Host creates a room
  socket.on('create-room', () => {
    // Generate a 5-character uppercase alphanumeric code
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms.set(code, { host: socket.id, guest: null });
    
    socket.join(code);
    socket.emit('room-created', code);
    console.log(`Room ${code} created by ${socket.id}`);
  });

  // 2. Guest joins a room via code
  socket.on('join-room', (code: string) => {
    const roomCode = code.toUpperCase();
    const room = rooms.get(roomCode);
    
    if (room) {
      if (room.guest) {
        socket.emit('error', 'Room is already full');
        return;
      }
      // Add guest to room
      room.guest = socket.id;
      socket.join(roomCode);
      
      // Notify both clients that the room is ready to start
      io.to(roomCode).emit('room-ready', roomCode);
      console.log(`User ${socket.id} joined room ${roomCode}`);
    } else {
      socket.emit('error', 'Invalid or expired room code');
    }
  });

  // 3. Relay game/activity events to the peer
  socket.on('game-event', ({ code, event }: { code: string, event: any }) => {
     // Broadcast to the other person in the room (excludes the sender)
     socket.to(code).emit('game-event', event);
  });

  // 4. Handle disconnections cleanly
  socket.on('disconnect', () => {
     console.log('User disconnected:', socket.id);
     // Find if the user was in any room and clean it up
     rooms.forEach((value, key) => {
        if (value.host === socket.id || value.guest === socket.id) {
           socket.to(key).emit('peer-disconnected');
           rooms.delete(key);
           console.log(`Room ${key} closed due to disconnect`);
        }
     });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Sync Server running on port ${PORT}`);
});