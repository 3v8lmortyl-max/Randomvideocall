import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPAZsbkOv1tweB9l4zd5HTCSwiH54fwXE",
  authDomain: "randomchat--main.firebaseapp.com",
  databaseURL: "https://randomchat--main-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "randomchat--main",
  storageBucket: "randomchat--main.appspot.com",
  messagingSenderId: "547588893640",
  appId: "1:547588893640:web:6e7c8079b3dec8340b2efd"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

signInAnonymously(auth).then(() => {
  console.log("Signed in anonymously");
  document.getElementById("loader").classList.remove("hidden");
}).catch(console.error);

// Placeholder: Setup WebRTC signaling (can be added later)
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localVideo.srcObject = stream;
    // Add WebRTC connection logic here to connect with another user
  })
  .catch(err => console.error("Camera access denied:", err));