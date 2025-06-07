const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');  // 添加同步文件系统模块用于监听
const PORT = process.env.PORT || 3000;
const app = express();


app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

// 存储API配置
let apiConfigs = {
  models: {
    'deepseek-reasoner': {
      name: 'DeepSeek R1 (推理模型)',
      url: 'https://api.deepseek.com/v1/chat/completions',
      key: '',
      model: 'deepseek-reasoner'
    },
    'deepseek-chat': {
      name: 'DeepSeek V3 (对话模型)',
      url: 'https://api.deepseek.com/v1/chat/completions',
      key: '',
      model: 'deepseek-chat'
    }
  },
  prompts: {
    default: {
      name: '默认模板',
      template: '你是一位擅长用生动形象的语言教授数学和编程概念的老师。请为{concept}生成一份学习文档，要求：\n\n1. **语言风格**：用生动有趣、通俗易懂的语言，多用比喻、类比和具体例子来解释抽象概念\n2. **结构安排**：从背景故事开始 → 遇到的实际问题 → 思考过程 → 解决方案的演化 → 最终的数学/编程表达\n3. **解释方式**：\n   - 优先使用物理直觉和日常生活中的类比\n   - 把抽象概念比作具体可感知的事物\n   - 用"就像..."、"好比..."、"想象一下..."等表达方式\n   - 避免直接抛出公式，而是解释公式背后的思考逻辑\n4. **前置概念**：如需使用复杂概念，先用简单语言解释，确保读者能跟上思路\n5. **实用性**：结合具体应用场景，让读者明白"为什么要学这个"和"这个概念在现实中如何使用"\n\n请用这种生动形象的教学方式，帮助学生真正理解{concept}的本质和应用。'
    }
  }
};

// 监听配置文件变化
function watchConfigFile() {
  const configPath = path.join(__dirname, '..', 'config.json');
  fsSync.watch(configPath, async (eventType) => {
    if (eventType === 'change') {
      await loadConfig();
    }
  });
}

// 加载配置
async function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    
    // 兼容旧配置格式
    if (config.apiConfigs && config.apiConfigs.deepseek) {
      // 迁移旧的deepseek配置到新的deepseek-reasoner
      apiConfigs.models['deepseek-reasoner'] = {
        name: 'DeepSeek R1 (推理模型)',
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-reasoner',
        ...config.apiConfigs.deepseek
      };
    }
    
    // 加载新配置格式
    if (config.models) {
      apiConfigs.models = config.models;
    }
    if (config.prompts) {
      apiConfigs.prompts = config.prompts;
    }
    
  } catch (error) {
    // Config file not found or read failed, using default config
  }
}

// 保存配置
async function saveConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    await fs.writeFile(configPath, JSON.stringify(apiConfigs, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// 获取API配置
app.get('/api/config', (req, res) => {
  res.json(apiConfigs);
});

// 更新API配置
app.post('/api/config', async (req, res) => {
  apiConfigs = req.body;
  await saveConfig();
  res.json({ success: true });
});

// 重新加载配置
app.post('/api/reload-config', async (req, res) => {
  try {
    await loadConfig();
    res.json({ success: true, config: apiConfigs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reload config' });
  }
});

// 生成文档
app.post('/api/generate-document', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // 立刻发送头部信息
  const { concept, modelId = 'deepseek-reasoner', promptId = 'default', nodeChain = [] } = req.body;
  
  if (!concept) {
    return res.status(400).json({ error: 'Concept cannot be empty' });
  }

  const model = apiConfigs.models[modelId];
  if (!model || !model.key) {
    return res.status(400).json({ error: `Please configure ${modelId} API key first` });
  }

  const promptTemplate = apiConfigs.prompts[promptId];
  if (!promptTemplate) {
    return res.status(400).json({ error: 'Prompt template not found' });
  }

  // 构建消息数组，包含历史对话信息
  const messages = [];
  
  // 如果有节点链历史，添加历史对话
  if (nodeChain && nodeChain.length > 0) {
    nodeChain.forEach((node, index) => {
      if (node.concept && node.document) {
        // 添加用户消息（概念）
        messages.push({
          role: 'user',
          content: promptTemplate.template.replace(/{concept}/g, node.concept)
        });
        // 添加助手回复（文档内容）
        messages.push({
          role: 'assistant',
          content: node.document
        });
      }
    });
  }
  
  // 添加当前概念的用户消息
  const currentPrompt = promptTemplate.template.replace(/{concept}/g, concept);
  messages.push({
    role: 'user',
    content: currentPrompt
  });

  try {
    // 根据不同模型设置不同的API参数
    let requestBody = {
      model: model.model,
      messages: messages,
      stream: true
    };
    
    // 为不同模型设置不同的参数
    if (model.model === 'deepseek-reasoner') {
      // deepseek-reasoner 参数设置
      // 最大输出32K tokens（默认），最大64K tokens
      requestBody.max_tokens = 32768; // 使用较大的token数以支持长文档生成
      // 注意：deepseek-reasoner 不支持 temperature, top_p, presence_penalty, frequency_penalty
    } else if (model.model === 'deepseek-chat') {
      // deepseek-chat 参数设置
      // 最大输出4K tokens（默认），最大8K tokens
      requestBody.max_tokens = 8192;
      // 为学习数学和编程设置合适的参数
      requestBody.temperature = 0.6; // 适合一般对话和解释概念
      requestBody.top_p = 0.9;
      requestBody.presence_penalty = 0;
      requestBody.frequency_penalty = 0;
    }
    
    const streamResponse = await axios.post(model.url, requestBody, {
      headers: {
        'Authorization': `Bearer ${model.key}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream',
      httpsAgent: new (require('https').Agent)({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 5
      })
    });
    

    


    streamResponse.data.on('data', (chunk) => {
      // DeepSeek API 返回的流数据格式通常是 JSON lines (ndjson)
      const chunkStr = chunk.toString();
      
      try {
        // 按行分割处理
        const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          // 处理 DeepSeek API 的 SSE keep-alive 注释
          if (line.trim().startsWith(': keep-alive') || line.trim().startsWith(':')) {
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(5).trim();
            if (jsonData === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                const delta = parsed.choices[0].delta;
                
                // 处理思维过程内容 - 直接发送完整块
                if (delta.reasoning_content) {
                  res.write(`data: ${JSON.stringify({ reasoning_content: delta.reasoning_content })}\n\n`);
                  if (res.flush) res.flush();
                }
                
                // 处理最终内容 - 直接发送完整块
                if (delta.content) {
                  res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
                  if (res.flush) res.flush();
                }
              }
            } catch (jsonParseError) {
              // 忽略无法解析的行
              continue;
            }
          }
        }
      } catch (e) {
        // 处理块解析错误
        console.error('Error processing chunk:', e.message);
      }
    });

    streamResponse.data.on('end', () => {
      // console.log('Stream ended from API.');
      res.write('data: [DONE]\n\n'); // 确保在流结束后发送完成信号
      res.end();
    });


  } catch (error) {
    console.error('API request failed:', error.message);
    // 发送错误响应并结束连接
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate document' });
    } else {
      // 如果已经开始流式传输，发送错误信号并结束
      res.write('data: [ERROR]\n\n');
      res.end();
    }
  }
});

// 保存知识树
app.post('/api/save-tree', async (req, res) => {
  const { filename, data } = req.body;
  
  try {
    // 清理文件名，移除可能导致问题的字符
    const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '-');
    const savePath = path.join(__dirname, '..', 'saved_trees', `${cleanFilename}.json`);
    
    console.log('尝试保存文件到:', savePath);
    
    // 确保目录存在
    const saveDir = path.dirname(savePath);
    await fs.mkdir(saveDir, { recursive: true });
    console.log('目录已创建或已存在:', saveDir);
    
    // 保存文件
    await fs.writeFile(savePath, JSON.stringify(data, null, 2));
    console.log('文件保存成功:', cleanFilename);
    
    res.json({ success: true });
  } catch (error) {
    console.error('保存失败详细信息:', error);
    res.status(500).json({ error: '保存失败: ' + error.message });
  }
});

// 加载知识树
app.get('/api/load-tree/:filename', async (req, res) => {
  const { filename } = req.params;
  
  try {
    // 使用相同的文件名清理规则
    const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '-');
    const loadPath = path.join(__dirname, '..', 'saved_trees', `${cleanFilename}.json`);
    
    console.log('尝试加载文件:', loadPath);
    
    const data = await fs.readFile(loadPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('加载失败详细信息:', error);
    res.status(500).json({ error: '加载失败: ' + error.message });
  }
});

// 获取已保存的知识树列表
app.get('/api/saved-trees', async (req, res) => {
  try {
    const treesDir = path.join(__dirname, '..', 'saved_trees');
    await fs.mkdir(treesDir, { recursive: true });
    const files = await fs.readdir(treesDir);
    const trees = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    res.json({ trees });
  } catch (error) {
    console.error('获取列表失败:', error);
    res.status(500).json({ error: '获取列表失败' });
  }
});

// 删除知识树文件
app.delete('/api/delete-tree/:filename', async (req, res) => {
    const filename = req.params.filename;
    if (!filename || typeof filename !== 'string' || filename.includes('..')) {
        return res.status(400).json({ error: '无效的文件名' });
    }

    const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '-');
    const filePath = path.join(__dirname, '..', 'saved_trees', cleanFilename + '.json');

    try {
        await fs.unlink(filePath);
        console.log(`文件 ${filePath} 已成功删除`);
        res.status(200).json({ message: '文件删除成功' });
    } catch (err) {
        console.error('删除文件失败:', err);
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: '文件未找到' });
        }
        return res.status(500).json({ error: '删除文件失败' });
    }
});

async function startServer() {
  await loadConfig();
  watchConfigFile();  // 启动文件监听
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT} (from startServer)`);
      resolve(server);
    });
    server.on('error', (err) => {
      reject(err);
    });
  });
}

// 主服务器启动
// app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });
// 现在由 startServer 启动

module.exports = { startServer };