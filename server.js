const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const localtunnel = require('localtunnel');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static('public'));

// Store active streams
const activeStreams = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/publisher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'publisher.html'));
});

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle publisher joining a room
  socket.on('join-as-publisher', (roomId) => {
    socket.join(roomId);
    activeStreams.set(roomId, {
      publisher: socket.id,
      viewers: new Set(),
      isLive: false
    });
    console.log(`Publisher ${socket.id} joined room: ${roomId}`);
    socket.emit('publisher-joined', roomId);
  });

  // Handle viewer joining a room
  socket.on('join-as-viewer', (roomId) => {
    const stream = activeStreams.get(roomId);
    if (stream) {
      socket.join(roomId);
      stream.viewers.add(socket.id);
      console.log(`Viewer ${socket.id} joined room: ${roomId}`);
      socket.emit('viewer-joined', roomId);
      
      // Notify publisher about new viewer
      socket.to(roomId).emit('viewer-connected', socket.id);
    } else {
      socket.emit('error', 'Stream not found');
    }
  });

  // Handle WebRTC offer from publisher
  socket.on('webrtc-offer', (data) => {
    const { roomId, offer } = data;
    const stream = activeStreams.get(roomId);
    
    if (stream && stream.publisher === socket.id) {
      // Broadcast offer to all viewers in the room
      socket.to(roomId).emit('webrtc-offer', {
        offer: offer,
        publisherId: socket.id
      });
    }
  });

  // Handle WebRTC answer from viewer
  socket.on('webrtc-answer', (data) => {
    const { roomId, answer } = data;
    const stream = activeStreams.get(roomId);
    
    if (stream && stream.viewers.has(socket.id)) {
      // Send answer back to publisher
      socket.to(roomId).emit('webrtc-answer', {
        answer: answer,
        viewerId: socket.id
      });
    }
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    const stream = activeStreams.get(roomId);
    
    if (stream) {
      if (stream.publisher === socket.id) {
        // Publisher sending ICE candidate to viewers
        socket.to(roomId).emit('ice-candidate', {
          candidate: candidate,
          fromPublisher: true
        });
      } else if (stream.viewers.has(socket.id)) {
        // Viewer sending ICE candidate to publisher
        socket.to(roomId).emit('ice-candidate', {
          candidate: candidate,
          fromPublisher: false,
          viewerId: socket.id
        });
      }
    }
  });

  // Handle stream start
  socket.on('start-stream', (roomId) => {
    const stream = activeStreams.get(roomId);
    if (stream && stream.publisher === socket.id) {
      stream.isLive = true;
      socket.to(roomId).emit('stream-started', roomId);
      console.log(`Stream started in room: ${roomId}`);
    }
  });

  // Handle stream stop
  socket.on('stop-stream', (roomId) => {
    const stream = activeStreams.get(roomId);
    if (stream && stream.publisher === socket.id) {
      stream.isLive = false;
      socket.to(roomId).emit('stream-stopped', roomId);
      console.log(`Stream stopped in room: ${roomId}`);
    }
  });

  // Handle viewer leaving
  socket.on('leave-room', (roomId) => {
    const stream = activeStreams.get(roomId);
    if (stream) {
      stream.viewers.delete(socket.id);
      socket.leave(roomId);
      console.log(`User ${socket.id} left room: ${roomId}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up streams
    for (const [roomId, stream] of activeStreams.entries()) {
      if (stream.publisher === socket.id) {
        // Publisher disconnected, notify viewers
        socket.to(roomId).emit('publisher-disconnected');
        activeStreams.delete(roomId);
        console.log(`Stream ended in room: ${roomId}`);
      } else if (stream.viewers.has(socket.id)) {
        stream.viewers.delete(socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Publisher: http://localhost:${PORT}/publisher`);
  console.log(`Viewer: http://localhost:${PORT}/viewer`);
    // initializeTunnel();
});
const initializeTunnel = async() => {
  const tunnel = await localtunnel(PORT, {
      subdomain: 'live3',
      host: 'https://loca.lt'
  });
  tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
  });
  tunnel.on('close', () => {
      console.log('Tunnel closed');
  });
  process.on('SIGINT', () => {
      tunnel.close();
      process.exit(0);
  });
  tunnel.on('url', (url) => {
      console.log(`🌐 Tunnel is ready!`);
      console.log(`💡 Share these URLs with your mobile device! : ${url}`);
  });
};
