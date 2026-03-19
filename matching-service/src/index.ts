import { createServer } from 'http';
import { Server } from 'socket.io';
import express, { type Request, type Response } from 'express';
import { MatchingService } from './services/matchingService.js';
import { RedisService } from './services/redisService.js';
import { QuestionService } from './services/questionService.js';
import {
  ActionFlowStatus,
  MatchResponseStatus,
  WebSocketEventType,
  type CancelRequestPayload,
  type ConfirmRequestPayload,
  type MatchRequestPayload
} from './types/matchingEvents.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:4000', // assuming frontend runs on port 4000
    methods: '*'
  }
});

const redisService = new RedisService();
const collaborationServiceBaseUrl = process.env.COLLABORATION_SERVICE_URL ?? 'http://collaboration-service:3003';
const questionServiceBaseUrl = process.env.QUESTION_SERVICE_URL ?? 'http://question-service:3001';
const questionService = new QuestionService(questionServiceBaseUrl);
const matchingService = new MatchingService(io, redisService, questionService, collaborationServiceBaseUrl);

app.use(express.json());

const PORT = Number(process.env.PORT ?? 3002);

// Health check
app.get('/', (_req: Request, res: Response) => {
  res.send('Matching Service is running');
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(WebSocketEventType.MATCH_REQUEST, async (payload: MatchRequestPayload) => {
    try {
      await matchingService.handleMatchRequest(socket, payload);
    } catch (error) {
      console.error('Failed to process MATCH_REQUEST', error);
      socket.emit(WebSocketEventType.MATCH_RESPONSE, {
        status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
        flowStatus: ActionFlowStatus.TERMINATED,
        message: 'Unable to process match request.'
      });
    }
  });

  socket.on(WebSocketEventType.CANCEL_REQUEST, async (payload: CancelRequestPayload) => {
    try {
      await matchingService.handleCancelRequest(socket, payload);
    } catch (error) {
      console.error('Failed to process CANCEL_REQUEST', error);
      socket.emit(WebSocketEventType.CANCEL_RESPONSE, {
        status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
        flowStatus: ActionFlowStatus.TERMINATED,
        message: 'Unable to process cancel request.'
      });
    }
  });

  socket.on(WebSocketEventType.CONFIRM_REQUEST, async (payload: ConfirmRequestPayload) => {
    try {
      await matchingService.handleConfirmRequest(socket, payload);
    } catch (error) {
      console.error('Failed to process CONFIRM_REQUEST', error);
      socket.emit(WebSocketEventType.MATCH_RESPONSE, {
        status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
        flowStatus: ActionFlowStatus.TERMINATED,
        message: 'Unable to process confirmation request.'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    matchingService.handleSocketDisconnect(socket.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', async () => {
  await redisService.connect();
  console.log(`Matching Service listening on http://localhost:${PORT}`);
});