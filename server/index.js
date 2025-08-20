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
const roomHistory = {}; // roomId: { timestamp, snapshot, updates }
const SNAPSHOT_INTERVAL = 5; // store a snapshot every n updates
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
        roomVersion[room] = 0;   //  ensure version exists
      }
    if (!roomGraphs[room]) {
        roomGraphs[room] = new Y.Doc(); //  ensure ydoc exists
      }
    const ydoc = roomGraphs[room];
      
    // initialize graph if empty
    const ymap = ydoc.getMap("graph");
    if (!ymap.has("graph")) {
      ymap.set("graph", starterJSON);
    }      

    // send as update
    const fullUpdate = Array.from(Y.encodeStateAsUpdate(ydoc));
    socket.emit("graph-update",  fullUpdate);
    
    io.to(room).emit("collaborators", [...roomUsers[room]]); 
  }); 

  /*
  code from initial websocket version
  socket.on("message", ({ user, room, graph }) => { 
    roomGraphs[room] = graph
    socket.to(room).emit("message", { user, graph });
  });  */

  // graph updated by client
  socket.on("graph-update", (update) => { 
    const room = socket.data.room;
    if (!room) return;
    roomVersion[room] += 1
    const ydoc = roomGraphs[room];
    const binaryUpdate = new Uint8Array(update);
    Y.applyUpdate(ydoc, binaryUpdate);
  
    // initialize history
    if (!roomHistory[room]) roomHistory[room] = [];
  
    // store snapshot every N updates
    const history = roomHistory[room]; 
    const nextVersion = roomVersion[room];
  
 // every SNAPSHOT_INTERVAL, capture full JSON snapshot
    if ((nextVersion + 1) % SNAPSHOT_INTERVAL === 0) { 
        const graphMap = ydoc.getMap("graph");
        const graph = graphMap.get("graph"); // your JSON object
        const snapshot = JSON.parse(JSON.stringify(graph)); // deep copy
        history.push({
        snapshot,       // full graph JSON
        timestamp: Date.now(),
        });
    }
    // broadcast to other clients
    socket.to(room).emit("graph-update", update);
  }); 


  // request entire history list
  socket.on("historyRequest", () => {  
    console.log("History requested by user ", socket.data.user);
    const history = roomHistory[socket.data.room]
    const list = history.map((h, idx) => ({
      index: idx,
      timestamp: h.timestamp
    })); 
    console.log("emitting socket list");
    socket.emit("historyList", list);
  });

  socket.on("loadVersion", (version) => {
    const room = socket.data.room;
    const history = roomHistory[room];
    if (!history || version >= history.length) return;

    // find the version
    const snapshotEntry = history[version];

    // check guard
    if (!snapshotEntry || !snapshotEntry.snapshot) return;
  
    // send the JSON snapshot directly
    socket.emit("loadVersionResponse", {
      version,
      graph: snapshotEntry.snapshot,
      timestamp: snapshotEntry.timestamp,
    });
  });

  // restoring an old version
  socket.on("restore-version", (index) => {  
    const room = socket.data.room; 
    if (!room || !roomHistory[room]) return;

    const history = roomHistory[room];
    const versionData = history[index]; 

    if (!versionData) return;

    roomGraphs[room] = new Y.Doc();
    const ydoc = roomGraphs[room];
    const ymap = ydoc.getMap("graph");
    ymap.set("graph", JSON.parse(JSON.stringify(versionData.snapshot))); // deep copy  

    console.log(`Restoring version ${index} in room ${room}`);
  
    // save the current latest graph as its own version before overwriting
    const currentLatest = history[history.length - 1];
    history.push({
      snapshot: currentLatest.snapshot, // old state
      timestamp: Date.now(),
    });
  
    // append the restored version as a new entry
    history.push({
      snapshot: versionData.snapshot,
      timestamp: Date.now(),
    });
  
    // broadcast restored graph 
    io.to(room).emit("restoreVersionBroadcast", {
      graph: versionData.snapshot,
      version: history.length - 1, // the new appended index
      timestamp: Date.now(),
    });
  });
  
  // gets the current state on history close
  socket.on("current-state", () => {
    const room = socket.data.room
    const ydoc = roomGraphs[room];
    // initialize graph if empty
    const ymap = ydoc.getMap("graph");
    if (!ymap.has("graph")) {
      ymap.set("graph", starterJSON);
    }      
    const fullUpdate = Array.from(Y.encodeStateAsUpdate(ydoc)); 
    socket.emit("graph-current-state",  fullUpdate);  
  })

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