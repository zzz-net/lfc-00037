import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import ticketRoutes from './routes/tickets.js'
import assetRoutes from './routes/assets.js'
import priorityRoutes from './routes/priorities.js'
import exportRoutes from './routes/export.js'
import { getTechnicians } from './data/store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/tickets', ticketRoutes)
app.use('/api/assets', assetRoutes)
app.use('/api/priorities', priorityRoutes)
app.use('/api/export', exportRoutes)

app.get('/api/technicians', (req: Request, res: Response): void => {
  const technicians = getTechnicians()
  res.json({ success: true, data: { technicians } })
})

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API 不存在',
  })
})

export default app
