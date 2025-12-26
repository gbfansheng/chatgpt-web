# ChatGPT Web 重构计划

## 目标
移除 `chatgpt` 依赖，重构为原生实现，支持现代 AI 对话功能。

## 已完成
- ✅ 移除 `lin-chatgpt@5.1.6` 依赖
- ✅ 重写后端 API 调用逻辑 (原生 fetch + async iteration)
- ✅ 支持多 API 提供商 (OpenAI、DeepSeek、Qwen、Tuzi)
- ✅ 流式响应处理
- ✅ 添加 Gemini 模型支持 (gemini-3-pro, gemini-3-flash-preview)
- ✅ 添加 GPT-5.1 模型支持
- ✅ 图片对话基础支持 (多模态消息结构)
- ✅ Thinking 解析支持 (`<thinking>...</thinking>`)
- ✅ 简化模型切换 (Qwen-Plus, Gemini-3-Pro, Gemini-3-Flash, GPT-5.1)
- ✅ 设置 Gemini-3-Flash 为默认模型
- ✅ 修复对话上下文管理 (conversationHistory)
- ✅ 修复前端请求处理 (移除 isChatGPTAPI 条件判断)
- ✅ 修复响应验证逻辑 (支持流式响应格式)
- ✅ 修复 rate limiter 警告

## 待完成
- ❌ 前端图片上传组件
- ❌ 前端 Thinking 展示组件  
- ❌ 聊天服务器存储 (数据库)

## 待实现功能

### 1. 图片对话支持
**前端**:
- 文件上传组件（拖拽/点击上传）
- 图片预览和删除
- 消息中显示图片

**后端**:
- 图片 base64 编码处理
- 多模态消息格式支持
- 图片大小和格式验证

### 2. Thinking 展示
**前端**:
- Thinking 内容折叠/展开组件
- 实时 thinking 流式显示
- 区分 thinking 和 response 内容

**后端**:
- 解析 thinking 标签 `<thinking>...</thinking>`
- 分离 thinking 和最终回复
- 流式传输时标记内容类型

### 3. 聊天服务器存储
**数据库设计**:
```sql
conversations: id, title, created_at, updated_at
messages: id, conversation_id, role, content, images, thinking, created_at
```

**API 端点**:
- `GET /conversations` - 获取对话列表
- `POST /conversations` - 创建新对话
- `GET /conversations/:id/messages` - 获取消息历史
- `POST /conversations/:id/messages` - 发送消息
- `DELETE /conversations/:id` - 删除对话

## 技术栈
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **ORM**: 原生 SQL 或轻量级 ORM
- **图片处理**: 内置 base64 处理
- **实时通信**: Server-Sent Events (SSE)

## 实现优先级
1. 图片对话支持 (高)
2. 聊天服务器存储 (高) 
3. Thinking 展示 (中)

## 文件结构
```
service/
├── src/
│   ├── db/           # 数据库相关
│   ├── routes/       # API 路由
│   ├── utils/        # 工具函数
│   └── types/        # 类型定义
```
