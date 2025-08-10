// ==UserScript==
// @name         Pony Town 功能插件
// @namespace    http://tampermonkey.net/
// @version      0.1.5
// @description  添加百炼deepseek模型
// @author       YourName
// @match        https://pony.town/*
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// ==/UserScript==

(function() {
    'use strict';

    // 定义变量
    const DEEPSEEK_API_KEY = ''; // 替换为您的DeepSeek API密钥
    // const DEEPSEEK_API_KEY = ''; // 替换为您的DeepSeek API密钥   
    const DEEPSEEK_MODEL = 'deepseek-chat';
    // const DEEPSEEK_MODEL = 'deepseek-r1-distill-qwen-1.5b';
    const URL = 'https://api.deepseek.com/chat/completions';
    // const URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    
    const USERNAME = 'deepseek聊天机器人'; // 替换为您的角色名

    const COOLDOWN_TIME = 10000; // 聊天回复冷却时间(毫秒)

    // 状态变量
    let cooldownActive = false;
    let lastChatContent = ''; // 记录上一条消息内容

    // ------------执行具体逻辑-----------

    // 获取最后一条聊天消息
    function getLastChatMessage() {
        const chatLines = document.querySelectorAll('.chat-line');
        if (!chatLines.length) return null;

        const lastLine = chatLines[chatLines.length - 1];
        const nameElement = lastLine.querySelector('.chat-line-name-content');
        const messageElement = lastLine.querySelector('.chat-line-message');
        const labelElement = lastLine.querySelector('.chat-line-label');

        if (!nameElement || !messageElement) return null;
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
        if( messageElement.textContent.trim() ==='Rejoined' || lastLine.classList.contains('chat-line-system')){
            console.log("系统消息");
            return null;
        }

        return {
            name: nameElement.textContent.trim(),
            message: messageElement.textContent.trim(),
            element: messageElement
        };
    }
    // https://bailian.console.aliyun.com/
    // 发送消息到阿里云的百炼大模型 Deepseek API
    async function queryDeepSeek(message) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                data: JSON.stringify({
                    model: DEEPSEEK_MODEL,
                    messages: [{ role: 'user', content: message }],
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
    // https://platform.deepseek.com/
    // 发送消息到DeepSeek API
    // async function queryDeepSeek(message) {
    //     return new Promise((resolve, reject) => {
    //         GM_xmlhttpRequest({
    //             method: 'POST',
    //             url: URL,
    //             headers: {
    //                 'Content-Type': 'application/json',
    //                 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    //             },
    //             data: JSON.stringify({
    //                 model: DEEPSEEK_MODEL,
    //                 messages: [{
    //                     role: 'user',
    //                     content: message
    //                 }],
    //                 temperature: 0.7,
    //                 max_tokens: 1024
    //             }),
    //             onload: (response) => {
    //                 try {
    //                     const data = JSON.parse(response.responseText);
    //                     if (data.choices && data.choices.length > 0) {
    //                         resolve(data.choices[0].message.content.trim());
    //                     } else {
    //                         reject('API返回空响应');
    //                     }
    //                 } catch (e) {
    //                     reject('解析API响应失败');
    //                 }
    //             },
    //             onerror: (error) => {
    //                 reject(`API请求错误: ${error.status}`);
    //             }
    //         });
    //     });
    // }

    // 在聊天框中发送回复
    function sendChatReply(message) {
        const chatInput = document.querySelector('.chat-textarea.chat-commons.hide-scrollbar');
        const sendButton = document.querySelector("#chat-box > div > div > div.chat-box-controls > ui-button > button")


        if (chatInput && sendButton) {
            chatInput.value = message;


            // 触发输入事件以确保游戏检测到变化
            const event = new Event('input', { bubbles: true });
            chatInput.dispatchEvent(event);

            // 随机延迟后发送
            setTimeout(() => {
                sendButton.click();
                console.log('已发送聊天回复:', message);
                cooldownActive = true;
                setTimeout(() => cooldownActive = false, COOLDOWN_TIME);
            }, 2000 + Math.random() * 3000);
        }else{
            console.log('发送聊天回复失败');
        }
    }

    function isChatable(){

        const chatInput = document.querySelector('.chat-textarea.chat-commons.hide-scrollbar');
        const sendButton = document.querySelector("#chat-box > div > div > div.chat-box-controls > ui-button > button")

        if (chatInput && sendButton) {
            console.log("可以聊天");
            return false;
        }
        console.log("尝试聊天");
        document.querySelector("#chat-box > ui-button > button").click();
        return false;
    }




    // 处理聊天回复逻辑
    async function processChatMessages() {
        if (cooldownActive || !autoChatEnabled) return; // 增加开关检查

        const chat = getLastChatMessage();
        if (!chat || chat.name === USERNAME) return;

        // 检查消息是否重复（新增核心逻辑）
        if (chat.message === lastChatContent) {
            console.log('忽略重复消息:', chat.message);
            return;
        }

        // 当前是否适合进行聊天
        if(isChatable()) return;


        try {
            console.log('收到新消息:', `${chat.name}: ${chat.message}`);

            // 调用DeepSeek API获取回复
            const response = await queryDeepSeek(
                `你是一个在Pony Town游戏中的小马角色，叫${USERNAME}。以下消息是其他角色对你说的，请用30个字符以内的简短可爱的回复：\n\n` +
                `[${chat.name}]: ${chat.message}` 
            );

            // 记录上一次消息
            lastChatContent = chat.message;
            console.log('记录上一次消息：',`${lastChatContent}`);

            // 发送回复
            if (response) {
                console.log('DeepSeek回复:', response);
                sendChatReply(response);
            }
        } catch (error) {
            console.error('处理聊天时出错:', error);
        }
    }


    //------------------控制面板---------------------

    // 新增控制状态变量
    let autoChatEnabled = true;
    let controlPanel;

    function createControlPanel() {
        // 创建面板容器
        controlPanel = document.createElement('div');
        controlPanel.style.position = 'fixed';
        controlPanel.style.bottom = '20px';
        controlPanel.style.right = '20px';
        controlPanel.style.zIndex = '9999';
        controlPanel.style.display = 'flex';
        controlPanel.style.flexDirection = 'column';
        controlPanel.style.gap = '10px';
        controlPanel.style.padding = '10px';
        controlPanel.style.backgroundColor = 'rgba(30, 30, 46, 0.8)';
        controlPanel.style.borderRadius = '12px';
        controlPanel.style.backdropFilter = 'blur(4px)';
        controlPanel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        controlPanel.style.border = '1px solid #44475a';

        // 聊天开关按钮
        const chatButton = createControlButton(
            '聊天开关',
            autoChatEnabled ? '🟢 聊天开启' : '🔴 聊天关闭',
            () => toggleFeature('chat')
        );


        // 添加到面板
        controlPanel.appendChild(chatButton);
        document.body.appendChild(controlPanel);
    }

    // 创建统一风格的按钮
    function createControlButton(title, text, onClick) {
        const button = document.createElement('button');
        button.title = title;
        button.textContent = text;
        button.style.padding = '8px 15px';
        button.style.borderRadius = '8px';
        button.style.border = 'none';
        button.style.background = 'linear-gradient(to right, #4834d4, #686de0)';
        button.style.color = 'white';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '500';
        button.style.transition = 'transform 0.2s, box-shadow 0.2s';
        button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

        button.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => { this.style.transform = 'scale(1)'; }, 200);
            onClick();
        });

        button.addEventListener('mouseenter', () => {
            button.style.boxShadow = '0 4px 8px rgba(72, 52, 212, 0.4)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        });

        return button;
    }
        // 切换功能开关
    function toggleFeature(type) {
        if (type === 'chat') {
            autoChatEnabled = !autoChatEnabled;
            controlPanel.children[0].textContent = autoChatEnabled ? '🟢 聊天开启' : '🔴 聊天关闭';
            localStorage.setItem('ptAutoChat', autoChatEnabled);
            console.log(`聊天功能 ${autoChatEnabled ? '启用' : '禁用'}`);
        }
    }

    function initScript(){
        //初始化名称


        // 生成按钮

        // 从存储加载状态
        autoChatEnabled = localStorage.getItem('ptAutoChat') !== 'false';

        // 创建控制面板
        createControlPanel();

        // 确保面板不被游戏覆盖
        const style = document.createElement('style');
        style.textContent = `div[style*="z-index: 1300;"] ~ #tampermonkey-controls { z-index: 9999 !important; }`;
        document.head.appendChild(style);
        controlPanel.id = 'tampermonkey-controls';
    }

    // 启动脚本
    setTimeout(() => {
        //初始化
        initScript();
        // 额外的聊天消息监控
        setInterval(processChatMessages, 10000);

    }, 3000);
})();