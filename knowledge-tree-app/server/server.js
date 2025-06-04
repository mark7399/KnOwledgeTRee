const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

// 存储API配置
let apiConfigs = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    key: 'sk-25f16198a0e44391ad319db83db4e994',
    model: 'deepseek-chat'
  }
};

// 加载配置
async function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    if (config.apiConfigs) {
      apiConfigs = { ...apiConfigs, ...config.apiConfigs };
    }
  } catch (error) {
    console.log('配置文件不存在或读取失败，使用默认配置');
  }
}

// 保存配置
async function saveConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ apiConfigs }, null, 2));
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

// 获取API配置
app.get('/api/config', (req, res) => {
  res.json(apiConfigs);
});

// 更新API配置
app.post('/api/config', async (req, res) => {
  const { provider, config } = req.body;
  if (provider && config) {
    apiConfigs[provider] = { ...apiConfigs[provider], ...config };
    await saveConfig();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: '无效的配置' });
  }
});

// 生成文档
app.post('/api/generate-document', async (req, res) => {
  const { concept, provider = 'deepseek' } = req.body;
  
  if (!concept) {
    return res.status(400).json({ error: '概念不能为空' });
  }

  const config = apiConfigs[provider];
  if (!config || !config.key) {
    return res.status(400).json({ error: `请先配置${provider}的API密钥` });
  }

  const prompt = `你可以先解释一下什么是${concept}吗?生成一份学习,解释${concept}的文档，从人们面对的问题开始，思考${concept}的创新点在哪里，回答${concept}出现前人们面对的那些问题为什么解决不了，再说明${concept}为什么可以解决人们的问题，举个例子说明一下包含具体计算过程。最后说明${concept}有什么缺陷。`;

  try {
    const response = await axios.post(config.url, {
      model: config.model, // 用户提供的示例中是 deepseek-reasoner，但这里我们使用配置中的 model
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,  //提高创造性
      top_p: 0.95,       // 增加语言多样性
      max_tokens: 8000,   // 增加内容空间 (4000→8000)
      presence_penalty: 0.3,  // 避免重复内容
      frequency_penalty: 0.2  // 鼓励多样表达
    }, {
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0].message.content;
    res.json({ content });
  } catch (error) {
    console.error('生成文档失败:', error.response?.data || error.message);
    res.status(500).json({ 
      error: '生成文档失败', 
      details: error.response?.data?.error?.message || error.message 
    });
  }
});

// 提取关键词
app.post('/api/extract-keywords', async (req, res) => {
  const { content, provider = 'deepseek' } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '内容不能为空' });
  }

  const config = apiConfigs[provider];
  if (!config || !config.key) {
    return res.status(400).json({ error: `请先配置${provider}的API密钥` });
  }

  const prompt = '请总结该文档出现的重要概念和方法为关键词列表发给我。请以JSON数组格式返回，例如：["概念1", "概念2", "方法1"]';

  try {
    const response = await axios.post(config.url, {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: `文档内容：\n${content}\n\n${prompt}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.choices[0].message.content;
    
    // 尝试解析JSON数组
    let keywords = [];
    try {
      // 提取JSON数组
      const jsonMatch = result.match(/\[.*\]/s);
      if (jsonMatch) {
        keywords = JSON.parse(jsonMatch[0]);
      } else {
        // 如果没有找到JSON数组，尝试按行分割
        keywords = result.split('\n')
          .filter(line => line.trim())
          .map(line => line.replace(/^[-*\d.]+\s*/, '').trim())
          .filter(keyword => keyword && keyword.length > 0);
      }
    } catch (parseError) {
      console.error('解析关键词失败:', parseError);
      keywords = [];
    }

    res.json({ keywords });
  } catch (error) {
    console.error('提取关键词失败:', error.response?.data || error.message);
    res.status(500).json({ 
      error: '提取关键词失败', 
      details: error.response?.data?.error?.message || error.message 
    });
  }
});

// 保存知识树
app.post('/api/save-tree', async (req, res) => {
  const { filename, data } = req.body;
  
  try {
    const savePath = path.join(__dirname, '..', 'saved_trees', `${filename}.json`);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('保存失败:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

// 加载知识树
app.get('/api/load-tree/:filename', async (req, res) => {
  const { filename } = req.params;
  
  try {
    const loadPath = path.join(__dirname, '..', 'saved_trees', `${filename}.json`);
    const data = await fs.readFile(loadPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('加载失败:', error);
    res.status(500).json({ error: '加载失败' });
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

async function startServer() {
  await loadConfig();
  
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`服务器运行在 http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

module.exports = { startServer };