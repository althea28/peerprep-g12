// updated idle timers for the test
import { io } from 'socket.io-client';

const SESSION_ID = '291154f0-083d-44d6-9bd8-23961ebff2c8';
const USER1_ID = 'a9261639-ad11-45d9-8ac1-5f3873f83acf';
const USER2_ID = '3b3e83f2-480d-41ce-93a0-162c9bf2462b';

console.log('=== Collaboration Service Full Socket.io Test ===\n');

const socket1 = io('http://localhost:3003');
const socket2 = io('http://localhost:3003');

// --- Setup listeners ---
socket1.on('user-joined', (data) => console.log('User1 sees partner joined:', data));
socket2.on('user-joined', (data) => console.log('User2 sees partner joined:', data));
socket2.on('yjs-update', (data) => console.log('User2 received code update:', data));
socket1.on('yjs-update', (data) => console.log('User1 received code update:', data));
socket2.on('user-disconnected', (data) => console.log('User2 notified of disconnect:', data));
socket1.on('session-ended', (data) => console.log('User1 session-ended event:', data));
socket2.on('session-ended', (data) => console.log('User2 session-ended event:', data));
socket1.on('idle-warning', (data) => console.log('User1 idle warning:', data));
socket2.on('idle-warning', (data) => console.log('User2 idle warning:', data));
socket1.on('code-restored', (data) => console.log('User1 code restored from Redis:', data));
socket2.on('code-restored', (data) => console.log('User2 code restored from Redis:', data));
socket1.on('error', (data) => console.log('User1 error:', data));
socket2.on('error', (data) => console.log('User2 error:', data));

// --- Test 1: Both users join ---
socket1.on('connect', () => {
  console.log('--- Test 1: Both users join session ---');
  socket1.emit('join-session', { sessionId: SESSION_ID, userId: USER1_ID });
});

socket2.on('connect', () => {
  socket2.emit('join-session', { sessionId: SESSION_ID, userId: USER2_ID });
});

// --- Test 2: Code sync between users ---
setTimeout(() => {
  console.log('\n--- Test 2: User1 sends code update ---');
  socket1.emit('yjs-update', {
    sessionId: SESSION_ID,
    update: 'mock-u1',
    code: 'print("from user1")',
  });
}, 1500);

setTimeout(() => {
  console.log('--- Test 2: User2 sends code update ---');
  socket2.emit('yjs-update', {
    sessionId: SESSION_ID,
    update: 'mock-u2',
    code: 'print("from user2 - should be in Redis")',
  });
}, 2500);

// --- Test 3: Wait for Supabase save (5s interval) ---
setTimeout(() => {
  console.log('\n--- Test 3: Waiting for Supabase code save (check DB now) ---');
}, 8000);

// --- Test 4: User1 disconnects, User2 notified, timers persist ---
setTimeout(() => {
  console.log('\n--- Test 4: User1 disconnects ---');
  socket1.disconnect();
}, 9000);

// --- Test 5: User2 disconnects, room empty, timers cleared ---
setTimeout(() => {
  console.log('\n--- Test 5: User2 disconnects, room now empty ---');
  console.log('Check server logs for "All users left session" message');
  socket2.disconnect();
}, 10000);

// --- Test 6: User1 rejoins, code restored from Redis ---
setTimeout(() => {
  console.log('\n--- Test 6: User1 rejoins, expects code restored from Redis ---');
  const socket3 = io('http://localhost:3003');
  socket3.on('connect', () => {
    socket3.emit('join-session', { sessionId: SESSION_ID, userId: USER1_ID });
  });
  socket3.on('code-restored', (data) => {
    console.log('Code restored from Redis:', data);
    socket3.disconnect();
  });
}, 11000);

// --- Test 7: Idle timeout (needs IDLE_TIMEOUT_MS = 10000, IDLE_WARNING_MS = 5000) ---
setTimeout(() => {
  console.log('\n--- Test 7: Rejoining to test idle timeout ---');
  console.log('No activity for 10s → idle warning, then 5s → session ends');
  const socket4 = io('http://localhost:3003');
  const socket5 = io('http://localhost:3003');

  socket4.on('connect', () => {
    socket4.emit('join-session', { sessionId: SESSION_ID, userId: USER1_ID });
  });
  socket5.on('connect', () => {
    socket5.emit('join-session', { sessionId: SESSION_ID, userId: USER2_ID });
  });

  socket4.on('idle-warning', (data) => console.log('Socket4 idle warning:', data));
  socket5.on('idle-warning', (data) => console.log('Socket5 idle warning:', data));
  socket4.on('session-ended', (data) => {
    console.log('Socket4 session ended (idle):', data);
    socket4.disconnect();
    socket5.disconnect();
  });
  socket5.on('session-ended', (data) => console.log('Socket5 session ended (idle):', data));
}, 13000);

// --- Done ---
setTimeout(() => {
  console.log('\n=== All tests complete ===');
  process.exit(0);
}, 35000);