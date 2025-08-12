// ==UserScript==
// @name         Pony Town 功能插件
// @namespace    http://tampermonkey.net/
// @version      0.2.3
// @description  version 0.2.3 修复bug：并发聊天，导致重复消息
// @author       西西
// @match        https://pony.town/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// ==/UserScript==

(function() {
    'use strict';

    //工具类
    //互斥锁
    class Mutex {
        constructor() {
            this.queue = [];
            this.locked = false;
        }
        async lock() {
            return new Promise(resolve => {
            if (this.locked) this.queue.push(resolve);
            else {
                this.locked = true;
                resolve();
            }
            });
        }
        unlock() {
            if (this.queue.length > 0) this.queue.shift()();
            else this.locked = false;
        }
    }
    // 定义模型配置
    const MODEL_CONFIGS = [
        {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',  
            url: 'https://api.deepseek.com/chat/completions',
            apiKey: '' // 替换为您的API密钥
        },
        {
            id: 'deepseek-r1-distill-qwen-1.5b',
            name: 'DeepSeek R1 distill-qwen-1.5b(阿里云百炼免费)',
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            apiKey: '' // 替换为您的API密钥
        },
        {
            id: 'deepseek-r1-0528',
            name: 'DeepSeek R1 0528',
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            apiKey: '' // 替换为您的API密钥
        }
    ];

    // 默认设置
    const DEFAULT_SETTINGS = {
        autoChatEnabled: true,
        selectedModelId: MODEL_CONFIGS[0].id,
        cooldownTime: 10000 // 聊天回复冷却时间(毫秒)
    };
    
    // 新增状态变量
    let conversationHistory = []; // 存储对话上下文
    let lastInteractionTime = Date.now(); // 最后交互时间戳
    const HISTORY_TIMEOUT = 300000; // 5分钟无交互清除历史(毫秒)

    // 状态变量
    let settings = {...DEFAULT_SETTINGS};
    let cooldownActive = false;
    let lastChatContent = '';
    const USERNAME = 'deepseek聊天机器人'; // 替换为您的角色名

    // ------------核心功能函数-----------

    // 获取最后一条聊天消息
    function getLastChatMessage() {
        const chatLines = document.querySelectorAll('.chat-line');
        if (!chatLines.length) return null;

        const lastLine = chatLines[chatLines.length - 1];
        const nameElement = lastLine.querySelector('.chat-line-name-content');
        const messageElement = lastLine.querySelector('.chat-line-message');
        const labelElement = lastLine.querySelector('.chat-line-label');

        if (!nameElement || !messageElement) return null;
        const msg = messageElement.textContent.trim();
        
        // 检查消息是否重复（新增核心逻辑）
        if (msg === lastChatContent){
            console.log('忽略重复消息:', msg);
            return;
        }

        if (lastLine.classList.contains('chat-line-party')){
            console.log("派对消息");
            return null;

        }
        if(nameElement.textContent.trim() === USERNAME){

            console.log("自己消息");
            return null;
        }

        const titleValue = labelElement.getAttribute('title');

        // if (titleValue && titleValue.trim() === 'Whisper' && lastLine.textContent.includes('To')) {
        //     console.log("自己消息");
        //     return null;
        // }

        if (titleValue && titleValue.trim() === 'Whisper') {
            console.log("私聊消息");
            return null;
        }
        if( msg ==='Rejoined' || lastLine.classList.contains('chat-line-system')){
            console.log("系统消息");
            return null;
        }

        return {
            name: nameElement.textContent.trim(),
            message: msg,
            element: messageElement
        };
    }

    // 查询AI模型
    async function queryAI(message, userName) {
        const modelConfig = MODEL_CONFIGS.find(m => m.id === settings.selectedModelId);
        if (!modelConfig) throw new Error('未找到模型配置');
        
        // 构建多轮对话消息
        const messages = [
            { role: 'system', content: `你是Pony Town中的小马${USERNAME}，尽量用30字符内简短可爱的对话回复以下小马的消息（小马名字：消息）` }
        ];
        
        // 添加上下文（如果启用）
        if (settings.multiTurnEnabled && conversationHistory.length > 0) {
            messages.push(...conversationHistory);
        }
        
        messages.push({ role: 'user', content: `[${userName}]: ${message}` });


        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: modelConfig.url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${modelConfig.apiKey}`
                },
                data: JSON.stringify({
                    model: modelConfig.id,
                    messages: messages,
                    stream: false
                }),
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.choices && data.choices.length > 0) {
                            resolve(data.choices[0].message.content.trim());
                        } else {
                            reject('API返回空响应');
                        }
                    } catch (e) {
                        reject('解析API响应失败');
                    }
                },
                onerror: (error) => {
                    reject(`API请求错误: ${error.status}`);
                }
            });
        });
    }
    
    const messageMutex = new Mutex(); // 全局锁实例

    // 发送聊天回复
    function sendChatReply(message) {

        const chatInput = document.querySelector('.chat-textarea.chat-commons.hide-scrollbar');
        const sendButton = document.querySelector("#chat-box > div > div > div.chat-box-controls > ui-button > button");

        if (chatInput && sendButton) {
            chatInput.value = message;
            const event = new Event('input', { bubbles: true });
            chatInput.dispatchEvent(event);

            setTimeout(() => {
                sendButton.click();
                console.log('已发送聊天回复:', message);
                cooldownActive = true;
                setTimeout(() => cooldownActive = false, settings.cooldownTime);
            }, 1000 + Math.random() * 2000);
        } else {
            console.log('发送聊天回复失败');
        }
    }

    // 处理聊天消息
    async function processChatMessages() {
        if (cooldownActive || !settings.autoChatEnabled) return;

        const chat = getLastChatMessage();
        if (!chat) return;
        await messageMutex.lock(); // 加锁

        try {
            console.log('收到新消息:', `${chat.name}: ${chat.message}`);
            lastChatContent = chat.message;
            // 清除过期历史
            if (Date.now() - lastInteractionTime > HISTORY_TIMEOUT) {
                conversationHistory = [];
            }

            lastInteractionTime = Date.now();
            
            const response = await queryAI(chat.name,chat.message);
            if (response) {
                console.log('AI回复:', response);
                // 存储上下文（如果启用多轮对话）
                if (settings.multiTurnEnabled) {
                    conversationHistory.push(
                        { role: 'user', content: chat.message },
                        { role: 'assistant', content: response }
                    );
                    // 限制历史长度（保留最近3轮对话）
                    if (conversationHistory.length > 6) {
                        conversationHistory = conversationHistory.slice(-6);
                    }
                }
                
                sendChatReply(response);
            }
        } catch (error) {
            console.error('处理聊天时出错:', error);
        } finally {
            messageMutex.unlock(); // 解锁
        }
    }

    //------------------控制面板-------------------

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'pt-control-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 15px;
            background: rgba(30, 30, 46, 0.85);
            border-radius: 12px;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            border: 1px solid #44475a;
            color: #f8f8f2;
            font-family: Arial, sans-serif;
            min-width: 280px;
        `;

        // 标题
        const title = document.createElement('div');
        title.textContent = 'Pony Town 助手';
        title.style.cssText = `
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #bd93f9;
            text-align: center;
        `;
        panel.appendChild(title);

        // 聊天开关
        const chatToggle = createControlButton(
            settings.autoChatEnabled ? '🟢 聊天开启' : '🔴 聊天关闭',
            () => toggleFeature('autoChatEnabled'),
            settings.autoChatEnabled ? '#50fa7b' : '#ff5555'
        );
        chatToggle.title = '开启/关闭自动聊天功能';
        panel.appendChild(chatToggle);


        // 新增多轮对话开关
        const multiTurnButton = createControlButton(
            settings.multiTurnEnabled ? '🟢 多轮对话开启' : '🔴 多轮对话关闭',
            () => toggleFeature('multiTurnEnabled'),
            settings.multiTurnEnabled ? '#50fa7b' : '#ff5555'
        );
        multiTurnButton.title = '开启/关闭上下文记忆功能';
        panel.appendChild(multiTurnButton);


        // 模型选择器
        const modelSelector = document.createElement('select');
        modelSelector.id = 'model-selector';
        modelSelector.style.cssText = `
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #6272a4;
            background: #282a36;
            color: #f8f8f2;
            margin-top: 8px;
            cursor: pointer;
        `;

        MODEL_CONFIGS.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            option.selected = model.id === settings.selectedModelId;
            modelSelector.appendChild(option);
        });

        modelSelector.addEventListener('change', function() {
            settings.selectedModelId = this.value;
            GM_setValue('pt_settings', settings);
            console.log('已切换模型:', this.options[this.selectedIndex].text);
        });

        const modelLabel = document.createElement('div');
        modelLabel.textContent = 'AI模型:';
        modelLabel.style.marginTop = '12px';
        modelLabel.style.marginBottom = '5px';
        modelLabel.style.fontSize = '14px';
        panel.appendChild(modelLabel);
        panel.appendChild(modelSelector);

        // 冷却时间调节器
        const cooldownLabel = document.createElement('div');
        cooldownLabel.textContent = `冷却时间: ${settings.cooldownTime/1000}秒`;
        cooldownLabel.style.marginTop = '12px';
        cooldownLabel.style.marginBottom = '5px';
        cooldownLabel.style.fontSize = '14px';
        panel.appendChild(cooldownLabel);

        const cooldownSlider = document.createElement('input');
        cooldownSlider.type = 'range';
        cooldownSlider.min = '3';
        cooldownSlider.max = '20';
        cooldownSlider.value = settings.cooldownTime/1000;
        cooldownSlider.style.width = '100%';
        cooldownSlider.style.cursor = 'pointer';

        cooldownSlider.addEventListener('input', function() {
            settings.cooldownTime = this.value * 1000;
            cooldownLabel.textContent = `冷却时间: ${this.value}秒`;
            GM_setValue('pt_settings', settings);
        });
        panel.appendChild(cooldownSlider);

        // 状态指示器
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'pt-status';
        statusIndicator.textContent = '状态: 运行中';
        statusIndicator.style.marginTop = '15px';
        statusIndicator.style.paddingTop = '15px';
        statusIndicator.style.borderTop = '1px solid #6272a4';
        statusIndicator.style.fontSize = '13px';
        statusIndicator.style.color = '#8be9fd';
        panel.appendChild(statusIndicator);

        // 新增历史状态指示器
        const historyIndicator = document.createElement('div');
        historyIndicator.id = 'pt-history';
        historyIndicator.textContent = conversationStatus();
        historyIndicator.style.marginTop = '10px';
        historyIndicator.style.fontSize = '12px';
        panel.appendChild(historyIndicator);
        

        document.body.appendChild(panel);

        // 添加可拖动功能
        makeElementDraggable(panel);
    }

    function createControlButton(text, onClick, color = '#bd93f9') {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            padding: 10px 15px;
            border-radius: 8px;
            border: none;
            background: ${color};
            color: #282a36;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        `;

        button.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => { this.style.transform = 'scale(1)'; }, 200);
            onClick();
        });

        button.addEventListener('mouseenter', () => {
            button.style.filter = 'brightness(1.1)';
            button.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.filter = 'none';
            button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        });

        return button;
    }

    function makeElementDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        const header = document.createElement('div');
        header.textContent = '≡';
        header.style.cssText = `
            padding: 8px;
            cursor: move;
            text-align: center;
            background: rgba(40, 42, 54, 0.7);
            border-radius: 8px 8px 0 0;
            color: #f8f8f2;
            font-size: 18px;
            user-select: none;
        `;
        element.insertBefore(header, element.firstChild);

        header.addEventListener('mousedown', dragMouseDown);

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.right = "unset";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);
        }
    }

        
    // 辅助函数
    function conversationStatus() {
        if (!settings.multiTurnEnabled) return '上下文记忆: 已禁用';
        const entries = conversationHistory.length / 2;
        const remaining = (HISTORY_TIMEOUT - (Date.now() - lastInteractionTime)) / 60000;
        return `上下文: ${entries}轮对话 | 超时: ${remaining.toFixed(1)}分钟`;
    }

    function toggleFeature(feature) {
        settings[feature] = !settings[feature];
        GM_setValue('pt_settings', settings);

        const statusElement = document.getElementById('pt-status');
        if (statusElement) {
            statusElement.textContent = `状态: ${settings[feature] ? '运行中' : '已暂停'}`;
        }

        // 更新按钮文本
        if (feature === 'autoChatEnabled') {
            const button = document.querySelector('#pt-control-panel > button');
            if (button) {
                button.textContent = settings.autoChatEnabled ? '🟢 聊天开启' : '🔴 聊天关闭';
                button.style.background = settings.autoChatEnabled ? '#50fa7b' : '#ff5555';
            }
        }// 多轮对话特殊处理
        if (feature === 'multiTurnEnabled') {
            if (!settings.multiTurnEnabled) {
                conversationHistory = []; // 关闭时清除历史
            }
            // 更新状态显示
            const historyElement = document.getElementById('pt-history');
            if (historyElement) {
                historyElement.textContent = conversationStatus();
            }
        }
        console.log(`功能 ${feature} ${settings[feature] ? '启用' : '禁用'}`);
    }

    function initScript() {
        // 加载保存的设置
        const savedSettings = GM_getValue('pt_settings');
        if (savedSettings) {
            settings = {...DEFAULT_SETTINGS, ...savedSettings};
        }

        // 创建控制面板
        createControlPanel();

        // 确保面板不被游戏覆盖
        const style = document.createElement('style');
        style.textContent = `
            div[style*="z-index: 1300;"] ~ #pt-control-panel {
                z-index: 9999 !important;
            }
            .chat-box-controls {
                z-index: 9998 !important;
            }
        `;
        document.head.appendChild(style);
    }
    // 初始化定时更新器
    function initHistoryUpdater() {
        setInterval(() => {
            const historyElement = document.getElementById('pt-history');
            if (historyElement && settings.multiTurnEnabled) {
                historyElement.textContent = conversationStatus();
            }
        }, 60000); // 每分钟更新状态
    }
    // 启动脚本
    setTimeout(() => {
        initScript();
        setInterval(processChatMessages, 5000);
        initHistoryUpdater(); // 启动状态更新器
        console.log('Pony Town自动聊天脚本已启动');
    }, 3000);

})();