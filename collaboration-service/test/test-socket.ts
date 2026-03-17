// import { io } from 'socket.io-client';

// const socket = io('http://localhost:3003');

// socket.on('connect', () => {
//   console.log('Connected! Socket ID:', socket.id);

//   socket.emit('join-session', {
//     sessionId: 'f650feb6-87c3-4648-bfe4-d924706374dd',
//     userId: '00000000-0000-0000-0000-000000000001',
//   });
// });

// socket.on('code-restored', (data: any) => console.log('Code restored:', data));
// socket.on('user-joined', (data: any) => console.log('User joined:', data));
// socket.on('error', (data: any) => console.log('Error:', data));

// setTimeout(() => {
//   console.log('Done testing');
//   socket.disconnect();
//   process.exit(0);
// }, 3000);

import { io } from 'socket.io-client';

const SESSION_ID = 'f650feb6-87c3-4648-bfe4-d924706374dd';
const USER1_ID = '00000000-0000-0000-0000-000000000001';
const USER2_ID = '00000000-0000-0000-0000-000000000002';

// Simulate User 1
const socket1 = io('http://localhost:3003');
// Simulate User 2
const socket2 = io('http://localhost:3003');

socket1.on('connect', () => {
  console.log('User1 connected:', socket1.id);
  socket1.emit('join-session', { sessionId: SESSION_ID, userId: USER1_ID });
});

socket2.on('connect', () => {
  console.log('User2 connected:', socket2.id);
  socket2.emit('join-session', { sessionId: SESSION_ID, userId: USER2_ID });
});

// User2 should receive this when User1 joins
socket2.on('user-joined', (data) => console.log('User2 sees user-joined:', data));

// Test code sync after both connected
setTimeout(() => {
  console.log('\n--- Testing code sync ---');
  socket1.emit('yjs-update', {
    sessionId: SESSION_ID,
    update: 'mock-yjs-update',
    code: 'print("hello world")',
  });
}, 1000);

// User2 should receive the code update
socket2.on('yjs-update', (data) => console.log('User2 received code update:', data));

// Test session end after 2 seconds
setTimeout(() => {
  console.log('\n--- Testing session end ---');
  socket1.emit('end-session', { sessionId: SESSION_ID, userId: USER1_ID });
}, 2000);

// User2 should be notified
socket2.on('session-ended', (data) => console.log('User2 notified of session end:', data));

setTimeout(() => {
  console.log('\nDone testing');
  socket1.disconnect();
  socket2.disconnect();
  process.exit(0);
}, 4000);