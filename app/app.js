const socket = io('ws://localhost:3500')  

const userVal = document.getElementById('userId').value.trim()
const roomVal = document.getElementById('roomId').value.trim()




document.addEventListener("graphJSONUpdated", (e) => {
    const json = e.detail; 
    console.log("Received graph JSON:", json); 
    socket.emit('message', { user: userVal, room: roomVal, graph: json })
});

/*

function updateValue(e) {
    log.textContent = e.target.value; 
    socket.emit('message', e.target.value);
}

*/
socket.on("message", (data) => { 
    console.log("socket message received", data)
    update_graph(data.graph) // only the JSON
})

/*
socket.on("rerender collaborators", (data) => {  
    let list = document.getElementById("collaborators")   
    list.innerHTML = ""; 


    for (const col of data){ 
        let newId = document.createElement("li")
        newId.innerText = "User: " + col
        list.appendChild(newId) 

    }
}
)
*/