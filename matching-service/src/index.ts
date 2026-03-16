import express, { type Request, type Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3002;

// Health check
app.get('/', (req: Request, res: Response) => {
  res.send('Matching Service is running');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Matching Service listening on http://localhost:${PORT}`);
});