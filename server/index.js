import { createServer } from "http";
import { Server } from "socket.io";


const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Track collaborators per room in-memory (optional, Redis can also store this)
const roomUsers = {};
const roomGraphs = {}

io.on("connection", (socket) => { 

  console.log(`Client connected: ${socket.id}`);

  socket.on("joinRoom", ({ user, room }) => { 
    console.log(`${user} joined room ${room}`)
    socket.join(room); 
    socket.data.room = room;
    socket.data.user = user;
    if (!roomUsers[room]) {
        roomUsers[room] = new Set(); 
    }
    roomUsers[room].add(user);  
    console.log(roomUsers[room])

    // render room
    // TO DO : update initial graph
    if (roomGraphs[room]) {
        socket.emit("graphState", roomGraphs[room]);
    }
    // else: first change takes initial state NO WE NEED INITIAL STATE

    // Send collaborators list to everyone in the room 
    console.log("right before emit collaborators")
    io.to(room).emit("collaborators", [...roomUsers[room]]); 
  });

  socket.on("message", ({ user, room, graph }) => { 
    roomGraphs[room] = graph
    socket.to(room).emit("message", { user, graph });
  });

  socket.on("disconnecting", () => {
    const room = socket.data.room;
  if (!room) return; // socket never joined a room

  roomUsers[room].delete(socket.data.user);
  io.to(room).emit("collaborators", { roomId: room, users: [...roomUsers[room]] });
  });
});

httpServer.listen(3500, () => {
  console.log("Server running on port 3500");
});
