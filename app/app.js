const socket = io('ws://localhost:3500');

document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const userVal = document.getElementById('userId').value.trim();
    const roomVal = document.getElementById('roomId').value.trim();
    //document.getElementById("mycanvas").style.display = "block";
    document.getElementById("collaborators").style.display = "block";

    if (!userVal || !roomVal) { alert("Enter User ID and Room ID"); return; }

    // Join the room
    socket.emit("joinRoom", { user: userVal, room: roomVal });

    // Store for later graph updates
    socket.data = { user: userVal, room: roomVal };

    // Optionally, show canvas now

    //document.getElementById("mycanvas").style.display = "block";
});

// Listen for graph updates
document.addEventListener("graphJSONUpdated", (e) => {
    if (!socket.data) return; // not joined yet
    const json = e.detail; 
    socket.emit('message', { user: socket.data.user, room: socket.data.room, graph: json });
});

document.addEventListener("graph-update", (e) => {
    const update = e.detail; 
    console.log("hello i got the update")
    socket.emit("graph-update", Array.from(update)); // convert Uint8Array → plain array
    console.log("oops error here")
  });


// Receive updates
socket.on("message", (data) => { 
    console.log("socket message received", data);
    update_graph(data.graph);
}); 


socket.on("graph-update", (update) => {
    // Apply Yjs update 
    window.recieve_update(update)
  });

socket.on("graphState", (graph) => {
    update_graph(graph)
})

// Receive collaborator list
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

