# 知识树 - 概念学习工具

一个基于AI的本地知识树生成工具。

## 功能特点

- 🌳 **递归生成知识树**：输入一个概念，如果其中出现不懂内容，可以选中文字直接创建新节点
- 📝 **AI驱动的文档生成**：使用DeepSeek R1等AI模型生成详细的概念解释文档
- 💾 **保存和加载**：支持保存知识树结构，方便后续查看和编辑
- ✏️ **节点编辑**：支持增加、删除、修改节点
- 🎨 **简约界面**：现代化的UI设计，操作流畅
- 🌐 **跨平台支持**：支持Windows、macOS和Linux系统
- 🖥️ **双模式运行**：支持桌面应用和Web浏览器两种运行模式

## 系统要求

- **Node.js**: v14.0.0 或更高版本
- **操作系统**: Windows 10+, macOS 10.14+, 或 Linux (Ubuntu 18.04+)
- **内存**: 至少 4GB RAM
- **网络**: 需要互联网连接以访问AI API

## 安装和运行

### 1. 下载项目

```bash
git clone https://github.com/mark7399/KnOwledgeTRee
.git
cd KnOwledgeTRee
```
或者直接下载文件夹到本地。

### 2. 安装Node.js

如果您还没有安装Node.js，请访问 [Node.js官网](https://nodejs.org/) 下载并安装最新的LTS版本。

验证安装：
```bash
node --version
npm --version
```

### 3. 安装项目依赖

```bash
npm install
```

### 4. 在应用启动后，点击"API设置"按钮进行配置

### 5. 运行应用

#### 桌面应用模式
```bash（在下载的文件夹中点击文件地址空白处，改为cmd，按Enter直接进入该文件夹的终端）
npm start
```

#### Web浏览器模式
```bash（在下载的文件夹中点击文件地址空白处，改为cmd，按Enter直接进入该文件夹的终端）
npm run start:web
```

然后在浏览器中访问显示的地址（通常是 http://localhost:3000）



## 使用方法

### 初始设置

1. 首次使用时，点击"API设置"按钮
2. 输入您的 API Key，确认模型名称（具体查看大模型官方API调用文档）
3. 保存设置

### 创建知识树

1. 点击"新建节点"按钮
2. 输入您想要学习的概念（如"线性回归"）
3. 系统会自动：
   - 生成该概念的详细文档
   - 提取相关概念作为子节点
   - 构建知识树结构

### 探索知识树

- **单击节点**：查看该概念的文档
- **右键节点**：编辑节点名称或删除节点
- **选中文字右键**：将选中的文字创建为新节点

### 保存和加载

- 点击"保存"按钮保存当前知识树
- 点击"加载"按钮加载之前保存的知识树

## API配置

目前已支持DeepSeek R1模型，您需要：

1. 前往 [DeepSeek官网](https://platform.deepseek.com/) 注册账号
2. 获取API Key
3. 在应用的API设置中填入您的Key 和对应模型名称，如（deepseek-reasoner） 和URL

## Mac系统兼容性

本应用完全兼容macOS系统，无需任何额外配置：

- ✅ **自动浏览器启动**：在macOS上会自动使用 `open` 命令打开浏览器
- ✅ **Electron支持**：桌面应用模式在macOS上运行良好
- ✅ **文件路径处理**：自动处理macOS的文件路径格式
- ✅ **快捷键支持**：支持macOS标准快捷键（Cmd+C, Cmd+V等）

### macOS特定说明

1. **安装Node.js**：推荐使用 [Homebrew](https://brew.sh/) 安装：
   ```bash
   brew install node
   ```

2. **权限问题**：如果遇到权限问题，可能需要使用 `sudo` 或配置npm全局目录：
   ```bash
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查找占用端口3000的进程
   lsof -i :3000  # macOS/Linux
   netstat -ano | findstr :3000  # Windows
   ```

2. **依赖安装失败**
   ```bash
   # 清除npm缓存
   npm cache clean --force
   # 删除node_modules重新安装
   rm -rf node_modules package-lock.json  # macOS/Linux
   rmdir /s node_modules & del package-lock.json  # Windows
   npm install
   ```

3. **API连接问题**
   - 检查网络连接
   - 验证API Key是否正确
   - 确认DeepSeek服务状态

### 系统特定问题

**macOS**:
- 如果Electron应用无法启动，请检查Gatekeeper设置
- 某些版本可能需要在"系统偏好设置 > 安全性与隐私"中允许应用运行

**Windows**:
- 如果遇到PowerShell执行策略问题：
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

**Linux**:
- 可能需要安装额外的系统依赖：
  ```bash
  sudo apt-get install libgtk-3-dev libxss1 libasound2-dev
  ```

## 技术栈

- **前端**：HTML5 + CSS3 + JavaScript
- **可视化**：vis-network
- **桌面应用**：Electron
- **后端**：Node.js + Express
- **AI接口**：DeepSeek API
- **依赖管理**：npm
- **跨平台支持**：Node.js + Electron

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 开发环境设置

```bash
# 克隆你的fork
git clone https://github.com/your-username/knowledge-tree-app.git
cd knowledge-tree-app

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

## 注意事项

- 请妥善保管您的API Key，不要将其提交到版本控制系统
- 生成文档需要消耗API调用次数，请合理使用
- 建议定期保存您的知识树
- 首次运行可能需要下载Electron二进制文件，请耐心等待

## 开发计划

- [ ] 支持更多AI模型（GPT、Claude等）
- [ ] 导出为思维导图格式
- [ ] 支持多语言界面
- [ ] 添加搜索功能
- [ ] 支持协作编辑
- [ ] 移动端适配
- [ ] 离线模式支持

## 许可证

MIT License

## 支持

如果您遇到问题或有建议，请：

1. 查看 [Issues](https://github.com/your-username/knowledge-tree-app/issues) 页面
2. 创建新的Issue描述您的问题
3. 或者发送邮件至：[your-email@example.com]

---

**感谢使用知识树！希望它能帮助您更好地学习和理解复杂概念。** 🌳📚
