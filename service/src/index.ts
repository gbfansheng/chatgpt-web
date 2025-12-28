import express from 'express'
import type { RequestProps } from './types'
import { chatConfig, chatReplyProcess, currentModel } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
import * as db from './db'

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
    const { prompt, options = {}, systemMessage, temperature, top_p, gpt_model, images, conversationHistory, tools, tool_choice } = req.body as RequestProps
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
    const messages = db.getMessages(uuid, req.user.userId)
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
    const { role, content, images, thinking } = req.body
    db.addMessage(uuid, req.user.userId, role, content, images, thinking)
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

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
