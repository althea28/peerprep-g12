import { io } from 'socket.io-client';

const SESSION_ID = '291154f0-083d-44d6-9bd8-23961ebff2c8';
const USER1_ID = 'a9261639-ad11-45d9-8ac1-5f3873f83acf';
const USER2_ID = '3b3e83f2-480d-41ce-93a0-162c9bf2462b';

const socket1 = io('http://localhost:3003');
const socket2 = io('http://localhost:3003');

socket1.on('connect', () => {
  console.log('User1 connected:', socket1.id);
  socket1.emit('join-session', { sessionId: SESSION_ID, userId: USER1_ID });
});

socket2.on('connect', () => {
  console.log('User2 connected:', socket2.id);
  socket2.emit('join-session', { sessionId: SESSION_ID, userId: USER2_ID });
});

socket2.on('user-joined', (data) => console.log('User2 sees user-joined:', data));
socket1.on('user-joined', (data) => console.log('User1 sees user-joined:', data));

// test code sync
setTimeout(() => {
  console.log('\n--- Testing code sync ---');
  socket1.emit('yjs-update', {
    sessionId: SESSION_ID,
    update: 'mock-yjs-update',
    code: 'print("hello from user1")',
  });
}, 1000);

socket2.on('yjs-update', (data) => console.log('User2 received code update:', data));

// test session end
setTimeout(() => {
  console.log('\n--- Testing session end ---');
  socket1.emit('end-session', { sessionId: SESSION_ID, userId: USER1_ID });
}, 2000);

socket2.on('session-ended', (data) => console.log('User2 notified of session end:', data));

// test disconnect notification - disconnect user1 abruptly
setTimeout(() => {
  console.log('\n--- Testing disconnect notification ---');
  socket1.disconnect();
}, 4000);

socket2.on('user-disconnected', (data) => console.log('User2 notified of disconnect:', data));

setTimeout(() => {
  console.log('\nDone!');
  socket2.disconnect();
  process.exit(0);
}, 6000);