const { startServer } = require('./server/server');
const { exec } = require('child_process');

async function start() {
    console.log('启动知识树Web应用...');
    
    try {
        // 启动服务器
        const server = await startServer();
        const port = server.address().port;
        const url = `http://localhost:${port}`;
        
        console.log(`\n✅ 服务器已启动在 ${url}`);
        console.log('\n📝 使用说明：');
        console.log('1. 在浏览器中访问上述地址');
        console.log('2. 点击"API设置"配置您的DeepSeek API Key');
        console.log('3. 点击"新建节点"开始创建知识树');
        console.log('\n按 Ctrl+C 停止服务器\n');
        
        // 自动打开浏览器
        const platform = process.platform;
        let command;
        
        if (platform === 'win32') {
            command = `start ${url}`;
        } else if (platform === 'darwin') {
            command = `open ${url}`;
        } else {
            command = `xdg-open ${url}`;
        }
        
        exec(command, (error) => {
            if (error) {
                console.log('💡 提示：请手动在浏览器中打开:', url);
            }
        });
    } catch (error) {
        console.error('❌ 启动失败:', error.message);
        process.exit(1);
    }
}

// 处理退出信号
process.on('SIGINT', () => {
    console.log('\n\n正在关闭服务器...');
    process.exit(0);
});

// 处理未捕获的错误
process.on('uncaughtException', (error) => {
    console.error('❌ 发生错误:', error);
});

start(); 