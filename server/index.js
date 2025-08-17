import { createServer } from "http";
import { Server } from "socket.io";
import * as Y from "yjs";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Track collaborators per room in-memory (optional, Redis can also store this)
const roomUsers = {};
const roomGraphs = {};
const roomHistory = {}; // roomId -> array of { timestamp, snapshot, updates }
const SNAPSHOT_INTERVAL = 10; // store a snapshot every N updates
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

    if (!roomHistory[room]) {
        roomHistory[room] = [];   // ✅ ensure history exists
      }


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

  /*

  socket.on("message", ({ user, room, graph }) => { 
    roomGraphs[room] = graph
    socket.to(room).emit("message", { user, graph });
  });  */

  socket.on("graph-update", (update) => {
    const room = socket.data.room;
    if (!room) return;
  
    const ydoc = roomGraphs[room];
    const binaryUpdate = new Uint8Array(update);
    Y.applyUpdate(ydoc, binaryUpdate);
  
    // Initialize history
    if (!roomHistory[room]) roomHistory[room] = [];
  
    // Store snapshot every N updates
    const history = roomHistory[room];
    const nextVersion = history.length;
    const snapshot = (nextVersion % SNAPSHOT_INTERVAL === 0) 
        ? ydoc.getMap("graph").get("graph") 
        : null;
  
    history.push({
      snapshot,
      updates: [binaryUpdate],
      timestamp: Date.now()
    });
  
    // If not snapshot version, append update to previous snapshot entry
    if (!snapshot && nextVersion > 0) {
      history[nextVersion - 1].updates.push(binaryUpdate);
    }
  
    // Broadcast to other clients
    socket.to(room).emit("graph-update", update);
  }); 


  socket.on("historyRequest", () => { 
    console.log("history requested");
    const history = roomHistory[socket.data.room]
    const list = history.map((h, idx) => ({
      index: idx,
      timestamp: h.timestamp
    }));
    socket.emit("historyList", list);
  });
 
  socket.on("loadVersion", (version) => { 
    console.log("we r here"); 
    const room = socket.data.room
    const history = roomHistory[room]; 

    if (!history) return;

    console.log("oh now here");
  
    const N = SNAPSHOT_INTERVAL; // e.g., 10
    const snapshotIndex = Math.floor(version / N) * N;
    const snapshotEntry = history[snapshotIndex];
  
    const updatesToSend = [];
  
    // start with snapshot as a Y.Doc state
    const ydoc = new Y.Doc();
    let ymap;
    if (snapshotEntry.snapshot) {
      ymap = ydoc.getMap("graph");
      ymap.set("graph", snapshotEntry.snapshot);
    }
  
    // apply incremental updates after snapshot up to target version
    for (let i = snapshotIndex + 1; i <= version; i++) {
      updatesToSend.push(...history[i].updates);
    }
  
    // Encode snapshot + incremental updates for client
    const fullUpdates = [
      Array.from(Y.encodeStateAsUpdate(ydoc)),
      ...updatesToSend
    ];
    console.log("sending full updatessss")
    socket.emit("loadVersionResponse", fullUpdates);
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

  