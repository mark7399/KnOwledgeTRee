# 知识树 - 概念学习工具

一个基于AI的本地知识树生成工具。

## 功能特点

- 🖥️ **新建节点，选择Prompt，生成解释文档！**：方便至极，快速学习
- 🌳 **递归生成知识树**：选择疑惑点，继续生成，不断深入

## 系统要求

- **Node.js**: v14.0.0 或更高版本
- **操作系统**: Windows 10+, macOS 10.14+, 或 Linux (Ubuntu 18.04+)
- **内存**: 至少 4GB RAM
- **网络**: 需要互联网连接以访问AI API

## 安装和运行

### 1. 下载项目
先到你想下载的位置，打开cmd，输入以下命令
```bash
git clone https://github.com/mark7399/KnowledgeTree.git
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

#### 4. 启动！以 桌面应用模式/Web浏览器模式 
```bash
npm start
```
or
```bash
npm run start:web
```
然后在浏览器中访问显示的地址（通常是 http://localhost:3000）

### 初始设置

1. 首次使用时，点击"API设置"按钮
2. 保存设置
### 食用方法

- **单击节点**：查看该概念的文档
- **右键节点**：编辑节点名称或删除节点
- **选中文字右键**：将选中的文字创建为新节点


## API配置

目前已支持DeepSeek R1和DeepSeek V3模型，您需要：

1. 前往 [DeepSeek官网](https://platform.deepseek.com/) 注册账号
2. 获取API Key
3. 在应用的API设置中填入您的API Key
   - DeepSeek R1 (推理模型): deepseek-reasoner
   - DeepSeek V3 (对话模型): deepseek-chat
   - API地址: https://api.deepseek.com/v1/chat/completions

## Mac系统兼容性

本应用完全兼容macOS系统，无需任何额外配置

## 技术栈

- **前端**：HTML5 + CSS3 + JavaScript
- **可视化**：vis-network
- **桌面应用**：Electron
- **后端**：Node.js + Express
- **AI接口**：DeepSeek API (支持R1推理模型和V3对话模型)
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
git clone https://github.com/mark7399/KnowledgeTree.git
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

- [ ] 生成内容增强：容纳可交互式讲解
- [ ] 支持更多AI模型
- [ ] 支持多语言界面
- [ ] 移动端适配

## 许可证

MIT License

## 支持

如果您遇到问题或有建议，请：

1. 查看 [Issues](https://github.com/mark7399/KnowledgeTree/issues) 页面
2. 创建新的Issue描述您的问题
3. 或者发送邮件至：[fepstemmp@gmail.com]

---

**感谢使用知识树！希望它能帮助您更好地学习和理解复杂概念。** 🌳📚
