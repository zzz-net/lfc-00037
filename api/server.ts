/**
 * local server entry file, for local development
 */
import app from './app.js';
import { checkAllEscalations } from './data/store.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  const escalatedCount = checkAllEscalations();
  if (escalatedCount > 0) {
    console.log(`[Escalation] 服务启动后已自动触发 ${escalatedCount} 条超时工单的催办升级`);
  }
  console.log(`Server ready on port ${PORT}`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;