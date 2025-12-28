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
- ✅ 简化模型切换 (Qwen-Plus, Gemini-3-Pro, Gemini-3-Flash, GPT-5.1)
- ✅ 设置 Gemini-3-Flash 为默认模型
- ✅ 修复对话上下文管理 (conversationHistory)
- ✅ 修复前端请求处理 (移除 isChatGPTAPI 条件判断)
- ✅ 修复响应验证逻辑 (支持流式响应格式)
- ✅ 修复 rate limiter 警告
- ✅ Thinking 展示功能
  - 前端解析 `<think>` 和 `<thinking>` 标签
  - 支持流式输出时实时显示思考过程
  - 折叠/展开组件，默认隐藏
  - 过滤未闭合标签避免显示原始标签
- ✅ 图片上传功能
  - 拖拽上传支持 (带视觉提示遮罩)
  - 粘贴图片支持 (Ctrl+V)
  - 图片压缩 (最大 1024px)
  - 输入框图片预览 (50x50 缩略图)
  - 点击缩略图全屏预览
  - 消息列表图片显示 (气泡上方，最大 100x100)
  - 消息列表图片点击预览
  - Express body limit 增加到 50MB
- ✅ 多模态对话支持
  - 图片 base64 编码传输
  - OpenAI 兼容的 image_url 格式
  - 对话历史中保存图片

## 待完成
- ❌ 聊天服务器存储 (数据库)

## 待实现功能

### 聊天服务器存储
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

## 文件结构
```
service/
├── src/
│   ├── db/           # 数据库相关
│   ├── routes/       # API 路由
│   ├── utils/        # 工具函数
│   └── types/        # 类型定义
```

## 关键文件
- `service/src/chatgpt/index.ts` - 后端 API 调用
- `src/views/chat/index.vue` - 主聊天界面、图片上传
- `src/views/chat/components/Message/index.vue` - 消息组件、图片显示
- `src/views/chat/components/Message/Text.vue` - Thinking 解析展示
- `src/api/index.ts` - 前端 API 调用
- `src/typings/chat.d.ts` - 类型定义 (含 images 字段)
