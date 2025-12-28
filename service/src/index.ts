import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import type { RequestProps } from './types'
import { chatConfig, chatReplyProcess, currentModel } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
import * as db from './db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FILES_DIR = path.join(__dirname, '../data/files')
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true })

// 保存图片到磁盘
function saveImageToDisk(dataUrl: string) {
  const hash = crypto.createHash('md5').update(dataUrl).digest('hex')
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match ? `.${match[1]}` : '.png'
  const filename = `${hash}${ext}`
  const filepath = path.join(FILES_DIR, filename)
  if (!fs.existsSync(filepath)) {
    const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '')
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'))
  }
  return filename
}

// 从磁盘加载图片
function loadImageFromDisk(filename: string) {
  const filepath = path.join(FILES_DIR, filename)
  if (!fs.existsSync(filepath)) return null
  const data = fs.readFileSync(filepath)
  const ext = path.extname(filename).slice(1) || 'png'
  return `data:image/${ext};base64,${data.toString('base64')}`
}

// 保存文件到磁盘，返回文件信息（不含 data）
function saveFileToDisk(file: { name: string; type: string; data: string }) {
  const hash = crypto.createHash('md5').update(file.data).digest('hex')
  const ext = path.extname(file.name) || ''
  const filename = `${hash}${ext}`
  const filepath = path.join(FILES_DIR, filename)
  if (!fs.existsSync(filepath)) {
    const base64Data = file.data.replace(/^data:[^;]+;base64,/, '')
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'))
  }
  return { name: file.name, type: file.type, path: filename }
}

// 从磁盘读取文件，返回完整 data
function loadFileFromDisk(file: { name: string; type: string; path: string }) {
  const filepath = path.join(FILES_DIR, file.path)
  if (!fs.existsSync(filepath)) return null
  const data = fs.readFileSync(filepath)
  const base64 = `data:${file.type};base64,${data.toString('base64')}`
  return { name: file.name, type: file.type, data: base64 }
}

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json({ limit: '50mb' }))

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

// JWT 认证中间件
const jwtAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).send({ status: 'Fail', message: '未登录' })
  const user = db.verifyToken(token)
  if (!user) return res.status(401).send({ status: 'Fail', message: 'Token无效或已过期' })
  req.user = user
  next()
}

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, options = {}, systemMessage, temperature, top_p, gpt_model, images, files, conversationHistory, tools, tool_choice } = req.body as RequestProps
    let firstChunk = true
    await chatReplyProcess({
      message: prompt,
      lastContext: options,
      process: (chat: any) => {
        res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
        firstChunk = false
      },
      systemMessage,
      temperature,
      top_p,
      gpt_model,
      images,
      files,
      conversationHistory,
      tools,
      tool_choice,
    })
  }
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})

router.post('/config', auth, async (req, res) => {
  try {
    const response = await chatConfig()
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/session', async (req, res) => {
  try {
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = isNotEmptyString(AUTH_SECRET_KEY)
    res.send({ status: 'Success', message: '', data: { auth: hasAuth, model: currentModel() } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')

    if (process.env.AUTH_SECRET_KEY !== token)
      throw new Error('密钥无效 | Secret key is invalid')

    res.send({ status: 'Success', message: 'Verify successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// 用户注册登录 API
router.post('/user/register', async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body
    if (inviteCode !== 'chatgpt9832') throw new Error('邀请码有误')
    if (!username || !password) throw new Error('用户名和密码不能为空')
    if (username.length < 3) throw new Error('用户名至少3个字符')
    if (password.length < 6) throw new Error('密码至少6个字符')
    const user = db.createUser(username, password)
    if (!user) throw new Error('用户名已存在')
    const token = db.generateToken(user.id, user.username)
    res.send({ status: 'Success', data: { user, token } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.post('/user/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) throw new Error('用户名和密码不能为空')
    const user = db.loginUser(username, password)
    if (!user) throw new Error('用户名或密码错误')
    const token = db.generateToken(user.id, user.username)
    res.send({ status: 'Success', data: { user, token } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.get('/user/info', jwtAuth, async (req: any, res) => {
  res.send({ status: 'Success', data: req.user })
})

// 聊天记录 API (需要登录)
router.get('/conversations', jwtAuth, async (req: any, res) => {
  try {
    const conversations = db.getConversations(req.user.userId)
    res.send({ status: 'Success', data: conversations })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.get('/conversations/:uuid', jwtAuth, async (req: any, res) => {
  try {
    const { uuid } = req.params
    const conversation = db.getConversation(uuid, req.user.userId)
    const messages = db.getMessages(uuid, req.user.userId).map((msg: any) => {
      // 从磁盘加载图片
      if (msg.images) {
        const images = JSON.parse(msg.images)
        msg.images = JSON.stringify(images.map(loadImageFromDisk).filter(Boolean))
      }
      // 从磁盘加载文件
      if (msg.files) {
        const files = JSON.parse(msg.files)
        msg.files = JSON.stringify(files.map(loadFileFromDisk).filter(Boolean))
      }
      return msg
    })
    res.send({ status: 'Success', data: { conversation, messages } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.post('/conversations', jwtAuth, async (req: any, res) => {
  try {
    const { uuid, title } = req.body
    const conversation = db.createConversation(uuid, req.user.userId, title)
    res.send({ status: 'Success', data: conversation })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.put('/conversations/:uuid', jwtAuth, async (req: any, res) => {
  try {
    const { uuid } = req.params
    const { title } = req.body
    db.updateConversationTitle(uuid, req.user.userId, title)
    res.send({ status: 'Success' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.delete('/conversations/:uuid', jwtAuth, async (req: any, res) => {
  try {
    const { uuid } = req.params
    db.deleteConversation(uuid, req.user.userId)
    res.send({ status: 'Success' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.post('/conversations/:uuid/messages', jwtAuth, async (req: any, res) => {
  try {
    const { uuid } = req.params
    const { role, content, images, files, thinking } = req.body
    // 图片和文件都保存到磁盘
    const savedImages = images?.map(saveImageToDisk)
    const savedFiles = files?.map(saveFileToDisk)
    db.addMessage(uuid, req.user.userId, role, content, savedImages, savedFiles, thinking)
    res.send({ status: 'Success' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

router.delete('/conversations/:uuid/messages', jwtAuth, async (req: any, res) => {
  try {
    const { uuid } = req.params
    db.clearMessages(uuid, req.user.userId)
    res.send({ status: 'Success' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message })
  }
})

app.use('', router)
app.use('/api', router)
app.set('trust proxy', 1)

// 异步启动，等待数据库初始化
db.initDb().then(() => {
  app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
