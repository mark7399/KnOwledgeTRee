// 全局变量
let network = null;
let nodes = null;
let edges = null;
let nodeIdCounter = 1;
let selectedNodeId = null;
let serverPort = 3000;
let selectedText = '';

// 初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 获取服务器端口
    if (window.electronAPI) {
        serverPort = await window.electronAPI.getServerPort();
    }
    
    initializeNetwork();
    loadApiConfig();
    setupEventListeners();
    setupContextMenu();
});

// 初始化网络图
function initializeNetwork() {
    const container = document.getElementById('knowledge-tree');
    
    // 创建数据集
    nodes = new vis.DataSet([]);
    edges = new vis.DataSet([]);
    
    // 配置选项
    const options = {
        nodes: {
            shape: 'box',
            font: {
                size: 16,
                color: '#333'
            },
            borderWidth: 2,
            color: {
                border: '#2188ff',
                background: '#fff',
                highlight: {
                    border: '#0366d6',
                    background: '#e7f3ff'
                }
            },
            margin: 10,
            widthConstraint: {
                minimum: 100,
                maximum: 200
            }
        },
        edges: {
            width: 2,
            color: {
                color: '#ccc',
                highlight: '#2188ff'
            },
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 0.8
                }
            },
            smooth: {
                type: 'cubicBezier',
                forceDirection: 'vertical',
                roundness: 0.4
            }
        },
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 150,
                levelSeparation: 100
            }
        },
        physics: {
            enabled: false
        },
        interaction: {
            hover: true,
            tooltipDelay: 200
        }
    };
    
    // 创建网络
    const data = { nodes: nodes, edges: edges };
    network = new vis.Network(container, data, options);
    
    // 节点点击事件
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            showDocument(nodeId);
        }
    });
    
    // 节点双击事件
    network.on('doubleClick', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            showEditNodeDialog(nodeId);
        }
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 输入框回车事件
    document.getElementById('newNodeInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            createNewNode();
        }
    });
    
    document.getElementById('editNodeInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            updateNode();
        }
    });
    
    // 监听Electron菜单事件
    if (window.electronAPI) {
        window.electronAPI.onNewTree(() => {
            if (confirm('确定要创建新的知识树吗？当前数据将丢失。')) {
                nodes.clear();
                edges.clear();
                nodeIdCounter = 1;
                closeSidebar();
            }
        });
        
        window.electronAPI.onSaveTree(() => saveTree());
        window.electronAPI.onLoadTree(() => loadTree());
    }
}

// 设置右键菜单
function setupContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    const documentContent = document.getElementById('documentContent');
    
    // 监听文本选择
    documentContent.addEventListener('mouseup', function(e) {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();
        
        if (selectedText) {
            // 短暂延迟以确保选择完成
            setTimeout(() => {
                if (window.getSelection().toString().trim()) {
                    // 不自动显示菜单，等待右键
                }
            }, 10);
        }
    });
    
    // 右键菜单
    documentContent.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (text) {
            selectedText = text;
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.classList.add('show');
        }
    });
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', function(e) {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.remove('show');
        }
    });
}

// 显示新建节点对话框
function showNewNodeDialog(parentId = null) {
    selectedNodeId = parentId;
    document.getElementById('newNodeInput').value = '';
    const dialog = document.getElementById('newNodeDialog');
    dialog.classList.add('show');
    
    // 添加短暂延迟确保对话框完全显示后再设置焦点
    setTimeout(() => {
        const input = document.getElementById('newNodeInput');
        input.focus();
        input.select();
    }, 100);
}

// 创建新节点
async function createNewNode() {
    const concept = document.getElementById('newNodeInput').value.trim();
    if (!concept) {
        alert('请输入概念名称');
        return;
    }
    
    closeDialog('newNodeDialog');
    showLoading();
    
    try {
        // 创建节点
        const nodeId = nodeIdCounter++;
        const node = {
            id: nodeId,
            label: concept,
            title: concept,
            level: selectedNodeId ? nodes.get(selectedNodeId).level + 1 : 0
        };
        
        nodes.add(node);
        
        // 如果有父节点，创建边
        if (selectedNodeId) {
            edges.add({
                from: selectedNodeId,
                to: nodeId
            });
        }
        
        // 生成文档
        const response = await fetch(`http://localhost:${serverPort}/api/generate-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concept: concept,
                provider: document.getElementById('modelSelect').value
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error);
        }
        
        const data = await response.json();
        const document = data.content;
        
        // 更新节点数据
        nodes.update({
            id: nodeId,
            document: document
        });
        
        // 提取关键词并创建子节点
        await extractAndCreateChildNodes(nodeId, document, concept);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        // 更详细的错误提示
        let errorMessage = '生成文档失败: ';
        
        if (error.message.includes('请先配置')) {
            errorMessage = '请先配置API密钥！\n\n' + 
                          '1. 点击右上角"API设置"按钮\n' + 
                          '2. 输入您的DeepSeek API Key\n' + 
                          '3. 点击保存';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            errorMessage = '无法连接到API服务器，请检查网络连接';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorMessage = 'API密钥无效，请检查您的API Key是否正确';
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
        
        // 删除创建的节点
        nodes.remove(nodeId);
        if (selectedNodeId) {
            edges.remove({ from: selectedNodeId, to: nodeId });
        }
    }
}

// 提取关键词并创建子节点
async function extractAndCreateChildNodes(parentId, document, parentConcept) {
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/extract-keywords`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: document,
                provider: document.getElementById('modelSelect').value
            })
        });
        
        if (!response.ok) {
            throw new Error('提取关键词失败');
        }
        
        const data = await response.json();
        const keywords = data.keywords || [];
        
        // 过滤掉与父节点相同的关键词
        const filteredKeywords = keywords.filter(keyword => 
            keyword.toLowerCase() !== parentConcept.toLowerCase() &&
            keyword.length > 0 &&
            keyword.length < 50 // 过滤掉过长的关键词
        );
        
        // 创建子节点（最多创建5个）
        const parentNode = nodes.get(parentId);
        for (let i = 0; i < Math.min(filteredKeywords.length, 5); i++) {
            const keyword = filteredKeywords[i];
            const childId = nodeIdCounter++;
            
            nodes.add({
                id: childId,
                label: keyword,
                title: keyword,
                level: parentNode.level + 1
            });
            
            edges.add({
                from: parentId,
                to: childId
            });
        }
        
        // 重新布局
        network.stabilize();
    } catch (error) {
        console.error('提取关键词失败:', error);
    }
}

// 显示文档
async function showDocument(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;
    
    selectedNodeId = nodeId;
    
    // 如果节点已有文档，直接显示
    if (node.document) {
        displayDocument(node.label, node.document);
        return;
    }
    
    // 如果没有文档，生成文档
    showLoading();
    
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/generate-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concept: node.label,
                provider: document.getElementById('modelSelect').value
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error);
        }
        
        const data = await response.json();
        const document = data.content;
        
        // 更新节点数据
        nodes.update({
            id: nodeId,
            document: document
        });
        
        displayDocument(node.label, document);
        
        // 如果节点没有子节点，提取关键词
        const connectedEdges = edges.get({
            filter: edge => edge.from === nodeId
        });
        
        if (connectedEdges.length === 0) {
            await extractAndCreateChildNodes(nodeId, document, node.label);
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        alert('生成文档失败: ' + error.message);
    }
}

// 显示文档内容
function displayDocument(title, content) {
    document.getElementById('documentTitle').textContent = title;
    
    // 将Markdown格式转换为HTML（简单处理）
    let html = content
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*)\*/g, '<em>$1</em>')
        .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    
    // 处理段落
    html = html.split('<br><br>').map(para => 
        para.trim() ? `<p>${para}</p>` : ''
    ).join('');
    
    document.getElementById('documentContent').innerHTML = html;
    document.getElementById('sidebar').classList.add('open');
}

// 关闭侧边栏
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
}

// 显示编辑节点对话框
function showEditNodeDialog(nodeId) {
    selectedNodeId = nodeId;
    const node = nodes.get(nodeId);
    document.getElementById('editNodeInput').value = node.label;
    document.getElementById('editNodeDialog').classList.add('show');
    document.getElementById('editNodeInput').focus();
    document.getElementById('editNodeInput').select();
}

// 更新节点
async function updateNode() {
    const newConcept = document.getElementById('editNodeInput').value.trim();
    if (!newConcept) {
        alert('请输入概念名称');
        return;
    }
    
    closeDialog('editNodeDialog');
    showLoading();
    
    try {
        // 生成新文档
        const response = await fetch(`http://localhost:${serverPort}/api/generate-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concept: newConcept,
                provider: document.getElementById('modelSelect').value
            })
        });
        
        if (!response.ok) {
            throw new Error('生成文档失败');
        }
        
        const data = await response.json();
        
        // 更新节点
        nodes.update({
            id: selectedNodeId,
            label: newConcept,
            title: newConcept,
            document: data.content
        });
        
        // 删除原有子节点
        const childEdges = edges.get({
            filter: edge => edge.from === selectedNodeId
        });
        
        childEdges.forEach(edge => {
            edges.remove(edge.id);
            nodes.remove(edge.to);
        });
        
        // 重新提取关键词并创建子节点
        await extractAndCreateChildNodes(selectedNodeId, data.content, newConcept);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        alert('更新节点失败: ' + error.message);
    }
}

// 删除节点
function deleteNode() {
    if (!confirm('确定要删除这个节点及其所有子节点吗？')) {
        return;
    }
    
    closeDialog('editNodeDialog');
    
    // 递归删除节点及其子节点
    function deleteNodeRecursive(nodeId) {
        const childEdges = edges.get({
            filter: edge => edge.from === nodeId
        });
        
        childEdges.forEach(edge => {
            deleteNodeRecursive(edge.to);
            edges.remove(edge.id);
        });
        
        nodes.remove(nodeId);
    }
    
    deleteNodeRecursive(selectedNodeId);
    closeSidebar();
}

// 从选中文本创建节点
function createNodeFromSelection() {
    if (!selectedText) return;
    
    document.getElementById('contextMenu').classList.remove('show');
    showNewNodeDialog(selectedNodeId);
    document.getElementById('newNodeInput').value = selectedText;
}

// 显示API设置
async function showSettings() {
    document.getElementById('settingsDialog').classList.add('show');
}

// 保存API设置
async function saveSettings() {
    const deepseekKey = document.getElementById('deepseekKey').value;
    const deepseekModel = document.getElementById('deepseekModel').value;
    
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'deepseek',
                config: {
                    key: deepseekKey,
                    model: deepseekModel || 'deepseek-chat'
                }
            })
        });
        
        if (response.ok) {
            alert('设置保存成功');
            closeDialog('settingsDialog');
        } else {
            alert('保存设置失败');
        }
    } catch (error) {
        alert('保存设置失败: ' + error.message);
    }
}

// 加载API配置
async function loadApiConfig() {
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/config`);
        if (response.ok) {
            const config = await response.json();
            if (config.deepseek) {
                document.getElementById('deepseekKey').value = config.deepseek.key || '';
                document.getElementById('deepseekModel').value = config.deepseek.model || 'deepseek-chat';
            }
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 保存知识树
async function saveTree() {
    const filename = prompt('请输入文件名：', 'knowledge-tree-' + new Date().toISOString().slice(0, 10));
    if (!filename) return;
    
    const treeData = {
        nodes: nodes.get(),
        edges: edges.get(),
        nodeIdCounter: nodeIdCounter
    };
    
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/save-tree`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: filename,
                data: treeData
            })
        });
        
        if (response.ok) {
            alert('保存成功');
        } else {
            alert('保存失败');
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// 加载知识树
async function loadTree() {
    try {
        // 获取已保存的文件列表
        const response = await fetch(`http://localhost:${serverPort}/api/saved-trees`);
        if (!response.ok) throw new Error('获取文件列表失败');
        
        const data = await response.json();
        const trees = data.trees;
        
        if (trees.length === 0) {
            alert('没有已保存的知识树');
            return;
        }
        
        // 让用户选择文件
        const filename = prompt('请选择要加载的文件：\n' + trees.join('\n'));
        if (!filename || !trees.includes(filename)) return;
        
        // 加载文件
        const loadResponse = await fetch(`http://localhost:${serverPort}/api/load-tree/${filename}`);
        if (!loadResponse.ok) throw new Error('加载文件失败');
        
        const treeData = await loadResponse.json();
        
        // 清空当前数据
        nodes.clear();
        edges.clear();
        
        // 加载新数据
        nodes.add(treeData.nodes);
        edges.add(treeData.edges);
        nodeIdCounter = treeData.nodeIdCounter || treeData.nodes.length + 1;
        
        // 重新布局
        network.fit();
        
        alert('加载成功');
    } catch (error) {
        alert('加载失败: ' + error.message);
    }
}

// 显示加载动画
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

// 隐藏加载动画
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

// 关闭对话框
function closeDialog(dialogId) {
    document.getElementById(dialogId).classList.remove('show');
} 