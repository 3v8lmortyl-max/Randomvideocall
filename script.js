/**
 * Vibe - Random Video Chat App
 * Production-ready WebRTC + Firebase implementation
 */

class VibeApp {
    constructor() {
        this.uid = this.generateUID();
        this.currentRoom = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isConnected = false;
        this.isMicOn = true;
        this.isCameraOn = true;
        this.matchTimeout = null;
        this.blockedUsers = this.getBlockedUsers();
        
        // Firebase refs
        this.db = null;
        this.queueRef = null;
        this.matchRef = null;
        
        // DOM elements
        this.elements = {};
        
        // WebRTC config
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            await this.initializeFirebase();
            this.initializeDOM();
            this.setupEventListeners();
            await this.requestPermissions();
            await this.showSplash();
            this.showApp();
            this.logEvent('app_init');
        } catch (error) {
            console.error('App initialization failed:', error);
            this.updateStatus('Initialization failed', 'error');
        }
    }
    
    /**
     * Initialize Firebase
     */
    async initializeFirebase() {
        if (!window.firebaseConfig) {
            throw new Error('Firebase config not found. Please check firebase-config.js');
        }
        
        firebase.initializeApp(window.firebaseConfig);
        this.db = firebase.database();
        
        // Set up database refs
        this.queueRef = this.db.ref('queue');
        this.matchRef = this.db.ref(`matches/${this.uid}`);
        
        // Enable offline persistence
        this.db.goOffline();
        this.db.goOnline();
    }
    
    /**
     * Initialize DOM elements
     */
    initializeDOM() {
        this.elements = {
            splash: document.getElementById('splash'),
            app: document.getElementById('app'),
            status: document.getElementById('status-text'),
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo'),
            localContainer: document.getElementById('localVideoContainer'),
            micBtn: document.getElementById('micBtn'),
            cameraBtn: document.getElementById('cameraBtn'),
            likeBtn: document.getElementById('likeBtn'),
            dislikeBtn: document.getElementById('dislikeBtn'),
            reportBtn: document.getElementById('reportBtn'),
            nextBtn: document.getElementById('nextBtn'),
            premiumBanner: document.getElementById('premiumBanner'),
            debugPanel: document.getElementById('debugPanel'),
            debugInfo: document.getElementById('debugInfo')
        };
        
        // Show debug panel if requested
        if (window.location.search.includes('debug=1')) {
            this.elements.debugPanel.classList.remove('hidden');
        }
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Control buttons
        this.elements.micBtn.addEventListener('click', () => this.toggleMic());
        this.elements.cameraBtn.addEventListener('click', () => this.toggleCamera());
        this.elements.likeBtn.addEventListener('click', () => this.handleLike());
        this.elements.dislikeBtn.addEventListener('click', () => this.handleDislike());
        this.elements.reportBtn.addEventListener('click', () => this.handleReport());
        this.elements.nextBtn.addEventListener('click', () => this.handleNext());
        this.elements.premiumBanner.addEventListener('click', () => this.showPremiumModal());
        
        // Touch/swipe events
        this.setupSwipeListeners();
        
        // Local video dragging
        this.setupLocalVideoDrag();
        
        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    /**
     * Set up swipe gesture listeners
     */
    setupSwipeListeners() {
        let startY = 0;
        let startTime = 0;
        
        this.elements.remoteVideo.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startTime = Date.now();
        }, { passive: true });
        
        this.elements.remoteVideo.addEventListener('touchend', (e) => {
            const endY = e.changedTouches[0].clientY;
            const deltaY = startY - endY;
            const deltaTime = Date.now() - startTime;
            
            // Swipe up detection
            if (deltaY > 50 && deltaTime < 500) {
                this.handleNext();
            }
        }, { passive: true });
    }
    
    /**
     * Set up local video dragging
     */
    setupLocalVideoDrag() {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        
        const container = this.elements.localContainer;
        
        container.addEventListener('touchstart', (e) => {
            if (e.target === container) {
                isDragging = true;
                initialX = e.touches[0].clientX - currentX;
                initialY = e.touches[0].clientY - currentY;
            }
        }, { passive: true });
        
        container.addEventListener('touchmove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
                
                container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        });
        
        container.addEventListener('touchend', () => {
            isDragging = false;
        });
    }
    
    /**
     * Request camera and microphone permissions
     */
    async requestPermissions() {
        try {
            this.updateStatus('Requesting permissions...');
            
            const constraints = {
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.localVideo.srcObject = this.localStream;
            
            this.updateStatus('Ready to connect');
            
        } catch (error) {
            console.error('Permission request failed:', error);
            this.updateStatus('Camera/microphone access required', 'error');
            throw error;
        }
    }
    
    /**
     * Show splash screen
     */
    async showSplash() {
        return new Promise(resolve => {
            setTimeout(() => {
                this.elements.splash.classList.add('fade-out');
                setTimeout(resolve, 300);
            }, 2500);
        });
    }
    
    /**
     * Show main app
     */
    showApp() {
        this.elements.splash.classList.add('hidden');
        this.elements.app.classList.remove('hidden');
        this.elements.app.classList.add('fade-in');
        this.joinQueue();
    }
    
    /**
     * Join the matching queue
     */
    async joinQueue() {
        try {
            this.updateStatus('Looking for someone...');
            this.logEvent('join_queue');
            
            // Set up disconnect cleanup
            const myQueueRef = this.queueRef.child(this.uid);
            myQueueRef.onDisconnect().remove();
            
            // Add to queue
            await myQueueRef.set({
                uid: this.uid,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Look for existing users
            const snapshot = await this.queueRef.once('value');
            const queueData = snapshot.val();
            
            if (queueData) {
                const otherUsers = Object.keys(queueData).filter(uid => 
                    uid !== this.uid && !this.blockedUsers.includes(uid)
                );
                
                if (otherUsers.length > 0) {
                    const otherUid = otherUsers[0];
                    await this.attemptMatch(otherUid);
                    return;
                }
            }
            
            // Listen for matches
            this.matchRef.on('value', this.handleMatchFound.bind(this));
            
        } catch (error) {
            console.error('Failed to join queue:', error);
            this.updateStatus('Connection failed', 'error');
        }
    }
    
    /**
     * Attempt to match with another user
     */
    async attemptMatch(otherUid) {
        try {
            const roomId = this.generateRoomId();
            
            // Try to reserve the other user
            const otherRef = this.queueRef.child(`${otherUid}/reservedBy`);
            const result = await otherRef.transaction((current) => {
                return current === null ? this.uid : undefined;
            });
            
            if (result.committed) {
                // Successfully reserved, create match
                await this.createMatch(roomId, otherUid);
            } else {
                // Failed to reserve, continue waiting
                this.joinQueue();
            }
        } catch (error) {
            console.error('Match attempt failed:', error);
            this.joinQueue();
        }
    }
    
    /**
     * Create a match between two users
     */
    async createMatch(roomId, otherUid) {
        try {
            const batch = {};
            
            // Set matches
            batch[`matches/${this.uid}`] = roomId;
            batch[`matches/${otherUid}`] = roomId;
            
            // Create room
            batch[`rooms/${roomId}`] = {
                createdBy: this.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                participants: [this.uid, otherUid]
            };
            
            // Remove from queue
            batch[`queue/${this.uid}`] = null;
            batch[`queue/${otherUid}`] = null;
            
            await this.db.ref().update(batch);
            
            this.currentRoom = roomId;
            this.updateDebugInfo();
            
            // Start WebRTC as caller
            await this.startCall(roomId);
            
        } catch (error) {
            console.error('Match creation failed:', error);
            this.joinQueue();
        }
    }
    
    /**
     * Handle match found
     */
    handleMatchFound(snapshot) {
        const roomId = snapshot.val();
        
        if (roomId && roomId !== this.currentRoom) {
            this.currentRoom = roomId;
            this.updateDebugInfo();
            
            // Start WebRTC as callee
            this.answerCall(roomId);
        }
          }
      /**
     * Start a WebRTC call (caller)
     */
    async startCall(roomId) {
        try {
            this.updateStatus('Connecting...');
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.setupPeerConnectionListeners(roomId);
            
            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Create and set offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Send offer to Firebase
            await this.db.ref(`rooms/${roomId}/offer`).set({
                type: offer.type,
                sdp: offer.sdp
            });
            
            // Listen for answer
            this.db.ref(`rooms/${roomId}/answer`).on('value', async (snapshot) => {
                const answer = snapshot.val();
                if (answer && !this.peerConnection.currentRemoteDescription) {
                    await this.peerConnection.setRemoteDescription(answer);
                }
            });
            
            // Listen for callee ICE candidates
            this.db.ref(`rooms/${roomId}/calleeCandidates`).on('child_added', (snapshot) => {
                const candidate = snapshot.val();
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
            
        } catch (error) {
            console.error('Call start failed:', error);
            this.handleConnectionError();
        }
    }
    
    /**
     * Answer a WebRTC call (callee)
     */
    async answerCall(roomId) {
        try {
            this.updateStatus('Connecting...');
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.setupPeerConnectionListeners(roomId);
            
            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Listen for offer
            this.db.ref(`rooms/${roomId}/offer`).on('value', async (snapshot) => {
                const offer = snapshot.val();
                if (offer && !this.peerConnection.currentRemoteDescription) {
                    await this.peerConnection.setRemoteDescription(offer);
                    
                    // Create and set answer
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    
                    // Send answer to Firebase
                    await this.db.ref(`rooms/${roomId}/answer`).set({
                        type: answer.type,
                        sdp: answer.sdp
                    });
                }
            });
            
            // Listen for caller ICE candidates
            this.db.ref(`rooms/${roomId}/callerCandidates`).on('child_added', (snapshot) => {
                const candidate = snapshot.val();
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
            
        } catch (error) {
            console.error('Call answer failed:', error);
            this.handleConnectionError();
        }
    }
    
    /**
     * Set up peer connection event listeners
     */
    setupPeerConnectionListeners(roomId) {
        // ICE candidate handler
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const candidateRef = this.peerConnection.localDescription.type === 'offer' 
                    ? `rooms/${roomId}/callerCandidates`
                    : `rooms/${roomId}/calleeCandidates`;
                    
                this.db.ref(candidateRef).push(event.candidate.toJSON());
            }
        };
        
        // Remote stream handler
        this.peerConnection.ontrack = (event) => {
            console.log('Remote stream received');
            this.remoteStream = event.streams[0];
            this.elements.remoteVideo.srcObject = this.remoteStream;
            this.updateStatus('Connected');
            this.isConnected = true;
            this.logEvent('call_connected');
        };
        
        // Connection state handler
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.updateStatus('Connected');
                    this.isConnected = true;
                    break;
                case 'disconnected':
                    this.updateStatus('Reconnecting...');
                    break;
                case 'failed':
                    this.handleConnectionError();
                    break;
                case 'closed':
                    this.handleCallEnded();
                    break;
            }
        };
        
        // ICE connection state handler
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            
            if (this.peerConnection.iceConnectionState === 'failed') {
                this.handleConnectionError();
            }
        };
    }
    
    /**
     * Handle connection error
     */
    handleConnectionError() {
        console.error('WebRTC connection failed');
        this.updateStatus('Connection failed', 'error');
        this.cleanup();
        
        // Retry after delay
        setTimeout(() => {
            this.joinQueue();
        }, 2000);
    }
    
    /**
     * Handle call ended
     */
    handleCallEnded() {
        this.updateStatus('Call ended');
        this.isConnected = false;
        this.cleanup();
        
        // Auto-rejoin queue
        setTimeout(() => {
            this.joinQueue();
        }, 1000);
    }
    
    /**
     * Toggle microphone
     */
    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMicOn = audioTrack.enabled;
                this.updateMicButton();
            }
        }
    }
    
    /**
     * Toggle camera
     */
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isCameraOn = videoTrack.enabled;
                this.updateCameraButton();
            }
        }
    }
    
    /**
     * Handle like button
     */
    async handleLike() {
        if (!this.currentRoom) return;
        
        try {
            // Animate button
            this.elements.likeBtn.style.transform = 'scale(1.2)';
            setTimeout(() => {
                this.elements.likeBtn.style.transform = '';
            }, 200);
            
            // Record feedback
            await this.db.ref(`feedback/${this.currentRoom}/${this.uid}`).set({
                liked: 1,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            
            this.logEvent('like');
            
        } catch (error) {
            console.error('Like failed:', error);
        }
    }
    
    /**
     * Handle dislike button
     */
    async handleDislike() {
        if (!this.currentRoom) return;
        
        try {
            // Record feedback
            await this.db.ref(`feedback/${this.currentRoom}/${this.uid}`).set({
                liked: 0,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            
            this.logEvent('dislike');
            this.handleNext();
            
        } catch (error) {
            console.error('Dislike failed:', error);
        }
    }
    
    /**
     * Handle report button
     */
    async handleReport() {
        if (!this.currentRoom) return;
        
        try {
            const participants = await this.getCurrentRoomParticipants();
            const targetUid = participants.find(uid => uid !== this.uid);
            
            if (targetUid) {
                // Increment report count
                const reportRef = this.db.ref(`reports/${targetUid}`);
                await reportRef.transaction((current) => (current || 0) + 1);
                
                // Add to blocked list
                this.addToBlockedUsers(targetUid);
                
                this.logEvent('report');
                this.handleNext();
            }
            
        } catch (error) {
            console.error('Report failed:', error);
        }
    }
    
    /**
     * Handle next/skip button
     */
    handleNext() {
        this.logEvent('skip');
        this.cleanup();
        
        // Debounce rejoin to prevent rapid skipping
        clearTimeout(this.matchTimeout);
        this.matchTimeout = setTimeout(() => {
            this.joinQueue();
        }, 500);
    }
    
    /**
     * Show premium modal
     */
    showPremiumModal() {
        // Placeholder for premium features modal
        alert('Premium features coming soon!\n\n- Priority matching\n- Remove ads\n- HD video\n- Advanced filters');
        this.logEvent('premium_click');
    }
    
    /**
     * Clean up current connection
     */
    cleanup() {
        // Clean up peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Clean up remote video
        if (this.elements.remoteVideo.srcObject) {
            this.elements.remoteVideo.srcObject = null;
        }
        
        // Clean up Firebase listeners
        if (this.matchRef) {
            this.matchRef.off();
        }
        
        if (this.currentRoom) {
            this.db.ref(`rooms/${this.currentRoom}`).off();
            this.db.ref(`matches/${this.uid}`).remove();
            this.currentRoom = null;
        }
        
        // Remove from queue
        this.queueRef.child(this.uid).remove();
        
        this.isConnected = false;
        this.updateDebugInfo();
    }
    
    /**
     * Update microphone button state
     */
    updateMicButton() {
        const micOn = this.elements.micBtn.querySelector('.mic-on');
        const micOff = this.elements.micBtn.querySelector('.mic-off');
        
        if (this.isMicOn) {
            micOn.classList.remove('hidden');
            micOff.classList.add('hidden');
            this.elements.micBtn.classList.remove('inactive');
        } else {
            micOn.classList.add('hidden');
            micOff.classList.remove('hidden');
            this.elements.micBtn.classList.add('inactive');
        }
    }
    
    /**
     * Update camera button state
     */
    updateCameraButton() {
        const cameraOn = this.elements.cameraBtn.querySelector('.camera-on');
        const cameraOff = this.elements.cameraBtn.querySelector('.camera-off');
        
        if (this.isCameraOn) {
            cameraOn.classList.remove('hidden');
            cameraOff.classList.add('hidden');
            this.elements.cameraBtn.classList.remove('inactive');
        } else {
            cameraOn.classList.add('hidden');
            cameraOff.classList.remove('hidden');
            this.elements.cameraBtn.classList.add('inactive');
        }
    }
    
    /**
     * Update status text
     */
    updateStatus(text, type = 'info') {
        this.elements.status.textContent = text;
        this.elements.status.className = `status ${type}`;
    }
    
    /**
     * Update debug information
     */
    updateDebugInfo() {
        if (this.elements.debugInfo) {
            this.elements.debugInfo.innerHTML = `
                <div>UID: ${this.uid}</div>
                <div>Room: ${this.currentRoom || 'None'}</div>
                <div>Connected: ${this.isConnected}</div>
                <div>Peer State: ${this.peerConnection?.connectionState || 'None'}</div>
                <div>ICE State: ${this.peerConnection?.iceConnectionState || 'None'}</div>
            `;
        }
    }
    
    /**
     * Get current room participants
     */
    async getCurrentRoomParticipants() {
        if (!this.currentRoom) return [];
        
        try {
            const snapshot = await this.db.ref(`rooms/${this.currentRoom}/participants`).once('value');
            return snapshot.val() || [];
        } catch (error) {
            console.error('Failed to get participants:', error);
            return [];
        }
    }
    
    /**
     * Add user to blocked list
     */
    addToBlockedUsers(uid) {
        if (!this.blockedUsers.includes(uid)) {
            this.blockedUsers.push(uid);
            localStorage.setItem('vibe_blocked_users', JSON.stringify(this.blockedUsers));
        }
    }
    
    /**
     * Get blocked users list
     */
    getBlockedUsers() {
        try {
            const blocked = localStorage.getItem('vibe_blocked_users');
            return blocked ? JSON.parse(blocked) : [];
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Log analytics event
     */
    async logEvent(event, data = {}) {
        try {
            await this.db.ref(`events/${this.uid}/${Date.now()}`).set({
                event,
                data,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Event logging failed:', error);
        }
    }
    
    /**
     * Handle online event
     */
    handleOnline() {
        console.log('App came online');
        if (!this.isConnected && !this.currentRoom) {
            this.joinQueue();
        }
    }
    
    /**
     * Handle offline event
     */
    handleOffline() {
        console.log('App went offline');
        this.updateStatus('Offline', 'error');
    }
    
    /**
     * Generate unique user ID
     */
    generateUID() {
        let uid = localStorage.getItem('vibe_uid');
        if (!uid) {
            uid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
            localStorage.setItem('vibe_uid', uid);
        }
        return uid;
    }
    
    /**
     * Generate room ID
     */
    generateRoomId() {
        return 'room_' + Math.random().toString(36).substr(2, 9) + Date.now();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.vibeApp = new VibeApp();
});

// Export for debugging
window.VibeApp = VibeApp;

             
             
             
