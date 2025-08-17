import { createServer } from "http";
import { Server } from "socket.io";
import * as Y from "yjs";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Track collaborators per room in-memory (optional, Redis can also store this)
const roomUsers = {};
const roomGraphs = {} 
const starterJSON = {
    "last_node_id": 2,
    "last_link_id": 0,
    "nodes": [
        {
            "id": 1,
            "type": "math/sum",
            "pos": [
                200,
                200
            ],
            "size": {
                "0": 140,
                "1": 46
            },
            "flags": {},
            "order": 0,
            "mode": 0,
            "inputs": [
                {
                    "name": "a",
                    "type": "Number",
                    "link": null
                },
                {
                    "name": "b",
                    "type": "Number",
                    "link": null
                }
            ],
            "outputs": [
                {
                    "name": "out",
                    "type": "Number",
                    "links": null,
                    "_data": null
                }
            ],
            "properties": {}
        },
        {
            "id": 2,
            "type": "math/sum",
            "pos": [
                400,
                200
            ],
            "size": {
                "0": 140,
                "1": 46
            },
            "flags": {},
            "order": 1,
            "mode": 0,
            "inputs": [
                {
                    "name": "a",
                    "type": "Number",
                    "link": null
                },
                {
                    "name": "b",
                    "type": "Number",
                    "link": null
                }
            ],
            "outputs": [
                {
                    "name": "out",
                    "type": "Number",
                    "links": null,
                    "_data": null
                }
            ],
            "properties": {}
        }
    ],
    "links": [],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
}

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


    if (!roomGraphs[room]) {
        roomGraphs[room] = new Y.Doc();
      }
      const ydoc = roomGraphs[room];
      
      // Populate initial graph if empty
      const ymap = ydoc.getMap("graph");
      if (!ymap.has("graph")) {
        ymap.set("graph", starterJSON);
      }      
    
    const fullUpdate = Array.from(Y.encodeStateAsUpdate(ydoc));
    console.log(fullUpdate)
    // type fixed 
    socket.emit("graph-update",  fullUpdate);
    
    // Send collaborators list to everyone in the room 
    console.log("right before emit collaborators")
    io.to(room).emit("collaborators", [...roomUsers[room]]); 
  });

  socket.on("message", ({ user, room, graph }) => { 
    roomGraphs[room] = graph
    socket.to(room).emit("message", { user, graph });
  }); 

  socket.on("graph-update", (update) => {
    console.log("UPDATE RECEIVED ON BACKEND");
  
    // Convert back into Uint8Array
    const binaryUpdate = new Uint8Array(update);
  
    const ydoc = roomGraphs[socket.data.room];
    Y.applyUpdate(ydoc, binaryUpdate);
  
    // Broadcast to other clients
    socket.to(socket.data.room).emit("graph-update", update);
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
