const socket = io('ws://localhost:3500');

document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const userVal = document.getElementById('userId').value.trim();
    const roomVal = document.getElementById('roomId').value.trim();
    document.getElementById("collaborators").style.display = "block";

    if (!userVal || !roomVal) { alert("Enter User ID and Room ID"); return; }
    socket.emit("joinRoom", { user: userVal, room: roomVal });
    socket.data = { user: userVal, room: roomVal };
});

// Listen for graph updates
document.addEventListener("graphJSONUpdated", (e) => {
    if (!socket.data) return; // not joined yet
    const json = e.detail; 
    socket.emit('message', { user: socket.data.user, room: socket.data.room, graph: json });
});

// listen for current state on returning from history
document.addEventListener("getCurrent", (e) => { 
    console.log("looking for the current state")
    socket.emit("current-state");
})

// loading versions when viewing history
document.addEventListener("loadVersion", (e) => {
    const idx = e.detail
    console.log("loading version ", idx) 
    socket.emit('loadVersion', idx)

});

// requesting entire history list
document.addEventListener("historyRequest", (e) => {
    socket.emit('historyRequest')
}) 

// restoring older version
document.addEventListener("restore-version", (e) => {
    const index = e.detail 
    console.log("heres the index", index)
    socket.emit("restore-version", index); 
    console.log("restoring version ", index);
})

// on graph update, send update to server
document.addEventListener("graph-update", (e) => {
    const update = e.detail; 
    console.log("hello i got the update")
    socket.emit("graph-update", Array.from(update)); // convert Uint8Array → plain array
    console.log("oops error here")
  });


/*
websocket version
socket.on("message", (data) => { 
    console.log("socket message received", data);
    update_graph(data.graph);
}); 
*/

// SOCKET SIDE 

// recieving graph update from server
socket.on("graph-update", (update) => {
    window.recieve_update(update)
  });

// recieving the most recent state of the graph as json
socket.on("graphState", (graph) => {
    update_graph(graph)
})

// receive collaborator list and update list
socket.on("collaborators", (users) => {  
    console.log("here")
    const list = document.getElementById("collaboratorsList");
    list.innerHTML = "";
    for (const user of users) {
        const li = document.createElement("li");
        li.innerText = `User: ${user}`;
        list.appendChild(li);
    }
}); 

// recieves graph current state as an update when returning from history 
socket.on("graph-current-state", (update) => {
    window.recieve_update(update)
})

// loads version upon viewing history
socket.on("loadVersionResponse", ({ version, graph, timestamp }) => {
    console.log("Loaded version", version, "from", new Date(timestamp));
    window.temp_remote_update(graph);
  });

// renders history list
  socket.on("historyList", (list) => {
    window.renderHistory(list);
  })

// restoring version broadcast to everyone
socket.on("restoreVersionBroadcast", ({ graph, version, timestamp }) => {
  console.log("Version", version, "restored globally from", new Date(timestamp));
  window.restore(graph)
});