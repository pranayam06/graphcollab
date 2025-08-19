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
const SNAPSHOT_INTERVAL = 5; // store a snapshot every N updates
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
const roomVersion = {}

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
        roomHistory[room] = [];   //  ensure history exists
      }

      if (!roomVersion[room]) {
        roomVersion[room] = 0;   //  ensure history exists
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
    // type fixed 
    socket.emit("graph-update",  fullUpdate);
    
    // Send collaborators list to everyone in the room 
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
    roomVersion[room] += 1
    
  
    const ydoc = roomGraphs[room];
    const binaryUpdate = new Uint8Array(update);
    Y.applyUpdate(ydoc, binaryUpdate);
  
    // Initialize history
    if (!roomHistory[room]) roomHistory[room] = [];
  
    // Store snapshot every N updates
    const history = roomHistory[room]; 
    const nextVersion = roomVersion[room];
    console.log(nextVersion)
    //console.log(history)
  
 // Every SNAPSHOT_INTERVAL, capture full JSON snapshot
    if ((nextVersion + 1) % SNAPSHOT_INTERVAL === 0) { 
        const graphMap = ydoc.getMap("graph");
        const graph = graphMap.get("graph"); // your JSON object
        const snapshot = JSON.parse(JSON.stringify(graph)); // deep copy

        history.push({
        snapshot,       // full graph JSON
        timestamp: Date.now(),
        });
        //console.log("Stored snapshot:", snapshot);
    }



    // Broadcast to other clients
    socket.to(room).emit("graph-update", update);
  }); 


  socket.on("historyRequest", () => {  
    console.log("history requested");
    const history = roomHistory[socket.data.room]
    console.log(history)
    const list = history.map((h, idx) => ({
      index: idx,
      timestamp: h.timestamp
    })); 
    console.log(list)
    socket.emit("historyList", list);
  });

  socket.on("loadVersion", (version) => {
    const room = socket.data.room;
    const history = roomHistory[room];
    if (!history || version >= history.length) return;
  
    // Find the closest snapshot at or before the requested version
    //const snapshotIndex = Math.floor(version / SNAPSHOT_INTERVAL) * SNAPSHOT_INTERVAL;
    const snapshotEntry = history[version];
  
    if (!snapshotEntry || !snapshotEntry.snapshot) return;
  
    // Send the JSON snapshot directly
    socket.emit("loadVersionResponse", {
      version,
      graph: snapshotEntry.snapshot,
      timestamp: snapshotEntry.timestamp,
    });
  });

  socket.on("restore-version", (index) => {  
    console.log(index)
    console.log("RESTORINGGGG we r here")
    const room = socket.data.room; 
    console.log("cp1")
    if (!room || !roomHistory[room]) return;
    console.log("cp2") 
    console.log(index)

    const history = roomHistory[room];
    const versionData = history[index]; 
    console.log("cp3")

    if (!versionData) return;
    console.log("cp4")

    roomGraphs[room] = new Y.Doc();
    const ydoc = roomGraphs[room];
    const ymap = ydoc.getMap("graph");
    ymap.set("graph", JSON.parse(JSON.stringify(versionData.snapshot))); // deep copy  

  
    console.log(`Restoring version ${index} in room ${room}`);
  
    // 1. Save the *current* latest graph as its own version before overwriting
    const currentLatest = history[history.length - 1];
    history.push({
      snapshot: currentLatest.snapshot, // old state
      timestamp: Date.now(),
    });
  
    // 2. Append the restored version as a *new* entry
    history.push({
      snapshot: versionData.snapshot,
      timestamp: Date.now(),
    });
  
    // 3. Broadcast restored graph 
    io.to(room).emit("restoreVersionBroadcast", {
      graph: versionData.snapshot,
      version: history.length - 1, // the new appended index
      timestamp: Date.now(),
    });
  });
  
  
  socket.on("current-state", () => {
    const room = socket.data.room
    const ydoc = roomGraphs[room];
    // Populate initial graph if empty
    const ymap = ydoc.getMap("graph");
    if (!ymap.has("graph")) {
      ymap.set("graph", starterJSON);
    }      
  
    const fullUpdate = Array.from(Y.encodeStateAsUpdate(ydoc)); 

    socket.emit("graph-current-state",  fullUpdate);  })
  

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

  