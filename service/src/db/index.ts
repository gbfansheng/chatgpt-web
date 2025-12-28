import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const dbPath = path.join(__dirname, '../../data/chat.db')
let db: SqlJsDatabase

// 保存数据库到文件
const saveDb = () => {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

// 初始化数据库
export const initDb = async () => {
  const SQL = await initSqlJs()
  
  // 确保目录存在
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  
  // 加载或创建数据库
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // 初始化表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT DEFAULT '新对话',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_uuid TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      images TEXT,
      files TEXT,
      thinking TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_uuid) REFERENCES conversations(uuid)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(conversation_uuid);
  `)
  saveDb()
  return db
}

// 辅助函数：执行查询返回所有行
const all = (sql: string, params: any[] = []) => {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// 辅助函数：执行查询返回单行
const get = (sql: string, params: any[] = []) => {
  const rows = all(sql, params)
  return rows[0] || null
}

// 辅助函数：执行写操作
const run = (sql: string, params: any[] = []) => {
  db.run(sql, params)
  saveDb()
}

// 密码哈希
const hashPassword = (password: string) => crypto.createHash('sha256').update(password).digest('hex')

// JWT
const JWT_SECRET = process.env.JWT_SECRET || 'chatgpt-web-secret-key'
export const generateToken = (userId: number, username: string) => {
  const payload = Buffer.from(JSON.stringify({ userId, username, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex')
  return `${payload}.${signature}`
}

export const verifyToken = (token: string): { userId: number; username: string } | null => {
  try {
    const [payload, signature] = token.split('.')
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex')
    if (signature !== expectedSig) return null
    const data = JSON.parse(Buffer.from(payload, 'base64').toString())
    if (data.exp < Date.now()) return null
    return { userId: data.userId, username: data.username }
  } catch { return null }
}

// 用户操作
export interface User { id: number; username: string; created_at: string }

export const createUser = (username: string, password: string): User | null => {
  try {
    run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashPassword(password)])
    return get('SELECT id, username, created_at FROM users WHERE username = ?', [username]) as User
  } catch { return null }
}

export const loginUser = (username: string, password: string): User | null => {
  const user = get('SELECT * FROM users WHERE username = ? AND password_hash = ?', [username, hashPassword(password)])
  return user ? { id: user.id, username: user.username, created_at: user.created_at } : null
}

// 对话操作
export interface Conversation { id: number; uuid: string; user_id: number; title: string; created_at: string; updated_at: string }

export const getConversations = (userId: number) => 
  all('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC', [userId]) as Conversation[]

export const getConversation = (uuid: string, userId: number) =>
  get('SELECT * FROM conversations WHERE uuid = ? AND user_id = ?', [uuid, userId]) as Conversation | null

export const createConversation = (uuid: string, userId: number, title = '新对话') => {
  run('INSERT INTO conversations (uuid, user_id, title) VALUES (?, ?, ?)', [uuid, userId, title])
  return getConversation(uuid, userId)
}

export const updateConversationTitle = (uuid: string, userId: number, title: string) =>
  run('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ? AND user_id = ?', [title, uuid, userId])

export const deleteConversation = (uuid: string, userId: number) => {
  const conv = getConversation(uuid, userId)
  if (!conv) return false
  run('DELETE FROM messages WHERE conversation_uuid = ?', [uuid])
  run('DELETE FROM conversations WHERE uuid = ?', [uuid])
  return true
}

// 消息操作
export interface Message { id: number; conversation_uuid: string; role: string; content: string; images?: string; files?: string; thinking?: string; created_at: string }

export const getMessages = (uuid: string, userId: number) => {
  if (!getConversation(uuid, userId)) return []
  return all('SELECT * FROM messages WHERE conversation_uuid = ? ORDER BY created_at', [uuid]) as Message[]
}

export const addMessage = (uuid: string, userId: number, role: string, content: string, images?: string[], files?: any[], thinking?: string) => {
  if (!getConversation(uuid, userId))
    createConversation(uuid, userId)
  run('INSERT INTO messages (conversation_uuid, role, content, images, files, thinking) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid, role, content, images ? JSON.stringify(images) : null, files ? JSON.stringify(files) : null, thinking || null])
  run('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE uuid = ?', [uuid])
}

export const clearMessages = (uuid: string, userId: number) => {
  if (!getConversation(uuid, userId)) return
  run('DELETE FROM messages WHERE conversation_uuid = ?', [uuid])
}

export const getDb = () => db
