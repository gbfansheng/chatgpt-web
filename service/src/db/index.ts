import Database from 'better-sqlite3'
import path from 'path'
import crypto from 'crypto'

const db = new Database(path.join(__dirname, '../../data/chat.db'))

// 初始化表
db.exec(`
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

// 密码哈希
const hashPassword = (password: string) => crypto.createHash('sha256').update(password).digest('hex')

// 生成 JWT (简单实现)
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
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password))
    return db.prepare('SELECT id, username, created_at FROM users WHERE username = ?').get(username) as User
  } catch { return null }
}

export const loginUser = (username: string, password: string): User | null => {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').get(username, hashPassword(password)) as any
  return user ? { id: user.id, username: user.username, created_at: user.created_at } : null
}

// 对话操作 (带用户隔离)
export interface Conversation { id: number; uuid: string; user_id: number; title: string; created_at: string; updated_at: string }

export const getConversations = (userId: number) => 
  db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as Conversation[]

export const getConversation = (uuid: string, userId: number) =>
  db.prepare('SELECT * FROM conversations WHERE uuid = ? AND user_id = ?').get(uuid, userId) as Conversation | undefined

export const createConversation = (uuid: string, userId: number, title = '新对话') => {
  db.prepare('INSERT INTO conversations (uuid, user_id, title) VALUES (?, ?, ?)').run(uuid, userId, title)
  return getConversation(uuid, userId)
}

export const updateConversationTitle = (uuid: string, userId: number, title: string) =>
  db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ? AND user_id = ?').run(title, uuid, userId)

export const deleteConversation = (uuid: string, userId: number) => {
  const conv = getConversation(uuid, userId)
  if (!conv) return false
  db.prepare('DELETE FROM messages WHERE conversation_uuid = ?').run(uuid)
  db.prepare('DELETE FROM conversations WHERE uuid = ?').run(uuid)
  return true
}

// 消息操作
export interface Message { id: number; conversation_uuid: string; role: string; content: string; images?: string; files?: string; thinking?: string; created_at: string }

export const getMessages = (uuid: string, userId: number) => {
  if (!getConversation(uuid, userId)) return []
  return db.prepare('SELECT * FROM messages WHERE conversation_uuid = ? ORDER BY created_at').all(uuid) as Message[]
}

export const addMessage = (uuid: string, userId: number, role: string, content: string, images?: string[], files?: any[], thinking?: string) => {
  if (!getConversation(uuid, userId))
    createConversation(uuid, userId)
  db.prepare('INSERT INTO messages (conversation_uuid, role, content, images, files, thinking) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid, role, content, images ? JSON.stringify(images) : null, files ? JSON.stringify(files) : null, thinking || null)
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE uuid = ?').run(uuid)
}

export const clearMessages = (uuid: string, userId: number) => {
  if (!getConversation(uuid, userId)) return
  db.prepare('DELETE FROM messages WHERE conversation_uuid = ?').run(uuid)
}

export default db
