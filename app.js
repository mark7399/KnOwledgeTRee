// 全局变量
let network = null;
let nodes = null;
let edges = null;
let nodeIdCounter = 1;
let selectedNodeId = null;
let serverPort = 3000;
let selectedText = '';
let currentConfig = {
    models: {},
    prompts: {}
};
let selectedPromptId = 'default';
let currentModelId = ''; // 跟踪当前选择的模型

// 全局变量
let currentLoadedFilename = null; // 用于自动保存当前加载的文件名
let generatingNodes = new Set(); // 跟踪正在生成文档的节点
let hasUnsavedChanges = false; // 跟踪知识树是否有未保存的修改

// 新建知识树
function newTree() {
    // 检查是否有未保存的更改（只有当前没有保存的文件名时才提示保存）
    if ((nodes.length > 0 || edges.length > 0) && !currentLoadedFilename) {
        const shouldSave = confirm('当前知识树有内容，是否先保存再创建新的知识树？');
        if (shouldSave) {
            saveTree();
            return; // 用户需要先保存，不继续创建新树
        }
    }
    
    // 只有在知识树被修改过时才显示确认弹窗
    if (hasUnsavedChanges && confirm('确定要创建新的知识树吗？当前数据将丢失。')) {
        createNewTree();
    } else if (!hasUnsavedChanges) {
        // 如果没有未保存的修改，直接创建新树
        createNewTree();
    }
}

// 创建新知识树的实际操作
function createNewTree() {
    // 清空所有数据
    nodes.clear();
    edges.clear();
    nodeIdCounter = 1;
    selectedNodeId = null;
    currentLoadedFilename = null; // 重置当前文件名
    hasUnsavedChanges = false; // 重置修改状态
    
    // 关闭侧边栏
    closeSidebar();
    
    // 重新适配视图
    if (network) {
        network.fit();
    }
    
    console.log('新知识树已创建');
}

// 初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 获取服务器端口
    if (window.electronAPI) {
        serverPort = await window.electronAPI.getServerPort();
    }
    
    initializeNetwork();
    await loadApiConfig();
    setupEventListeners();
    setupContextMenu();
    updateModelSelector();
});

async function autoSaveTree() {
    if (currentLoadedFilename) {
        console.log(`Autosaving tree: ${currentLoadedFilename}`);
        // 第二个参数 true 表示是自动保存，避免显示对话框和不必要的提示
        await confirmSaveTree(currentLoadedFilename, true); 
    }
}


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
    
    // 节点左键点击事件 - 选择提示词模板
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            selectedNodeId = nodeId;
            const node = nodes.get(nodeId);
            const currentModel = document.getElementById('modelSelect').value;
            
            // 如果节点正在生成文档，显示生成中的内容
            if (generatingNodes.has(nodeId)) {
                // 重新显示正在生成的文档（从documentContent获取当前内容）
                const currentContent = document.getElementById('documentContent').innerHTML;
                if (currentContent && !currentContent.includes('请选择一个节点')) {
                    // 如果有生成中的内容，保持显示
                    document.getElementById('sidebar').classList.add('open');
                    document.getElementById('documentTitle').textContent = node.label;
                }
                return;
            }
            
            // 如果节点已有文档且模型未更改，直接显示文档
            if (node && node.document && node.modelId === currentModel) {
                displayDocument(node.label, node.document);
            } else {
                // 否则显示提示词选择对话框（新节点、模型已更改、或更新后的节点）
                showPromptSelectDialog(nodeId);
            }
        }
    });
    
    // 节点右键事件
    network.on('oncontext', function(params) {
        params.event.preventDefault();
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            selectedNodeId = nodeId;
            showNodeContextMenu(params.event);
        }
    });
}

// 显示节点右键菜单
function showNodeContextMenu(event) {
    const menu = document.getElementById('nodeContextMenu');
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.classList.add('show');
}

// 显示提示词选择对话框
function showPromptSelectDialog(nodeId) {
    // 如果节点正在生成文档，不显示对话框
    if (generatingNodes.has(nodeId)) {
        return;
    }
    
    const dialog = document.getElementById('promptSelectDialog');
    const list = document.getElementById('promptTemplateList');
    
    // 清空列表
    list.innerHTML = '';
    
    // 生成模板列表
    Object.entries(currentConfig.prompts).forEach(([id, prompt]) => {
        const item = document.createElement('div');
        item.className = 'template-item';
        item.innerHTML = `
            <div class="template-name">${prompt.name}</div>
            <div class="template-preview">${prompt.template.substring(0, 100)}...</div>
        `;
        item.onclick = () => selectPromptAndGenerate(nodeId, id);
        list.appendChild(item);
    });
    
    dialog.classList.add('show');
}

// 选择提示词并生成文档
async function selectPromptAndGenerate(nodeId, promptId) {
    // 如果节点正在生成文档，不执行操作
    if (generatingNodes.has(nodeId)) {
        return;
    }
    
    closeDialog('promptSelectDialog');
    selectedPromptId = promptId;
    await showDocument(nodeId);
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
    
    // 模型选择器变化事件
    document.getElementById('modelSelect').addEventListener('change', function(e) {
        currentModelId = e.target.value;
    });
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', function(e) {
        const nodeMenu = document.getElementById('nodeContextMenu');
        const contextMenu = document.getElementById('contextMenu');
        
        if (!nodeMenu.contains(e.target)) {
            nodeMenu.classList.remove('show');
        }
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.remove('show');
        }
    });
    
    // 监听Electron菜单事件
    if (window.electronAPI) {
        window.electronAPI.onNewTree(() => {
            newTree();
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
}

// 显示新建节点对话框
function showNewNodeDialog(parentId = null) {
    selectedNodeId = parentId;
    const dialog = document.getElementById('newNodeDialog');
    const input = document.getElementById('newNodeInput');
    
    input.value = '';
    dialog.classList.add('show');
    
    setTimeout(() => {
        input.focus();
        input.disabled = false;
        input.readOnly = false;
    }, 100);
    
    // 只保留Escape键处理，Enter键已在setupEventListeners中处理
    input.onkeydown = function(e) {
        if (e.key === 'Escape') {
            closeDialog('newNodeDialog');
        }
    };
}

// 创建新节点
async function createNewNode() {
    const concept = document.getElementById('newNodeInput').value.trim();
    if (!concept) {
        alert('请输入概念名称');
        return;
    }
    
    closeDialog('newNodeDialog');
    
    // 创建节点
    const nodeId = nodeIdCounter++;
    const node = {
        id: nodeId,
        label: concept,
        title: concept,
        level: selectedNodeId ? nodes.get(selectedNodeId).level + 1 : 0
    };
    
    nodes.add(node);
    hasUnsavedChanges = true; // 标记有未保存的修改
    
    // 如果有父节点，创建边
    if (selectedNodeId) {
        edges.add({
            from: selectedNodeId,
            to: nodeId
        });
    }
    
    // 不再自动生成文档和子节点
    autoSaveTree();
}

// 配置marked选项
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true, // 支持换行
        gfm: true, // 支持GitHub风格的Markdown
        headerIds: false,
        mangle: false
    });
}

// 解析Markdown为HTML
function parseMarkdown(content) {
    if (typeof marked !== 'undefined') {
        try {
            // Step 1: 保护已有的 MathJax 公式（防止 Markdown 解析器破坏）
            let processedContent = content;
            const protectedMathBlocks = [];
            const protectedMathInline = [];
            
            // 保护已有的 \[...\] 块级公式
            processedContent = processedContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
                const placeholder = `MATHJAX_BLOCK:${protectedMathBlocks.length}:END`;
                protectedMathBlocks.push(match);
                return placeholder;
            });
            
            // 保护已有的 \(...\) 行内公式
            processedContent = processedContent.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
                const placeholder = `MATHJAX_INLINE:${protectedMathInline.length}:END`;
                protectedMathInline.push(match);
                return placeholder;
            });
            
            // Step 2: 转换 $$...$$ 和 $...$ 成 MathJax 标准形式
            // 转换 $$...$$ → \[...\] (块级公式)
            processedContent = processedContent.replace(/\$\$([\s\S]*?)\$\$/g, "\\\\[$1\\\\]");
            
            // 转换 $...$ → \(...\) (行内公式，避免转义的 \$ )
            processedContent = processedContent.replace(/(^|[^\\])\$([^\$]*?[^\\])\$/g, "$1\\\\($2\\\\)");
            
            // Step 3: 执行 Markdown 解析
            let html = marked.parse(processedContent);
            
            // Step 4: 恢复被保护的 MathJax 公式
            protectedMathBlocks.forEach((math, index) => {
                html = html.replace(`MATHJAX_BLOCK:${index}:END`, math);
            });
            
            protectedMathInline.forEach((math, index) => {
                html = html.replace(`MATHJAX_INLINE:${index}:END`, math);
            });
            
            return html;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return content.replace(/\n/g, '<br>'); // 降级处理
        } 
    } else {
        // 如果marked不可用，至少处理换行
        return content.replace(/\n/g, '<br>');
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
    
    // 标记节点为正在生成状态
    generatingNodes.add(nodeId);
    
    // 生成文档
    // 清空现有文档显示，准备接收流式内容
    displayDocument(node.label, '正在生成文档，请稍候...', false); 

    try {
        const modelId = document.getElementById('modelSelect').value;
        const response = await fetch(`http://localhost:${serverPort}/api/generate-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concept: node.label,
                modelId: modelId,
                promptId: selectedPromptId
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || `生成文档请求失败: ${response.status}`);
            } catch (e) {
                throw new Error(`生成文档请求失败: ${response.status} - ${errorText}`);
            }
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        
        // 显示思维过程
        let thinkingContent = '';
        let finalContent = '';
        let isThinking = true;
        
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                // console.log('Stream finished.');
                break;
            }

            const lines = value.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonData = line.substring(5).trim();
                    if (jsonData === '[DONE]') {
                        // console.log('Received [DONE] signal.');
                        nodes.update({ id: nodeId, document: finalContent, label: node.label, modelId: modelId });
                        hasUnsavedChanges = true; // 标记有未保存的修改
                        displayDocument(node.label, finalContent); // 显示最终完整内容
                        generatingNodes.delete(nodeId); // 移除生成状态
                        autoSaveTree(); 
                        return; 
                    }
                    try {
                        const parsed = JSON.parse(jsonData);
                        if (parsed.content) {
                            const content = parsed.content;
                            
                            // 检测思维过程标记
                            if (content.includes('<think>') || thinkingContent.includes('<think>')) {
                                isThinking = true;
                                thinkingContent += content;
                                
                                // 如果包含结束标记，切换到正式内容
                                if (thinkingContent.includes('</think>')) {
                                    isThinking = false;
                                    // 提取思维过程内容
                                    const thinkMatch = thinkingContent.match(/<think>([\s\S]*?)<\/think>/);
                                    if (thinkMatch) {
                                        const thinkingText = thinkMatch[1].trim();
                                        // 显示思维过程
                                        displayThinkingProcess(node.label, thinkingText);
                                    }
                                    // 移除思维标记，继续处理后续内容
                                    const afterThink = thinkingContent.split('</think>')[1] || '';
                                    finalContent += afterThink;
                                } else {
                                    // 仍在思维过程中，显示思维内容
                                    const currentThinking = thinkingContent.replace(/<think>/g, '').replace(/<\/think>/g, '');
                                    displayThinkingProcess(node.label, currentThinking + '...');
                                }
                            } else if (!isThinking) {
                                // 正式内容
                                finalContent += content;
                                // 实时显示解析后的内容
                                displayDocument(node.label, finalContent + '\n\n...正在生成...'); 
                                
                                // 确保数学公式在流式输出时也能正确渲染
                                setTimeout(() => {
                                    if (typeof MathJax !== 'undefined') {
                                        const documentContentDiv = document.getElementById('documentContent');
                                        MathJax.typesetPromise([documentContentDiv]).catch((e) => console.error('MathJax streaming render error:', e));
                                    }
                                }, 100);
                            } else {
                                // 没有思维标记的情况，直接作为最终内容
                                finalContent += content;
                                displayDocument(node.label, finalContent + '\n\n...正在生成...'); 
                                
                                // 确保数学公式在流式输出时也能正确渲染
                                setTimeout(() => {
                                    if (typeof MathJax !== 'undefined') {
                                        const documentContentDiv = document.getElementById('documentContent');
                                        MathJax.typesetPromise([documentContentDiv]).catch((e) => console.error('MathJax streaming render error:', e));
                                    }
                                }, 100);
                            }
                        } else if (parsed.error) {
                            console.error('Error from stream:', parsed.details || parsed.error);
                            throw new Error(parsed.details || parsed.error);
                        }
                    } catch (e) {
                        // console.warn('Could not parse JSON from stream line:', jsonData, e);
                    }
                }
            }
        }
        // 如果循环正常结束但没有收到 [DONE]，也进行最终处理
        nodes.update({ id: nodeId, document: finalContent, label: node.label, modelId: modelId });
        hasUnsavedChanges = true; // 标记有未保存的修改
        displayDocument(node.label, finalContent);
        generatingNodes.delete(nodeId); // 移除生成状态
        autoSaveTree();

    } catch (error) {
        console.error('生成文档失败详情:', error);
        alert('生成文档失败: ' + error.message);
        displayDocument(node.label, `生成失败: ${error.message}`, false);
        generatingNodes.delete(nodeId); // 移除生成状态
    }
}

// 显示文档内容
function displayDocument(title, content, isMarkdown = true) {
    const titleElement = document.getElementById('documentTitle');
    const contentDiv = document.getElementById('documentContent');
    
    // 保存当前滚动位置
    const currentScrollTop = contentDiv.scrollTop;
    const hadContent = contentDiv.innerHTML.trim() !== '';
    
    titleElement.textContent = title;
    
    // 解析Markdown内容
    const htmlContent = isMarkdown ? parseMarkdown(content) : content;
    
    // 获取或创建 documentView 元素
    let documentView = document.getElementById('documentView');
    if (!documentView) {
        // 如果是第一次显示，则构建完整的结构
        contentDiv.innerHTML = `
            <div class="document-view" id="documentView"></div>
            <div class="document-edit-controls">
                <button class="btn btn-secondary" onclick="toggleEditMode()">编辑文档</button>
                <button class="btn btn-primary" id="saveDocumentBtn" style="display:none;" onclick="saveDocumentChanges()">保存更改</button>
                <button class="btn" id="cancelEditBtn" style="display:none;" onclick="cancelEdit()">取消</button>
            </div>
            <textarea class="document-editor" id="documentEditor" style="display:none;" data-original-content="${content.replace(/"/g, '&quot;')}"></textarea>
        `;
        documentView = document.getElementById('documentView');
    }

    // 更新 documentView 的内容
    documentView.innerHTML = htmlContent;
    
    // 更新 documentEditor 的内容和 data-original-content
    const documentEditor = document.getElementById('documentEditor');
    if (documentEditor) {
        documentEditor.value = content;
        documentEditor.setAttribute('data-original-content', content.replace(/"/g, '&quot;'));
    }

    // 打开侧边栏
    document.getElementById('sidebar').classList.add('open');

    // 渲染数学公式并恢复滚动位置
    if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise === 'function') {
        MathJax.typesetPromise([documentView]).then(() => {
            // 恢复滚动位置，确保在 MathJax 渲染后保持用户位置
            if (hadContent) {
                contentDiv.scrollTop = currentScrollTop;
            }
        }).catch(e => console.error('MathJax displayDocument error:', e));
    } else {
        // 如果没有 MathJax，直接恢复滚动位置
        if (hadContent) {
            contentDiv.scrollTop = currentScrollTop;
        }
    }
    
    // 适应网络视图 (如果需要，但与文档滚动无关)
    // if (network) {
    //     setTimeout(() => network.fit(), 300);
    // }
}

// 切换编辑模式
function toggleEditMode() {
    const view = document.getElementById('documentView');
    const editor = document.getElementById('documentEditor');
    const editBtn = document.querySelector('.document-edit-controls button');
    const saveBtn = document.getElementById('saveDocumentBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    view.style.display = 'none';
    editor.style.display = 'block';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    // 设置编辑器内容为原始Markdown内容
    const originalContent = editor.getAttribute('data-original-content');
    if (originalContent) {
        editor.value = originalContent.replace(/&quot;/g, '"');
    } else {
        // 如果没有原始内容，尝试从节点获取
        const node = nodes.get(selectedNodeId);
        editor.value = node && node.document ? node.document : '';
    }
    editor.focus();
}

// 保存文档更改
function saveDocumentChanges() {
    const editor = document.getElementById('documentEditor');
    const newContent = editor.value;
    
    if (selectedNodeId) {
        // 更新节点的文档内容（保存原始Markdown）
        const node = nodes.get(selectedNodeId);
        if (node) {
            nodes.update({
                id: selectedNodeId,
                document: newContent
            });
            
            // 重新显示文档（会自动解析Markdown）
            displayDocument(node.label, newContent);
            
            // 自动保存
            autoSaveTree();
            
            alert('文档已更新');
        }
    }
}

// 取消编辑
function cancelEdit() {
    const view = document.getElementById('documentView');
    const editor = document.getElementById('documentEditor');
    const editBtn = document.querySelector('.document-edit-controls button');
    const saveBtn = document.getElementById('saveDocumentBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    view.style.display = 'block';
    editor.style.display = 'none';
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

// 打开侧边栏显示文档
function openSidebarWithContent(title, content) {
    displayDocument(title, content);
}

// 关闭侧边栏
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    if (network) {
        setTimeout(() => network.fit(), 300); // 侧边栏关闭后，延迟一点时间再fit，等待动画完成
    }
}


// 显示编辑节点对话框
function showEditNodeDialog() {
    const node = nodes.get(selectedNodeId);
    document.getElementById('editNodeInput').value = node.label;
    document.getElementById('editNodeDialog').classList.add('show');
    document.getElementById('editNodeInput').focus();
    document.getElementById('editNodeInput').select();
}

// 更新节点
function updateNode() {
    const newConcept = document.getElementById('editNodeInput').value.trim();
    if (!newConcept) {
        alert('请输入概念名称');
        return;
    }
    
    closeDialog('editNodeDialog');
    
    const node = nodes.get(selectedNodeId);
    const oldConcept = node.label;
    const hasDocument = node.document ? true : false;
    
    // 更新节点
    nodes.update({
        id: selectedNodeId,
        label: newConcept,
        title: newConcept,
        document: null // 清除旧文档
    });
    hasUnsavedChanges = true; // 标记有未保存的修改
    
    autoSaveTree();
    
    // 如果节点之前有文档，询问是否重新生成
    if (hasDocument && oldConcept !== newConcept) {
        if (confirm(`节点名称已从 "${oldConcept}" 更新为 "${newConcept}"。\n是否重新生成文档？`)) {
            showPromptSelectDialog(selectedNodeId);
        }
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
    hasUnsavedChanges = true; // 标记有未保存的修改
    closeSidebar();
    autoSaveTree();
}

// 从选中文本创建节点
function createNodeFromSelection() {
    if (!selectedText) return;
    
    document.getElementById('contextMenu').classList.remove('show');
    showNewNodeDialog(selectedNodeId);
    document.getElementById('newNodeInput').value = selectedText;
}

// 切换设置标签页
function switchTab(tabName) {
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 显示对应内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');
}

// 添加新模型
function addModel() {
    const modelId = 'model_' + Date.now();
    const modelsList = document.getElementById('modelsList');
    
    const modelItem = document.createElement('div');
    modelItem.className = 'model-item';
    modelItem.dataset.modelId = modelId;
    modelItem.innerHTML = `
        <div class="item-header">
            <input type="text" placeholder="模型名称" class="input-field model-name" value="新模型">
            <button class="btn-remove" onclick="removeModel('${modelId}')">删除</button>
        </div>
        <input type="text" placeholder="API URL" class="input-field model-url">
        <input type="password" placeholder="API Key" class="input-field model-key">
        <input type="text" placeholder="模型名 (如: gpt-3.5-turbo)" class="input-field model-model">
    `;
    
    modelsList.appendChild(modelItem);
}

// 删除模型
function removeModel(modelId) {
    const modelItem = document.querySelector(`[data-model-id="${modelId}"]`);
    if (modelItem) {
        modelItem.remove();
    }
}

// 添加新提示词模板
function addPromptTemplate() {
    const promptId = 'prompt_' + Date.now();
    const promptsList = document.getElementById('promptsList');
    
    const promptItem = document.createElement('div');
    promptItem.className = 'prompt-item';
    promptItem.dataset.promptId = promptId;
    promptItem.innerHTML = `
        <div class="item-header">
            <input type="text" placeholder="模板名称" class="input-field prompt-name" value="新模板">
            <button class="btn-remove" onclick="removePrompt('${promptId}')">删除</button>
        </div>
        <textarea placeholder="输入提示词模板，使用 {concept} 作为概念占位符" class="input-field prompt-template">请解释{concept}的含义和应用场景。</textarea>
    `;
    
    promptsList.appendChild(promptItem);
}

// 删除提示词模板
function removePrompt(promptId) {
    const promptItem = document.querySelector(`[data-prompt-id="${promptId}"]`);
    if (promptItem) {
        promptItem.remove();
    }
}
// 显示API设置
async function showSettings() {
    await loadApiConfig();
    renderSettings();
    document.getElementById('settingsDialog').classList.add('show');
}

// 渲染设置界面
function renderSettings() {
    // 渲染模型列表
    const modelsList = document.getElementById('modelsList');
    modelsList.innerHTML = '';
    
    Object.entries(currentConfig.models).forEach(([id, model]) => {
        const modelItem = document.createElement('div');
        modelItem.className = 'model-item';
        modelItem.dataset.modelId = id;
        modelItem.innerHTML = `
            <div class="item-header">
                <input type="text" placeholder="模型名称" class="input-field model-name" value="${model.name}">
                <button class="btn-remove" onclick="removeModel('${id}')">删除</button>
            </div>
            <input type="text" placeholder="API URL" class="input-field model-url" value="${model.url}">
            <input type="password" placeholder="API Key" class="input-field model-key" value="${model.key}">
            <input type="text" placeholder="模型名 (如: gpt-3.5-turbo)" class="input-field model-model" value="${model.model}">
        `;
        modelsList.appendChild(modelItem);
    });
    
    // 渲染提示词模板列表
    const promptsList = document.getElementById('promptsList');
    promptsList.innerHTML = '';
    
    Object.entries(currentConfig.prompts).forEach(([id, prompt]) => {
        const promptItem = document.createElement('div');
        promptItem.className = 'prompt-item';
        promptItem.dataset.promptId = id;
        promptItem.innerHTML = `
            <div class="item-header">
                <input type="text" placeholder="模板名称" class="input-field prompt-name" value="${prompt.name}">
                <button class="btn-remove" onclick="removePrompt('${id}')">删除</button>
            </div>
            <textarea placeholder="输入提示词模板，使用 {concept} 作为概念占位符" class="input-field prompt-template">${prompt.template}</textarea>
        `;
        promptsList.appendChild(promptItem);
    });
}

// 保存API设置
async function saveSettings() {
    // 收集模型配置
    const models = {};
    document.querySelectorAll('.model-item').forEach(item => {
        const id = item.dataset.modelId;
        models[id] = {
            name: item.querySelector('.model-name').value,
            url: item.querySelector('.model-url').value,
            key: item.querySelector('.model-key').value,
            model: item.querySelector('.model-model').value
        };
    });
    
    // 收集提示词模板
    const prompts = {};
    document.querySelectorAll('.prompt-item').forEach(item => {
        const id = item.dataset.promptId;
        prompts[id] = {
            name: item.querySelector('.prompt-name').value,
            template: item.querySelector('.prompt-template').value
        };
    });
    
    currentConfig = { models, prompts };
    
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
        });
        
        if (response.ok) {
            alert('设置保存成功');
            closeDialog('settingsDialog');
            updateModelSelector();
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
            currentConfig = await response.json();
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}
// 更新模型选择器
function updateModelSelector() {
    const selector = document.getElementById('modelSelect');
    selector.innerHTML = '';
    
    Object.entries(currentConfig.models).forEach(([id, model]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = model.name;
        selector.appendChild(option);
    });
    
    // 设置当前模型ID为第一个模型
    if (selector.options.length > 0) {
        currentModelId = selector.options[0].value;
    }
}
// 保存知识树
async function saveTree() {
    const dialog = document.getElementById('filenameDialog');
    const input = document.getElementById('filenameInput');
    
    // 如果当前有加载的文件，询问是否覆盖
    if (currentLoadedFilename) {
        if (confirm(`是否覆盖当前加载的知识树 "${currentLoadedFilename}"？`)) {
            await confirmSaveTree(currentLoadedFilename, false);
            return;
        }
    }
    
    if (input) {
        input.value = currentLoadedFilename || 'knowledge-tree-' + new Date().toISOString().slice(0, 10); // 设置默认文件名
        // 使用 setTimeout 确保在对话框完全显示后再设置焦点
        setTimeout(() => input.focus(), 0); 
    }
    if (dialog) {
        dialog.classList.add('show');
    }
}

async function confirmSaveTree(filenameFromDialog, isAutoSave = false) {
    const filename = isAutoSave ? filenameFromDialog : (filenameFromDialog || document.getElementById('filenameInput').value);
    if (!isAutoSave && !filename) {
        alert('文件名不能为空');
        return;
    }
    if (!isAutoSave) {
        closeDialog('filenameDialog');
    }
    
    const treeData = {
        nodes: nodes.get(),
        edges: edges.get(),
        nodeIdCounter: nodeIdCounter
    };
    
    if (!isAutoSave) {
        showLoading();
    }
    try {
        const pureFilename = filename.includes('/') ? filename.substring(filename.lastIndexOf('/') + 1) : filename;
        const response = await fetch(`http://localhost:${serverPort}/api/save-tree`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: pureFilename,
                data: treeData
            })
        });
        
        if (response.ok) {
            // 更新当前加载的文件名
            currentLoadedFilename = pureFilename;
            hasUnsavedChanges = false; // 重置修改状态
            
            if (!isAutoSave) {
                alert('保存成功');
            } else {
                console.log(`Tree ${pureFilename} autosaved successfully.`);
            }
        } else {
            const errorData = await response.json();
            alert('保存失败: ' + (errorData.error || '未知错误'));
        }
    } catch (error) {
        console.error('保存失败详情:', error);
        if (!isAutoSave) {
            alert('保存失败: ' + error.message);
        } else {
            console.error(`Autosave for ${filename} failed:`, error.message);
        }
    }
    if (!isAutoSave) {
        hideLoading();
    }
}

// 关闭对话框
function closeDialog(dialogId) {
    document.getElementById(dialogId).classList.remove('show');
}


// 加载知识树
async function loadTree() {
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/saved-trees`);
        if (!response.ok) {
            alert('获取文件列表失败: ' + response.statusText);
            return;
        }
        const data = await response.json();
        const trees = data.trees;

        if (trees.length === 0) {
            alert('没有已保存的知识树');
            return;
        }
        
        // 创建并显示加载对话框
        const dialog = document.getElementById('loadTreeDialog');
        const savedTreesList = document.getElementById('savedTreesList');
        
        // 清空现有列表
        savedTreesList.innerHTML = '';
        
        trees.forEach(filename => {
            const fileItem = document.createElement('div');
            fileItem.classList.add('saved-tree-item');

            const nameButton = document.createElement('button');
            nameButton.textContent = filename;
            nameButton.classList.add('btn', 'btn-load-item'); 
            nameButton.onclick = () => actualLoadTreeConfirmed(filename);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = '删除';
            deleteButton.classList.add('btn', 'btn-danger', 'btn-delete-item');
            deleteButton.onclick = (event) => {
                event.stopPropagation(); // 防止触发加载事件
                deleteTree(filename);
            };

            fileItem.appendChild(nameButton);
            fileItem.appendChild(deleteButton);
            savedTreesList.appendChild(fileItem);
        });
        
        // 显示对话框
        dialog.classList.add('show');

        // 确保滚动条可见
        if (savedTreesList.scrollHeight > savedTreesList.clientHeight) {
            savedTreesList.style.overflowY = 'scroll';
        } else {
            savedTreesList.style.overflowY = 'hidden';
        }
        
    } catch (error) { 
        console.error('加载文件失败详情:', error);
        alert('加载失败: ' + error.message);
    }
}

// REMOVING DUPLICATE FUNCTION
async function actualLoadTreeConfirmed(filename) {
    showLoading();
    try {
        const loadResponse = await fetch(`http://localhost:${serverPort}/api/load-tree/${filename.replace(/\\/g, '/')}`);
        if (!loadResponse.ok) {
            const errorData = await loadResponse.json().catch(() => ({ error: '加载文件失败，无法解析错误信息' }));
            throw new Error(errorData.error || '加载文件失败');
        }

        const treeData = await loadResponse.json();

        nodes.clear();
        edges.clear();

        nodes.add(treeData.nodes);
        edges.add(treeData.edges);
        nodeIdCounter = treeData.nodeIdCounter || (treeData.nodes.length ? Math.max(...treeData.nodes.map(n => parseInt(n.id.toString().split('_')[1] || 0))) + 1 : 1);

        network.fit();
        alert('加载成功');
        currentLoadedFilename = filename; // 存储当前加载的文件名以备自动保存
        hasUnsavedChanges = false; // 重置修改状态
        closeSidebar(); // 加载新树时关闭侧边栏
        console.log(`Tree ${filename} loaded. Set as current for autosave.`);
        closeDialog('loadTreeDialog'); // 关闭加载对话框

    } catch (error) {
        console.error('加载文件失败详情:', error);
        alert('加载失败: ' + error.message);
    } finally {
        hideLoading(); // 确保在任何情况下都隐藏加载动画
    }
}

async function deleteTree(filename) {
    if (!confirm(`确定要删除知识树 "${filename}" 吗？此操作不可恢复。`)) {
        return;
    }
    showLoading();
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/delete-tree/${filename.replace(/\\/g, '/')}`, {
            method: 'DELETE',
        });
        if (response.ok) {
            alert('删除成功');
            // 重新加载文件列表以更新对话框
            closeDialog('loadTreeDialog'); 
            hideLoading(); // 确保隐藏加载动画
            loadTree(); 
        } else {
            const errorData = await response.json().catch(() => ({ error: '删除失败，无法解析错误信息' }));
            alert('删除失败: ' + (errorData.error || '未知错误'));
            hideLoading(); // 确保隐藏加载动画
        }
    } catch (error) {
        console.error('删除文件失败详情:', error);
        alert('删除失败: ' + error.message);
        hideLoading(); // 确保隐藏加载动画
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

// 显示思维过程
function displayThinkingProcess(title, thinkingText) {
    document.getElementById('documentTitle').textContent = title + ' - 思考中...';
    const contentDiv = document.getElementById('documentContent');
    
    // 解析思维过程的Markdown内容
    const htmlContent = parseMarkdown(thinkingText);
    
    // 创建思维过程显示区域
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-process';
    thinkingDiv.style.cssText = `
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        border-left: 4px solid #4CAF50;
        padding: 15px;
        margin-bottom: 20px;
        border-radius: 8px;
        font-style: italic;
        color: #555;
        position: relative;
        overflow: hidden;
    `;
    
    // 添加思考标题
    const thinkingTitle = document.createElement('div');
    thinkingTitle.innerHTML = '🤔 AI正在思考...';
    thinkingTitle.style.cssText = `
        font-weight: bold;
        color: #4CAF50;
        margin-bottom: 10px;
        font-size: 14px;
    `;
    
    // 添加思考内容
    const thinkingContent = document.createElement('div');
    thinkingContent.innerHTML = htmlContent;
    thinkingContent.style.cssText = `
        line-height: 1.6;
        font-size: 13px;
    `;
    
    // 添加动画效果
    const loadingDots = document.createElement('div');
    loadingDots.innerHTML = '<span>.</span><span>.</span><span>.</span>';
    loadingDots.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        font-size: 20px;
        color: #4CAF50;
    `;
    
    // CSS动画
    const style = document.createElement('style');
    style.textContent = `
        .thinking-process .loading-dots span {
            animation: blink 1.4s infinite both;
        }
        .thinking-process .loading-dots span:nth-child(2) {
            animation-delay: 0.2s;
        }
        .thinking-process .loading-dots span:nth-child(3) {
            animation-delay: 0.4s;
        }
        @keyframes blink {
            0%, 80%, 100% { opacity: 0; }
            40% { opacity: 1; }
        }
    `;
    if (!document.querySelector('style[data-thinking-animation]')) {
        style.setAttribute('data-thinking-animation', 'true');
        document.head.appendChild(style);
    }
    
    loadingDots.className = 'loading-dots';
    
    thinkingDiv.appendChild(thinkingTitle);
    thinkingDiv.appendChild(thinkingContent);
    thinkingDiv.appendChild(loadingDots);
    
    // 清空内容区域并添加思维过程
    contentDiv.innerHTML = '';
    contentDiv.appendChild(thinkingDiv);
    
    // 打开侧边栏
    document.getElementById('sidebar').classList.add('open');
    
    // 渲染数学公式
    if (typeof MathJax !== 'undefined') {
        MathJax.typesetPromise([contentDiv]).catch((e) => console.error('MathJax rendering error:', e));
    }
    
    if (network) {
        setTimeout(() => network.fit(), 300);
    }
}

// ... existing code ...


