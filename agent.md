# ChatGPT Web 重构计划

## 目标
移除 `chatgpt` 依赖，重构为原生实现，支持现代 AI 对话功能。

## 已完成

### 核心重构
- ✅ 移除 `lin-chatgpt@5.1.6` 依赖
- ✅ 重写后端 API 调用逻辑 (原生 fetch + async iteration)
- ✅ 流式响应处理

### 模型支持
- ✅ 支持多 API 提供商 (OpenAI、DeepSeek、Qwen、Tuzi)
- ✅ 添加 Gemini 模型支持 (gemini-3-pro, gemini-3-flash-preview)
- ✅ 添加 GPT-5.1 模型支持
- ✅ 简化模型切换 (Qwen-Plus, Gemini-3-Pro, Gemini-3-Flash, GPT-5.1)
- ✅ 设置 Gemini-3-Flash 为默认模型

### Thinking 展示
- ✅ 前端解析 `<think>` 和 `<thinking>` 标签
- ✅ 支持流式输出时实时显示思考过程
- ✅ 折叠/展开组件，默认隐藏
- ✅ 过滤未闭合标签避免显示原始标签

### 图片上传
- ✅ 拖拽上传支持 (带视觉提示遮罩)
- ✅ 粘贴图片支持 (Ctrl+V)
- ✅ 图片压缩 (最大 1024px)
- ✅ 输入框图片预览 (50x50 缩略图)
- ✅ 点击缩略图全屏预览
- ✅ 消息列表图片显示 (气泡上方，最大 100x100)
- ✅ 消息列表图片点击预览
- ✅ Express body limit 增加到 50MB

### 多模态对话
- ✅ 图片 base64 编码传输
- ✅ OpenAI 兼容的 image_url 格式
- ✅ 对话历史中保存图片

### 用户认证系统
- ✅ 用户注册/登录 (用户名 + 密码)
- ✅ 注册邀请码验证 (`chatgpt9832`)
- ✅ JWT token 认证 (7天有效期)
- ✅ 密码 SHA256 哈希存储
- ✅ 登录状态持久化 (localStorage)
- ✅ 侧边栏显示用户名和退出按钮

### 聊天记录存储
- ✅ SQLite 数据库存储
- ✅ 用户数据隔离 (按 user_id)
- ✅ 对话列表同步
- ✅ 消息历史同步
- ✅ 登录后自动加载服务器数据
- ✅ 退出时清除本地数据

## 技术架构

### 数据库结构
```sql
users: id, username, password_hash, created_at
conversations: id, uuid, user_id, title, created_at, updated_at
messages: id, conversation_uuid, role, content, images, thinking, created_at
```

### API 端点
```
用户认证:
POST /user/register    - 注册 (需要邀请码)
POST /user/login       - 登录
GET  /user/info        - 获取用户信息

聊天记录:
GET    /conversations              - 获取对话列表
GET    /conversations/:uuid        - 获取对话详情和消息
POST   /conversations              - 创建对话
PUT    /conversations/:uuid        - 更新对话标题
DELETE /conversations/:uuid        - 删除对话
POST   /conversations/:uuid/messages   - 保存消息
DELETE /conversations/:uuid/messages   - 清空消息
```

### 数据同步流程
```
用户登录 → token 存 localStorage → checkAuth() 验证
    ↓
loadFromServer() → GET /conversations → 显示对话列表
    ↓
选择对话 → loadMessagesFromServer() → GET /conversations/:uuid → 显示消息
    ↓
发送消息 → POST /conversations/:uuid/messages → 保存到数据库
    ↓
退出 → 清除 localStorage → 刷新页面
```

## 关键文件
```
后端:
service/src/index.ts           - API 路由
service/src/db/index.ts        - 数据库操作
service/src/chatgpt/index.ts   - AI API 调用

前端:
src/views/chat/index.vue                    - 主聊天界面、图片上传
src/views/chat/layout/Layout.vue            - 布局、认证检查
src/views/chat/layout/Login.vue             - 登录/注册组件
src/views/chat/layout/sider/index.vue       - 侧边栏、用户信息
src/views/chat/components/Message/index.vue - 消息组件、图片显示
src/views/chat/components/Message/Text.vue  - Thinking 解析展示
src/store/modules/auth/index.ts             - 认证状态管理
src/store/modules/chat/index.ts             - 聊天状态管理、服务器同步
src/api/index.ts                            - API 调用
src/typings/chat.d.ts                       - 类型定义
```

## 配置
- 邀请码: `chatgpt9832` (硬编码在后端)
- JWT 密钥: 环境变量 `JWT_SECRET` 或默认值
- 数据库: `service/data/chat.db` (已加入 .gitignore)
