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
    deepseek: {
      name: 'DeepSeek R1',
      url: 'https://api.deepseek.com/chat/completions',
      key: '',
      model: 'deepseek-chat'
    }
  },
  prompts: {
    default: {
      name: '默认模板',
      template: '<think>\n我需要为学生解释{concept}这个概念。让我先思考一下如何用高中生能理解的语言来解释这个概念，包括背景、问题、解决思路和具体过程。\n\n首先，我需要考虑：\n1. 这个概念解决了什么实际问题？\n2. 人们是如何发现或发明这个概念的？\n3. 有什么生动的比喻可以帮助理解？\n4. 如何从基础原理推导到最终结论？\n</think>\n\n你是一位擅长教授陌生概念给学生的老师。生成一份学习{concept}的文档，尽量用高中毕业生能听懂的语言，如果你不得不使用无法立即理解的前置概念，你就先用高中生能听懂的语言先解释前置概念，然后从背景-人们面对的问题开始说起，如果有从问题-灵感-构建为数学语言-推导得出结论的过程就最好了，如果你只知道有个公式，没有探索得到公式的过程的资料，你就想想如果是你，遇到那样的问题，你会怎么思考，怎么得到问题的解决方案。因为任何公式都不是凭空产生的，每一个步骤都有迹可循。你可以试着模拟一个具体的人们遇到的问题，然后思考如何解决。注意不要直接套用公式，那样对于学习没有意义。我们的目的是学习前人解决问题的思考方式。语言生动有趣，优先物理直觉，参考网页版的叙事风格和比喻方式'
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
      apiConfigs.models.deepseek = {
        name: 'DeepSeek R1',
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
  const { concept, modelId = 'deepseek', promptId = 'default' } = req.body;
  
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

  // 替换模板中的占位符
  const prompt = promptTemplate.template.replace(/{concept}/g, concept);

  try {
    const streamResponse = await axios.post(model.url, {
      model: model.model, // 用户提供的示例中是 deepseek-reasoner，但这里我们使用配置中的 model
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0, 
      top_p: 0.95,       // 增加语言多样性
      max_tokens: 16000,  // 进一步增加内容空间，避免因知识树内容增多导致生成截止
      presence_penalty: 0.3,  // 避免重复内容
      frequency_penalty: 0.2,  // 鼓励多样表达
      stream: true // 启用流式响应
    }, {
      headers: {
        'Authorization': `Bearer ${model.key}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream' // 明确告诉API我们期望流式响应
      },
      responseType: 'stream', // 告诉axios期望一个流
      timeout: 30000, // 30秒超时
      // 添加连接超时设置
      httpsAgent: new (require('https').Agent)({
        timeout: 10000, // 连接超时10秒
        keepAlive: true
      })
    });

    streamResponse.data.on('data', (chunk) => {
      // DeepSeek API 返回的流数据格式通常是 JSON lines (ndjson)
      // 每个 chunk 可能包含一个或多个 JSON 对象，或者一个 JSON 对象的一部分
      // 我们需要解析这些 JSON 对象并提取 'choices[0].delta.content'
      const chunkStr = chunk.toString();
      // console.log('Raw chunk:', chunkStr); // 调试原始数据块
      try {
        // 尝试按行分割，因为 DeepSeek 通常是 JSON lines
        const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(5).trim();
            if (jsonData === '[DONE]') {
              // console.log('Stream finished with [DONE]');
              res.write('data: [DONE]\n\n'); // 发送结束信号
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const contentPart = parsed.choices[0].delta.content;
                // console.log('Sending content part:', contentPart); // 调试发送的内容
                res.write(`data: ${JSON.stringify({ content: contentPart })}\n\n`);
              } else if (parsed.choices && parsed.choices[0] && parsed.choices[0].finish_reason) {
                // console.log('Stream finished, reason:', parsed.choices[0].finish_reason);
                // 可以根据 finish_reason 做一些处理，例如如果是因为长度限制结束
              }
            } catch (jsonParseError) {
              // console.error('Error parsing JSON line:', jsonParseError, 'Line:', jsonData);
              // 忽略无法解析的行，或者记录错误
            }
          } else {
            // console.log('Non-data line received:', line); // 调试非数据行
          }
        }
      } catch (e) {
        // console.error('Error processing chunk:', e, 'Chunk:', chunkStr);
        // 如果整个块处理失败，可能需要发送错误信号或记录
      }
    });

    streamResponse.data.on('end', () => {
      // console.log('Stream ended from API.');
      res.write('data: [DONE]\n\n'); // 确保在流结束后发送完成信号
      res.end();
    });

    streamResponse.data.on('error', (streamError) => {
      console.error('Error in API stream:', streamError);
      res.write(`data: ${JSON.stringify({ error: 'Stream error from API', details: streamError.message })}\n\n`);
      res.end();
    });
  } catch (error) {
    console.error('Failed to generate document:', error.response?.data || error.message);
    // 流式处理中，错误已在 streamResponse.data.on('error', ...) 中处理
    // 如果初始请求就失败（例如网络问题或配置错误），这里的 catch 仍然会捕获
    if (!res.writableEnded) { // 确保在流未结束时才发送错误
        console.error('Failed to initiate document generation stream:', error.message);
        res.write(`data: ${JSON.stringify({ error: 'Failed to initiate stream', details: error.message })}\n\n`);
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