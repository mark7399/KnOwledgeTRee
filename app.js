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
let currentModelId = 'deepseek-reasoner'; // 跟踪当前选择的模型

// 全局变量
let currentLoadedFilename = null; // 用于自动保存当前加载的文件名
let generatingNodes = new Set(); // 跟踪正在生成文档的节点
let hasUnsavedChanges = false; // 跟踪知识树是否有未保存的修改

// MathJax优化相关变量
let lastMathContent = '';
let mathJaxTimer = null;

// 优化MathJax渲染 - 只在内容有实质变化时渲染
const hasNewMath = (content) => {
    const mathPattern = /(\$|\\\(|\\\[)/;
    return mathPattern.test(content) && content !== lastMathContent;
};

// 使用防抖渲染
function scheduleMathJaxRender(content) {
    if (!hasNewMath(content)) return;
    
    lastMathContent = content;
    clearTimeout(mathJaxTimer);
    mathJaxTimer = setTimeout(() => {
        if (typeof MathJax !== 'undefined') {
            const documentView = document.getElementById('documentView');
            if (documentView) {
                MathJax.typesetClear([documentView]);
                MathJax.typesetPromise([documentView]).catch((e) => 
                    console.error('MathJax rendering error:', e)
                );
            }
        }
    }, 1000); // 1秒延迟
}

// 简化文档更新逻辑
function updateDocumentContent(title, thinkingText, finalContent, isStreaming = false) {
    document.getElementById('documentTitle').textContent = title;
    const documentView = document.getElementById('documentView');
    if (!documentView) {
        // 如果documentView不存在，使用原有的显示函数
        if (thinkingText) {
            displayDocumentWithThinking(title, thinkingText, finalContent, isStreaming);
        } else {
            displayDocument(title, finalContent, true, isStreaming);
        }
        return;
    }
    
    // 使用文本节点减少重排
    const fragment = document.createDocumentFragment();
    
    if (thinkingText) {
        // 有思维过程的情况
        const thinkingHtml = parseMarkdown(thinkingText);
        const finalHtml = parseMarkdown(finalContent);
        
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <div class="thinking-section" style="
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                border-left: 4px solid #4CAF50;
                border: 1px solid #ddd;
                padding: 15px;
                border-radius: 8px;
                font-style: italic;
                color: #555;
                line-height: 1.6;
                font-size: 13px;
                margin-bottom: 20px;
            ">
                <div style="
                    color: #4CAF50;
                    font-weight: bold;
                    margin-bottom: 10px;
                    font-size: 14px;
                ">🧠 AI思维过程</div>
                ${thinkingHtml}
            </div>
            <div class="final-content" style="
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                line-height: 1.6;
            ">
                ${finalHtml}
            </div>
        `;
        fragment.appendChild(contentDiv);
    } else {
        // 只有最终内容的情况
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = parseMarkdown(finalContent);
        fragment.appendChild(contentDiv);
    }
    
    // 使用requestAnimationFrame优化
    requestAnimationFrame(() => {
        documentView.innerHTML = '';
        documentView.appendChild(fragment);
    });
}

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

// 自动保存功能已移除


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
    
    // 多次尝试设置焦点，解决启动时无法选中的问题
    const tryFocus = (attempt = 0) => {
        if (attempt < 5) {
            setTimeout(() => {
                input.disabled = false;
                input.readOnly = false;
                input.focus();
                input.click();
                input.select();
                
                // 检查是否成功获得焦点
                if (document.activeElement !== input) {
                    console.log(`Focus attempt ${attempt + 1} failed, retrying...`);
                    tryFocus(attempt + 1);
                } else {
                    console.log(`Focus successful on attempt ${attempt + 1}`);
                }
            }, 100 + attempt * 200); // 递增延迟
        } else {
            console.warn('Failed to focus input after 5 attempts');
            // 最后一次尝试：强制触发点击事件
            setTimeout(() => {
                input.disabled = false;
                input.readOnly = false;
                const event = new MouseEvent('click', { bubbles: true });
                input.dispatchEvent(event);
                input.focus();
                input.select();
            }, 500);
        }
    };
    
    tryFocus();
    
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
    // 自动保存已移除
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

// 获取节点链路径（从当前节点到根节点）
function getNodeChain(nodeId) {
    const chain = [];
    let currentNodeId = nodeId;
    
    // 向上追溯到根节点
    while (currentNodeId !== null) {
        const currentNode = nodes.get(currentNodeId);
        if (!currentNode) break;
        
        // 只添加有文档内容的节点到链中
        if (currentNode.document) {
            chain.unshift({
                concept: currentNode.label,
                document: currentNode.document
            });
        }
        
        // 查找父节点
        const parentEdge = edges.get({
            filter: edge => edge.to === currentNodeId
        })[0];
        
        currentNodeId = parentEdge ? parentEdge.from : null;
    }
    
    return chain;
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
    document.getElementById('documentTitle').textContent = node.label + ' - 正在生成...';
    const contentDiv = document.getElementById('documentContent');
    contentDiv.innerHTML = ''; // 清空所有内容，为新的思维链和文档做准备 

    try {
            const modelId = document.getElementById('modelSelect').value;
            // 获取节点链历史信息
            const nodeChain = getNodeChain(nodeId);
            
            const response = await fetch(`http://localhost:${serverPort}/api/generate-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept: node.label,
                    modelId: modelId,
                    promptId: selectedPromptId,
                    nodeChain: nodeChain
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            
            // 显示思维过程
            let reasoningContent = '';
            let finalContent = '';
            let hasStartedReasoning = false;
            let hasStartedContent = false;
            
            // 修改流处理部分 - 使用更可靠的分隔符处理
            const processChunk = (chunk) => {
                // 使用更可靠的分隔符处理
                const events = chunk.split(/(?=data: )/);
                
                events.forEach(event => {
                    if (!event.trim()) return;
                    
                    // 确保以"data: "开头
                    const dataStr = event.startsWith('data: ') ? event.substring(6) : event;
                    
                    if (dataStr === '[DONE]') {
                        // console.log('Received [DONE] signal.');
                        nodes.update({ id: nodeId, document: finalContent, label: node.label, modelId: modelId });
                        hasUnsavedChanges = true; // 标记有未保存的修改
                        
                        // 显示最终完整内容
                        if (hasStartedReasoning && reasoningContent) {
                            displayThinkingProcess(node.label, reasoningContent, true);
                            displayDocumentWithThinking(node.label, reasoningContent, finalContent);
                        } else {
                            displayDocument(node.label, finalContent);
                        }
                        
                        generatingNodes.delete(nodeId); // 移除生成状态
                        // 自动保存已移除 
                        return; 
                    } else if (dataStr === '[ERROR]') {
                        // 处理错误
                        console.warn('Received error signal from server');
                        throw new Error('Server returned error signal');
                    } else {
                        try {
                            const parsed = JSON.parse(dataStr);
                            
                            // 处理数据 - 保持原有的处理逻辑
                            
                            // 处理思维过程内容
                            if (parsed.reasoning_content) {
                                reasoningContent += parsed.reasoning_content;
                                
                                if (!hasStartedReasoning) {
                                    hasStartedReasoning = true;
                                }
                                // 更新思维过程显示
                                displayThinkingProcess(node.label, reasoningContent, false);
                            }
                            
                            // 处理最终内容
                            if (parsed.content) {
                                finalContent += parsed.content;
                                
                                if (!hasStartedContent) {
                                    hasStartedContent = true;
                                    // 思维过程完成，开始显示最终内容
                                    if (hasStartedReasoning && reasoningContent) {
                                        displayThinkingProcess(node.label, reasoningContent, true);
                                        updateDocumentContent(node.label, reasoningContent, finalContent, true);
                                    } else {
                                        // 没有思维过程，直接显示文档
                                        updateDocumentContent(node.label, '', finalContent, true);
                                    }
                                } else {
                                    // 更新最终内容时，使用优化的更新函数
                                    if (hasStartedReasoning && reasoningContent) {
                                        updateDocumentContent(node.label, reasoningContent, finalContent, true);
                                    } else {
                                        updateDocumentContent(node.label, '', finalContent, true);
                                    }
                                    
                                    // 优化的MathJax渲染
                                    scheduleMathJaxRender(finalContent);
                                }
                            }
                        } catch (e) {
                            // 解析JSON失败
                            console.warn('解析JSON失败', dataStr);
                        }
                     }
                 });
             };
             
             // 主循环
             while (true) {
                 const { value, done } = await reader.read();
                 if (done) break;
                 
                 processChunk(value);
             }
            // 如果循环正常结束但没有收到 [DONE]，也进行最终处理
            
            // 显示最终完整内容
            if (hasStartedReasoning && reasoningContent) {
                displayThinkingProcess(node.label, reasoningContent, true);
                updateDocumentContent(node.label, reasoningContent, finalContent);
            } else {
                updateDocumentContent(node.label, '', finalContent);
            }
            
            // 确保最终内容的数学公式正确渲染
            scheduleMathJaxRender(finalContent);
            
            generatingNodes.delete(nodeId); // 移除生成状态
        } catch (error) {
            console.error('Generation failed:', error);
            generatingNodes.delete(nodeId);
            document.getElementById('documentTitle').textContent = node.label + ' - 生成失败';
            return;
        }
    
    generatingNodes.delete(nodeId); // 移除生成状态
}

// 显示文档内容
function displayDocument(title, content, isMarkdown = true, isStreaming = false) {
    const titleElement = document.getElementById('documentTitle');
    const contentDiv = document.getElementById('documentContent');
    
    // 只在非流式更新时保存滚动位置
    const currentScrollTop = isStreaming ? null : contentDiv.scrollTop;
    const hadContent = contentDiv.innerHTML.trim() !== '';
    
    titleElement.textContent = title;
    
    // 解析Markdown内容
    const htmlContent = isMarkdown ? parseMarkdown(content) : content;
    
    // 获取或创建 documentView 元素
    let documentView = document.getElementById('documentView');
    if (!documentView) {
        contentDiv.innerHTML = `
            <div class="document-view" id="documentView"></div>
            <textarea class="document-editor" id="documentEditor" style="display:none;"></textarea>
        `;
        documentView = document.getElementById('documentView');
    }

    // 更新 documentView 的内容
    documentView.innerHTML = htmlContent;
    
    // 显示顶部编辑按钮
    const editDocumentBtn = document.getElementById('editDocumentBtn');
    if (editDocumentBtn) {
        editDocumentBtn.style.display = 'inline-block';
    }
    
    // 添加编辑控制按钮容器（如果不存在）
    if (!document.getElementById('editControlButtons')) {
        const editControlDiv = document.createElement('div');
        editControlDiv.id = 'editControlButtons';
        editControlDiv.className = 'document-edit-controls';
        editControlDiv.style.display = 'none';
        editControlDiv.innerHTML = `
            <button class="btn btn-primary" id="saveDocumentBtn" onclick="saveDocumentChanges()">保存更改</button>
            <button class="btn" id="cancelEditBtn" onclick="cancelEdit()">取消</button>
        `;
        documentView.parentNode.insertBefore(editControlDiv, documentView.nextSibling);
    }
    
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
        // 清除之前的MathJax处理，重新渲染
        MathJax.typesetClear([documentView]);
        MathJax.typesetPromise([documentView]).then(() => {
            // 只在非流式更新时恢复滚动位置
            if (!isStreaming && hadContent && currentScrollTop > 0) {
                contentDiv.scrollTop = currentScrollTop;
            }
        }).catch(e => console.error('MathJax displayDocument error:', e));
    } else {
        // 只在非流式更新时恢复滚动位置
        if (!isStreaming && hadContent && currentScrollTop > 0) {
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
    const editBtn = document.getElementById('editDocumentBtn');
    const editControlButtons = document.getElementById('editControlButtons');
    
    view.style.display = 'none';
    editor.style.display = 'block';
    editBtn.style.display = 'none';
    if (editControlButtons) {
        editControlButtons.style.display = 'block';
    }
    
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
            // 自动保存已移除
            
            alert('文档已更新');
        }
    }
}

// 取消编辑
function cancelEdit() {
    const view = document.getElementById('documentView');
    const editor = document.getElementById('documentEditor');
    const editBtn = document.getElementById('editDocumentBtn');
    const editControlButtons = document.getElementById('editControlButtons');
    
    view.style.display = 'block';
    editor.style.display = 'none';
    editBtn.style.display = 'inline-block';
    if (editControlButtons) {
        editControlButtons.style.display = 'none';
    }
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
    
    // 自动保存已移除
    
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
    // 自动保存已移除
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

// 删除模型功能已移除，知识树专为DeepSeek模型优化

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
                <span class="model-name-display">${model.name}</span>
            </div>
            <input type="text" placeholder="API URL" class="input-field model-url" value="${model.url}" readonly>
            <input type="password" placeholder="API Key" class="input-field model-key" value="${model.key}">
            <input type="text" placeholder="模型名" class="input-field model-model" value="${model.model}" readonly>
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
    // 收集模型配置（只更新API Key，其他配置保持不变）
    const models = { ...currentConfig.models };
    document.querySelectorAll('.model-item').forEach(item => {
        const id = item.dataset.modelId;
        if (models[id]) {
            models[id] = {
                ...models[id],
                key: item.querySelector('.model-key').value
            };
        }
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
        }
    } catch (error) {
        // 静默处理保存失败
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
    const currentValue = selector.value || currentModelId; // 保存当前选择的值
    selector.innerHTML = '';
    
    Object.entries(currentConfig.models).forEach(([id, model]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = model.name;
        selector.appendChild(option);
    });
    
    // 恢复之前选择的模型，如果不存在则使用第一个
    if (currentValue && selector.querySelector(`option[value="${currentValue}"]`)) {
        selector.value = currentValue;
        currentModelId = currentValue;
    } else if (selector.options.length > 0) {
        selector.value = selector.options[0].value;
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
            await confirmSaveTree(currentLoadedFilename);
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

async function confirmSaveTree(filenameFromDialog) {
    const filename = filenameFromDialog || document.getElementById('filenameInput').value;
    if (!filename) {
        alert('文件名不能为空');
        return;
    }
    closeDialog('filenameDialog');
    
    const treeData = {
        nodes: nodes.get(),
        edges: edges.get(),
        nodeIdCounter: nodeIdCounter
    };
    
    showLoading();
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
            alert('保存成功');
        }
    } catch (error) {
        alert('保存失败');
    }
    hideLoading();
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
            return; // 静默处理获取文件列表失败
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
        // 静默处理加载失败
    }
}

// REMOVING DUPLICATE FUNCTION
async function actualLoadTreeConfirmed(filename) {
    showLoading();
    try {
        const loadResponse = await fetch(`http://localhost:${serverPort}/api/load-tree/${filename.replace(/\\/g, '/')}`);
        if (!loadResponse.ok) {
            return; // 静默处理加载失败
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
        // 静默处理加载失败
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
        }
    } catch (error) {
        // 静默处理删除失败
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
// 添加防抖函数
let lastThinkingContent = '';

function displayThinkingProcess(title, thinkingText, isComplete = false) {
    // 如果内容没有变化且不是完成状态，跳过更新
    if (!isComplete && thinkingText === lastThinkingContent) {
        return;
    }
    
    // 直接更新思维过程
    actualUpdateThinkingProcess(title, thinkingText, isComplete);
    
    lastThinkingContent = thinkingText;
}

function actualUpdateThinkingProcess(title, thinkingText, isComplete = false) {
    const contentDiv = document.getElementById('documentContent');
    
    // 获取或创建 documentView 元素
    let documentView = document.getElementById('documentView');
    if (!documentView) {
        // 创建文档视图容器，思维链和文档内容将共用这个容器
        contentDiv.innerHTML = `
            <div class="document-view" id="documentView"></div>
            <textarea class="document-editor" id="documentEditor" style="display:none;"></textarea>
        `;
        documentView = document.getElementById('documentView');
        
        // 打开侧边栏
        document.getElementById('sidebar').classList.add('open');
    }
    
    // 解析思维过程的Markdown内容
    let htmlContent;
    if (documentView.dataset.lastThinkingContent !== thinkingText) {
        htmlContent = parseMarkdown(thinkingText);
        documentView.dataset.lastThinkingContent = thinkingText;
    } else {
        // 使用缓存的内容，只更新状态
        htmlContent = documentView.innerHTML.replace(/<span class="thinking-dots">\.\.\.<\/span>/, '');
    }
    
    if (isComplete) {
        // 思维过程完成，显示完整内容
        documentView.innerHTML = `
            <div class="thinking-section" style="
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                border-left: 4px solid #4CAF50;
                border: 1px solid #ddd;
                padding: 15px;
                border-radius: 8px;
                font-style: italic;
                color: #555;
                line-height: 1.6;
                font-size: 13px;
                margin-bottom: 20px;
            ">
                <div style="
                    color: #4CAF50;
                    font-weight: bold;
                    margin-bottom: 10px;
                    font-size: 14px;
                ">🧠 AI思维过程</div>
                ${htmlContent}
            </div>
        `;
        
        // 渲染数学公式（只在完成时且包含数学公式时）
        if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise === 'function') {
            const hasMath = thinkingText.includes('$') || thinkingText.includes('\\(') || thinkingText.includes('\\[');
            if (hasMath) {
                MathJax.typesetClear([documentView]);
                MathJax.typesetPromise([documentView]).catch((e) => console.error('MathJax rendering error:', e));
            }
        }
    } else {
        // 思维过程进行中，显示动态内容
        documentView.innerHTML = `
            <div class="thinking-section" style="
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                border-left: 4px solid #4CAF50;
                border: 1px solid #ddd;
                padding: 15px;
                border-radius: 8px;
                font-style: italic;
                color: #555;
                line-height: 1.6;
                font-size: 13px;
                margin-bottom: 20px;
            ">
                <div style="
                    color: #4CAF50;
                    font-weight: bold;
                    margin-bottom: 10px;
                    font-size: 14px;
                ">🤔 AI正在思考...</div>
                ${htmlContent}<span class="thinking-dots">...</span>
            </div>
        `;
        
        // 添加思考动画（只添加一次）
        if (!document.querySelector('style[data-thinking-animation]')) {
            const style = document.createElement('style');
            style.textContent = `
                .thinking-dots {
                    animation: blink 1.4s infinite both;
                    color: #4CAF50;
                    font-weight: bold;
                }
                @keyframes blink {
                    0%, 80%, 100% { opacity: 0; }
                    40% { opacity: 1; }
                }
            `;
            style.setAttribute('data-thinking-animation', 'true');
            document.head.appendChild(style);
        }
    }
    
    // 减少network.fit调用频率
    if (network && isComplete) {
        setTimeout(() => network.fit(), 300);
    }
}

// 显示完整文档（包含思维过程和最终内容）
function displayDocumentWithThinking(title, thinkingText, finalContent, isStreaming = false) {
    document.getElementById('documentTitle').textContent = title;
    const contentDiv = document.getElementById('documentContent');
    
    // 只在非流式更新时保存和恢复滚动位置
    const currentScrollTop = isStreaming ? null : contentDiv.scrollTop;
    
    // 获取或创建 documentView 元素
    let documentView = document.getElementById('documentView');
    if (!documentView) {
        contentDiv.innerHTML = `
            <div class="document-view" id="documentView"></div>
            <textarea class="document-editor" id="documentEditor" style="display:none;"></textarea>
        `;
        documentView = document.getElementById('documentView');
        
        // 显示顶部编辑按钮
        const editDocumentBtn = document.getElementById('editDocumentBtn');
        if (editDocumentBtn) {
            editDocumentBtn.style.display = 'inline-block';
        }
        
        // 添加编辑控制按钮容器（如果不存在）
        if (!document.getElementById('editControlButtons')) {
            const editControlDiv = document.createElement('div');
            editControlDiv.id = 'editControlButtons';
            editControlDiv.className = 'document-edit-controls';
            editControlDiv.style.display = 'none';
            editControlDiv.innerHTML = `
                <button class="btn btn-primary" id="saveDocumentBtn" onclick="saveDocumentChanges()">保存更改</button>
                <button class="btn" id="cancelEditBtn" onclick="cancelEdit()">取消</button>
            `;
            documentView.parentNode.insertBefore(editControlDiv, documentView.nextSibling);
        }
        
        // 打开侧边栏
        document.getElementById('sidebar').classList.add('open');
    }
    
    // 解析思维过程和最终内容
    const thinkingHtml = parseMarkdown(thinkingText);
    const finalHtml = parseMarkdown(finalContent);
    
    // 在同一个容器中显示思维过程和最终内容
    documentView.innerHTML = `
        <div class="thinking-section" style="
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-left: 4px solid #4CAF50;
            border: 1px solid #ddd;
            padding: 15px;
            border-radius: 8px;
            font-style: italic;
            color: #555;
            line-height: 1.6;
            font-size: 13px;
            margin-bottom: 20px;
        ">
            <div style="
                color: #4CAF50;
                font-weight: bold;
                margin-bottom: 10px;
                font-size: 14px;
            ">🧠 AI思维过程</div>
            ${thinkingHtml}
        </div>
        <div class="final-content" style="
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            line-height: 1.6;
        ">
            ${finalHtml}
        </div>
    `;
    
    // 更新 documentEditor 的内容
    const documentEditor = document.getElementById('documentEditor');
    if (documentEditor) {
        // 将思维过程和最终内容合并保存
        const combinedContent = `## AI思维过程\n\n${thinkingText}\n\n## 最终内容\n\n${finalContent}`;
        documentEditor.value = combinedContent;
        documentEditor.setAttribute('data-original-content', combinedContent.replace(/"/g, '&quot;'));
    }
    
    // 渲染数学公式（只在包含数学公式时）
    if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise === 'function') {
        const hasMath = (thinkingText && (thinkingText.includes('$') || thinkingText.includes('\\(') || thinkingText.includes('\\['))) ||
                       (finalContent && (finalContent.includes('$') || finalContent.includes('\\(') || finalContent.includes('\\[')));
        if (hasMath) {
            // 清除之前的MathJax处理，重新渲染
            MathJax.typesetClear([documentView]);
            MathJax.typesetPromise([documentView]).catch((e) => console.error('MathJax rendering error:', e));
        }
    }
    
    // 只在非流式更新时恢复滚动位置
    if (!isStreaming && currentScrollTop > 0) {
        contentDiv.scrollTop = currentScrollTop;
    }
}


