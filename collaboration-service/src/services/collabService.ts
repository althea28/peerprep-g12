import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import redisClient from '../config/redis';
import * as sessionService from './sessionService';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 mins (F11.6)
const IDLE_WARNING_MS = 30 * 1000; // 30 s to respond (F11.6.2)
const CODE_SAVE_INTERVAL_MS = 5000; // save code every 5 seconds (F11.4.2)

// track idle timers per session
const idleTimers: Map<string, NodeJS.Timeout> = new Map();
const idleWarningTimers: Map<string, NodeJS.Timeout> = new Map();

export const initCollabService = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // user joins a collaboration room
    socket.on('join-session', async ({ sessionId, userId }) => {
      try {
        const session = await sessionService.getSessionById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // verify user is a participant
        if (session.user1_id !== userId && session.user2_id !== userId) {
          socket.emit('error', { message: 'Unauthorised access to session' });
          return;
        }

        // join Socket.io room
        socket.join(sessionId);
        socket.data.sessionId = sessionId;
        socket.data.userId = userId;

        // restore latest code state from Redis (F11.2.3)
        const savedCode = await redisClient.get(`session:${sessionId}:code`);
        if (savedCode) {
          socket.emit('code-restored', { code: savedCode });
        }

        // notify partner that user has joined
        socket.to(sessionId).emit('user-joined', { userId });

        // start idle timer
        resetIdleTimer(io, sessionId);

        console.log(`User ${userId} joined session ${sessionId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Yjs code update: broadcast to other user in room (F11.4.1)
    socket.on('yjs-update', async ({ sessionId, update, code }) => {
      // broadcast to other user
      socket.to(sessionId).emit('yjs-update', { update });

      // save latest code to redis
      await redisClient.set(`session:${sessionId}:code`, code);

      // reset idle timer on activity
      resetIdleTimer(io, sessionId);
    });

    // user ends session (F11.5)
    socket.on('end-session', async ({ sessionId, userId }) => {
      try {
        await sessionService.endSession(sessionId);

        // clear idle timers
        clearIdleTimers(sessionId);

        // notify partner (F11.5.1)
        socket.to(sessionId).emit('session-ended', {
          message: 'Your partner has ended the session.',
          endedBy: userId,
        });

        // remove user from room immediately (F11.5.2)
        socket.leave(sessionId);

        console.log(`Session ${sessionId} ended by ${userId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to end session' });
      }
    });

    // partner confirmed session end (F11.5.2)
    socket.on('confirm-session-end', ({ sessionId }) => {
      socket.leave(sessionId);
    });

    // unexpected disconnection (F11.2.2)
    socket.on('disconnect', async () => {
      const { sessionId, userId } = socket.data;
      if (sessionId && userId) {
        socket.to(sessionId).emit('user-disconnected', { userId });
        console.log(`User ${userId} disconnected from session ${sessionId}`);
      }
    });
  });

  return io;
};

// reset idle timer for a session (F11.6.1)
const resetIdleTimer = (io: Server, sessionId: string) => {
  // clear existing timers
  clearIdleTimers(sessionId);

  // set new idle timer
  const timer = setTimeout(async () => {
    // prompt both users after 10 min idle
    io.to(sessionId).emit('idle-warning', {
      message: 'You have been idle for 10 minutes. Do you want to continue?',
    });

    // no response in 30s - end session (F11.6.2)
    const warningTimer = setTimeout(async () => {
      const session = await sessionService.getSessionById(sessionId);
      if (session && session.status === 'active') {
        await sessionService.endSession(sessionId);
        io.to(sessionId).emit('session-ended', {
          message: 'Session ended due to inactivity.',
        });
        console.log(`Session ${sessionId} ended due to inactivity`);
      }
    }, IDLE_WARNING_MS);

    idleWarningTimers.set(sessionId, warningTimer);
  }, IDLE_TIMEOUT_MS);

  idleTimers.set(sessionId, timer);
};

const clearIdleTimers = (sessionId: string) => {
  const timer = idleTimers.get(sessionId);
  const warningTimer = idleWarningTimers.get(sessionId);
  if (timer) { clearTimeout(timer); idleTimers.delete(sessionId); }
  if (warningTimer) { clearTimeout(warningTimer); idleWarningTimers.delete(sessionId); }
};