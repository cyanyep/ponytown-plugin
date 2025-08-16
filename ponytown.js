// ==UserScript==
// @name         Pony Town 功能插件
// @namespace    http://tampermonkey.net/
// @version      0.3.5
// @description  1.消息超长分割发送功能；2.优化海龟汤提示词；
// @author       西西
// @match        https://pony.town/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// ==/UserScript==

(function () {
    'use strict';

    //-------------------------------------------变量-------------------------------------------
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
        },
        {
            id: 'qwen-plus',
            name: 'qwen-plus',
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            apiKey: '' // 替换为您的API密钥
        },
        {
            id: 'qwen-plus-latest',
            name: 'qwen-plus-latest',
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            apiKey: '' // 替换为您的API密钥
        }
    ];
    // 新增海龟汤题库（添加在MODEL_CONFIGS下方）
    const TURTLE_SOUP_QUESTIONS = [
        {
            surface: "一名男子走进一家餐厅，点了一碗海龟汤，喝了几口后问服务员：‘这是真的海龟汤吗？’得到肯定答复后，他自杀了。为什么？",
            answer: "男子曾与恋人在海难中漂流。濒死时，恋人骗他喝下用自己肉煮的‘海龟汤’救了他。多年后他喝到真正的海龟汤，意识到当年吃的是恋人的肉",
            victoryCondition: "推理男子自杀的原因",
            additional: "涉及欺骗与记忆"
        },
        {
            surface: "一个人坐火车去邻镇看病，看完后病全好了。返程火车经过隧道时，他突然跳车自杀。为什么？",
            answer: "他患的是眼疾，治疗后复明。火车过隧道时陷入黑暗，他误以为旧病复发再次失明，绝望中自杀",
            victoryCondition: "解释跳车动机",
            additional: "与感知错觉有关"
        },
        {
            surface: "男子和女友在河边散步，女友落水失踪。几年后故地重游，钓鱼老人说‘这河从没长过水草’。男子听后跳河自杀。为什么？",
            answer: "当年救援时他曾抓住女友头发，却误以为是水草松手导致女友溺亡。得知真相后自责寻死",
            victoryCondition: "分析自杀触发点",
            additional: "关键线索是水草"
        },
        {
            surface: "母亲葬礼上，妹妹对一见钟情的男子消失耿耿于怀。一个月后，妹妹杀了姐姐。为什么？",
            answer: "妹妹认为只有再办一场葬礼才能见到那个男子，因此杀害姐姐制造葬礼机会",
            victoryCondition: "推敲杀人动机",
            additional: "非情感纠纷"
        },
        {
            surface: "当小明正准备离开家时，他无意中抬头，看了一眼全家福，那一瞬间，他意识到自己完蛋了",
            answer: "小明家里被杀人魔闯入，全家都遇害了只有小明躲在床底，逃过一劫，当外面安静后，他悄悄爬出，但看到全家福时他猛然意识到，歹徒如果也看见全家福会不会等他出来呢",
            victoryCondition: "解释小明为何意识到危险",
            additional: "与信息暴露有关"
        },
        {
            surface: "他喝了一口水，然后死了，但是水里没有毒",
            answer: "我是一名马戏团员工。这是我第一次在很多人面前表演吞剑。由于紧张我的喉部产生呕吐反射。于是我咽了一口口水，剑划破了我的喉部刺穿了我的胃，但他们并没有发现我的异常。!以为我在搞节目效果等到发现时。为时已晚我已经死了。",
            victoryCondition: "解释死亡的真实原因",
            additional: "与表演事故相关"
        }
    ];

    // 在全局变量部分新增
    const INVALID_PATTERNS = [
        /^[\s\W]+$/, // 纯符号或空格
        /^[0-9]{6,}$/,    // 纯数字（如电话号码）
    ];

    const CHAT_MODES = [
        { id: 'game-digital-bomb', name: '数字炸弹游戏模式', description: '简短回复(10字内)，专注于游戏操作' },

        { id: 'game-turtle-soup', name: '海龟汤游戏模式', description: '推理谜题游戏' },
        { id: 'chat', name: '聊天模式', description: '正常社交聊天(20-30字)' },
        { id: 'story', name: '剧情模式', description: '角色扮演，详细描述(50字左右)' },
    ];

    // 默认设置
    const DEFAULT_SETTINGS = {
        autoChatEnabled: true,
        selectedModelId: MODEL_CONFIGS[0].id,
        chatMode: 'chat', // 默认聊天模式
        cooldownTime: 10000, // 消息获取冷却时间(毫秒)
        maxHistoryTurns: 5 // 新增默认上下文轮数
    };

    // 新增状态变量
    let conversationHistory = []; // 存储对话上下文
    let lastInteractionTime = Date.now(); // 最后交互时间戳
    const HISTORY_TIMEOUT = 300000; // 5分钟无交互清除历史(毫秒)

    // 状态变量
    let settings = { ...DEFAULT_SETTINGS };
    let lastChatContent = '';
    let messageInterval; // 消息获取 定时器
    const USERNAME = 'deepseek聊天机器人'; // 替换为您的角色名


    // 游戏状态对象（需在外部作用域定义）
    let gameState = {
        digitalBomb: {
            isPlaying: false,        // 游戏是否进行中
            bombNumber: null,         // 炸弹数字
            minRange: 1,             // 当前范围最小值
            maxRange: 100,           // 当前范围最大值
            shouldAIGuess: false    // AI陪玩
        },
        turtleSoup: {
            isPlaying: false,
            currentIndex: 0,
            currentQuestion: null,
            correctAnswer: "",
            victoryCondition: "",
            currentPlayer: null,
            hintsUsed: 0
        }
    };

    //-------------------------------------------工具类-------------------------------------------
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
    // //消息队列
    // class MessageQueue {
    //     constructor() {
    //         this.queue = [];
    //         this.lock = new Mutex(); // 复用现有互斥锁
    //         this.maxSize = 50; // 最大队列长度
    //     }

    //     // 生产者：消息入队
    //     async enqueue(message) {
    //         await this.lock.lock();
    //         try {
    //             // 检查队列是否已满
    //             if (this.queue.length >= this.maxSize) {
    //                 console.warn('消息队列已满，丢弃最旧的消息');
    //                 this.queue.shift();
    //             }

    //             this.queue.push(message);
    //         } finally {
    //             this.lock.unlock();
    //         }
    //     }

    //     // 消费者：消息出队
    //     async dequeue() {
    //         await this.lock.lock();
    //         try {
    //             return this.queue.shift() || null;
    //         } finally {
    //             this.lock.unlock();
    //         }
    //     }

    //     // 检查队列状态
    //     getStatus() {
    //         return {
    //             size: this.queue.length,
    //             next: this.queue[0] 
    //                 ? `${this.queue[0].name}: ${this.queue[0].message.substring(0, 15)}${this.queue[0].message.length > 15 ? "..." : ""}`
    //                 : "无"
    //         };
    //     }
    // }


    // 阻塞队列
    class BlockingQueue {
        constructor() {
            this.queue = [];
            this.waitingConsumers = []; // 存储等待中的消费者Promise
            this.lock = new Mutex();    // 复用现有互斥锁
            this.maxSize = 50;
        }

        async enqueue(message) {
            await this.lock.lock();
            try {
                // 优先唤醒等待中的消费者
                if (this.waitingConsumers.length > 0) {
                    const resolve = this.waitingConsumers.shift();

                    resolve(message); // 直接传递消息给消费者
                    return;
                }

                // 无等待消费者时入队
                if (this.queue.length >= this.maxSize) {
                    console.warn('消息队列已满，丢弃最旧的消息');
                    this.queue.shift(); // 丢弃旧消息
                }
                this.queue.push(message);
            } finally {
                this.lock.unlock();
            }
        }

        // async dequeue() {
        //     await this.lock.lock();
        //     try {
        //         if (this.queue.length > 0) {
        //             return this.queue.shift();
        //         }
        //     } finally {
        //         this.lock.unlock();
        //     }
        //     // 如果在阻塞之前生产者获取锁并生产一个消息，会导致消息消费顺序不对
        //     // 队列为空时阻塞消费者
        //     return new Promise(resolve => {
        //         this.waitingConsumers.push(resolve);
        //     });
        // }
        async dequeue(timeout = 30000) {
            await this.lock.lock();
            try {
                if (this.queue.length > 0) {
                    return this.queue.shift();
                }
                console.info("消息队列空，阻塞等待消息")
            } finally {
                this.lock.unlock();
            }
            return new Promise((resolve, reject) => {
                const consumer = msg => {
                    clearTimeout(timer);
                    resolve(msg);
                };
                const timer = setTimeout(() => {
                    const index = this.waitingConsumers.indexOf(consumer);
                    if (index !== -1) this.waitingConsumers.splice(index, 1); // 移除回调
                    resolve(null); // 返回空
                }, timeout);
                this.waitingConsumers.push(consumer);
            });
        }
        getStatus() {
            return {
                size: this.queue.length,
                waiting: this.waitingConsumers.length, // 新增等待数
                next: this.queue[0]
                    ? `${this.queue[0].name}: ${this.queue[0].message.substring(0, 15)}${this.queue[0].message.length > 15 ? "..." : ""}`
                    : "无"
            };
        }
        // 新增清空队列方法
        clear() {
            this.queue = [];
            console.log('消息队列已清空');
        }
        // === 新增：删除最旧消息 ===
        async dequeueOldest() {
            await this.lock.lock();
            try {
                if (this.queue.length > 0) {
                    const removed = this.queue.shift(); // 移除最旧消息
                    console.log('已移除最旧消息:', `${removed.name}: ${removed.message.substring(0, 20)}...`);
                    return removed;
                }
                return null;
            } finally {
                this.lock.unlock();
            }
        }
    }

    // -----------------------聊天功能---------------------------

    // 初始化消息队列
    const messageQueue = new BlockingQueue();
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
        if (msg === lastChatContent) {
            console.log('忽略重复消息:', msg);
            return;
        }

        if (lastLine.classList.contains('chat-line-party')) {
            console.log("派对消息");
            return null;

        }
        if (nameElement.textContent.trim() === USERNAME) {

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
        if (msg === 'Rejoined' || lastLine.classList.contains('chat-line-system') || lastLine.classList.contains('chat-line-announcement')) {
            console.log("系统消息");
            return null;
        }


        // 发现有效消息时入队
        messageQueue.enqueue({
            name: nameElement.textContent.trim(),
            message: msg,
            element: messageElement,
        });

        // 更新最后消息内容
        lastChatContent = msg;
    }

    // 查询AI模型
    async function queryAI(message, userName, timeout = 30000) {
        const modelConfig = MODEL_CONFIGS.find(m => m.id === settings.selectedModelId);
        if (!modelConfig) throw new Error('未找到模型配置');

        // 构建多轮对话消息
        const messages = [
            { role: 'system', content: `作为小马「${USERNAME}」，回复其他小马消息，回复内容需<15字符。若提问则联网查答。'` }
        ];

        // 添加上下文（如果启用）
        if (settings.multiTurnEnabled && conversationHistory.length > 0) {
            messages.push(...conversationHistory);
        }

        messages.push({ role: 'user', content: `[${userName}]: ${message}` });


        return new Promise((resolve, reject) => {
            // 设置超时定时器（默认30秒）
            const timer = setTimeout(() => {
                reject('API请求超时');
                if (xhr) {
                    xhr.abort(); // 终止请求
                }
            }, timeout);
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
                    clearTimeout(timer); // 清除超时定时器
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
                    clearTimeout(timer); // 清除超时定时器
                    reject(`API请求错误: ${error.status}`);
                },
                ontimeout: () => {
                    clearTimeout(timer);
                    reject('API请求超时（ontimeout）');
                },
                timeout: timeout // 设置GM_xmlhttpRequest内置超时
            });
        });
    }

    const messageMutex = new Mutex(); // 全局锁实例

    // 发送聊天回复
    async function sendChatReply(message) {
        const MAX_MESSAGE_LENGTH = 150; // 单条消息最大长度
        const SPLIT_MESSAGE_LENGTH = 140; // 分割消息最大长度
        const CHUNK_DELAY_MS = 1500;   // 分片间延迟（毫秒）

        const chatInput = document.querySelector('.chat-textarea.chat-commons.hide-scrollbar');
        const sendButton = document.querySelector("#chat-box > div > div > div.chat-box-controls > ui-button > button");


        if (!chatInput || !sendButton) {
            console.log('发送聊天回复失败');
            return;
        }
        await messageMutex.lock();
        try {
            // 短消息直接发送
            if (message.length < MAX_MESSAGE_LENGTH) {
                await sendMessage(chatInput, sendButton, message);
            }         // 长消息分片发送
            else {
                const chunks = splitMessage(message, SPLIT_MESSAGE_LENGTH);
                for (const chunk of chunks) {
                    await sendMessage(chatInput, sendButton, chunk);
                    // 添加随机延迟（模拟人类操作）
                    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                }
            }

        }
        finally {
            messageMutex.unlock();
        }
    }
    async function sendMessage(chatInput, sendButton, message) {

        chatInput.value = message;
        const event = new Event('input', { bubbles: true });
        chatInput.dispatchEvent(event);

        // 添加随机延迟（模拟人类操作）
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        // 点击发送按钮
        sendButton.click();
        console.log('已发送聊天回复:', message);
    }
    // 内部工具函数：按固定长度分割消息
    function splitMessage(text, chunkSize) {
        const chunks = [];
        for (let offset = 0; offset < text.length; offset += chunkSize) {
            let endIndex = offset + chunkSize;
            chunks.push(text.slice(offset, endIndex));
        }
        return chunks;
    }
    async function handleChatMode(chat) {

        try {
            // 清除过期历史
            if (Date.now() - lastInteractionTime > HISTORY_TIMEOUT) {
                conversationHistory = [];
            }

            lastInteractionTime = Date.now();

            const response = await queryAI(chat.name, chat.message);
            if (response) {
                console.log('AI回复:', response);
                // 存储上下文（如果启用多轮对话）
                if (settings.multiTurnEnabled) {
                    conversationHistory.push(
                        { role: 'user', content: chat.message },
                        { role: 'assistant', content: response }
                    );
                    // 限制历史长度（保留最近n轮对话）
                    if (settings.multiTurnEnabled) {
                        if (conversationHistory.length > settings.maxHistoryTurns * 2) {
                            conversationHistory = conversationHistory.slice(-settings.maxHistoryTurns * 2);
                        }
                        updateHistoryDisplay();
                    }
                }

                sendChatReply(response);
            }
        } catch (error) {
            console.error('处理聊天时出错:', error);
        }
    }


    function initBombGame() {
        gameState.digitalBomb = {
            isPlaying: true,
            bombNumber: Math.floor(Math.random() * 100) + 1, // 1-100随机炸弹[4,6](@ref)
            minRange: 1,
            maxRange: 100,
            shouldAIGuess: false,
        };
        sendChatReply(
            `数字炸弹：范围: ${gameState.digitalBomb.minRange}-${gameState.digitalBomb.maxRange}。\n` +
            "请猜一个数字，我会缩小范围。\n" +
            "输入AI可以让我陪玩。"
        );
    }

    function handleDigitalBombMode(chat) {
        if (chat.message === "数字炸弹" || chat.message === "继续") {
            initBombGame();
            return;
        }
        if (chat.message === "结束") {
            switchChatMode("16261");
        }
        if (chat.message.toLowerCase() === "ai") {
            gameState.digitalBomb.shouldAIGuess = true;
            sendChatReply("我来陪你玩❤");
        }
        if (!gameState.digitalBomb.isPlaying) return;
        const guess = parseInt(chat.message);
        // 验证数字有效性
        // 忽略无效数字
        if (isNaN(guess)) return;
        if (guess < gameState.digitalBomb.minRange || guess > gameState.digitalBomb.maxRange) {
            sendChatReply(`🚫 请输入${gameState.digitalBomb.minRange}-${gameState.digitalBomb.maxRange}之间的有效数字！`);
            return;
        }
        // 猜中炸弹
        if (guess === gameState.digitalBomb.bombNumber) {
            gameState.digitalBomb.isPlaying = false;
            sendChatReply(`💥 ${chat.name} 触发了炸弹！游戏结束`);
            return;
        }

        // 更新范围并响应
        updateGameRange(guess, chat.name, gameState.digitalBomb.shouldAIGuess);
    }

    // 更新游戏范围
    function updateGameRange(guess, playerName, shouldAIGuess = false) {
        let action = "";
        if (guess > gameState.digitalBomb.bombNumber) {
            gameState.digitalBomb.maxRange = guess - 1;
            action = "猜大了，范围缩小至";
        } else {
            gameState.digitalBomb.minRange = guess + 1;
            action = "猜小了，范围缩小至";
        }

        // 发送玩家操作消息
        sendChatReply(`📉 ${playerName} ${action}${gameState.digitalBomb.minRange}-${gameState.digitalBomb.maxRange}`);

        // 根据参数决定是否触发AI猜测
        if (shouldAIGuess) {
            // AI自动猜测（二分法策略）
            const aiGuess = Math.floor((gameState.digitalBomb.minRange + gameState.digitalBomb.maxRange) / 2);
            let aiResult = `🤖 我的猜测：${aiGuess} - `;

            if (aiGuess === gameState.digitalBomb.bombNumber) {
                gameState.digitalBomb.isPlaying = false;
                aiResult += "我踩到炸弹了！玩家胜利！";
                sendChatReply(aiResult);
                return;
            } else if (aiGuess > gameState.digitalBomb.bombNumber) {
                gameState.digitalBomb.maxRange = aiGuess - 1;
                aiResult += "我猜大了";
            } else {
                gameState.digitalBomb.minRange = aiGuess + 1;
                aiResult += "我猜小了";
            }

            // 延迟发送AI猜测结果
            sendChatReply(
                `${aiResult}\n` +
                `当前范围：${gameState.digitalBomb.minRange}-${gameState.digitalBomb.maxRange}`
            );
        }
    }

    // 初始化海龟汤游戏
    function initTurtleSoupGame(index = -1) {
        // 1. 索引处理逻辑
        if (index >= 0) {
            index = index % TURTLE_SOUP_QUESTIONS.length; // 确保索引有效
        } else {
            index = Math.floor(Math.random() * TURTLE_SOUP_QUESTIONS.length); // 随机选择
        }

        const question = TURTLE_SOUP_QUESTIONS[index];

        gameState.turtleSoup = {
            isPlaying: true,
            currentIndex: index,
            currentQuestion: question.surface,
            correctAnswer: question.answer,
            victoryCondition: question.victoryCondition,
            hintsUsed: 0
        };

        sendChatReply(
            `🧠 海龟汤游戏开始！\n\n"${question.surface}"\n\n` +
            `请通过提问来揭开谜底，我只能回答：是、否、无关或部分正确\n` +
            `目标：${question.victoryCondition}`
        );
    }

    // 处理海龟汤游戏逻辑
    async function handleTurtleSoupMode(chat) {
        if (!gameState.turtleSoup.isPlaying) return;

        const userMessage = chat.message;
        // 特殊命令处理
        if (userMessage === "结束") {
            endTurtleSoupGame(false);
            return;
        }

        if (userMessage === "提示") {
            provideHint();
            return;
        }

        if (userMessage === "答案") {
            revealAnswer();
            return;
        }
        if (userMessage === "换一个" || userMessage === "换个") {
            initTurtleSoupGame(gameState.turtleSoup.currentIndex + 1);
            return;
        }


        // 2. 模式匹配过滤
        if (!INVALID_PATTERNS.some(pattern => pattern.test(userMessage))) {
            console.log('过滤无效提问：模式匹配', userMessage);
            return;
        }

        // 处理玩家提问
        try {
            const response = await queryTurtleSoupAI(chat.message);
            sendChatReply(chat.name + ":" + response);

            // 检查是否猜中答案
            if (response === "游戏结束") {
                endTurtleSoupGame(true);
            }
        } catch (error) {
            console.error('海龟汤游戏出错:', error);
            sendChatReply("处理问题时出错了，请换个问题试试");
        }
    }

    // 查询AI获取海龟汤回答
    async function queryTurtleSoupAI(question, timeout = 30000) {
        const modelConfig = MODEL_CONFIGS.find(m => m.id === settings.selectedModelId);

        // const messages = [
        //     {
        //         role: 'system',
        //         content: `你正在主持海龟汤推理游戏。当前谜题汤底：${gameState.turtleSoup.correctAnswer}\n` +
        //             `游戏规则：你只能回答"是"、"否"、"无关"或"部分正确"。\n` +
        //             `只有当玩家猜出汤底的相似意思才能回答"游戏结束"。\n` +
        //             `不要解释，不要提供额外信息，严格遵守规则。`
        //     },
        //     { role: 'user', content: question }
        // ];
        const messages = [
            {
                role: 'system',
                content: `# 海龟汤主持人指令（严格模式）
                ## 核心规则
                1. 你当前主持的谜题汤底：${gameState.turtleSoup.correctAnswer}
                2. 必须严格按以下标准判断玩家回答：
                - 玩家表述与汤底**核心事实完全一致** → 回答"游戏结束"
                - 玩家表述与汤底**表述的事实符合** → 回答"是"
                - 玩家表述与汤底**表述的事实矛盾** → 回答"否"
                - 玩家表述与汤底**表述的事实同时包含正确信息和错误推断** → 回答"部分正确"
                - 玩家表述**无关汤底逻辑** → 回答"无关"

                ## 游戏结束判定标准
                1. 玩家必须满足以下所有条件才能触发"游戏结束"：
                - 包含汤底中**所有关键要素**（人物、行为、动机、结果）
                - 表述逻辑与汤底**完全一致**（无偏差或附加信息）
                - 示例：
                    - 汤底："男子因误以为自己失明复发而自杀"
                    - 可接受答案："他以为自己又看不见了所以自杀"
                    - 拒绝答案："他眼睛有问题"（缺少自杀动机）

                ## 强制约束
                1. 禁止以下行为：
                - 主动透露汤底信息（即使玩家接近答案）
                - 对玩家回答做任何解释或补充
                - 使用"游戏结束"外的任何结束语
                2. 若玩家回答未达完整标准但正确（即涉及正确要素且无错误） → 回答"是"
                - 示例：
                    - 玩家："这个人自杀和视力有关吗？"
                    - 回答："是"
                3. 当回答同时包含：正确信息 + 错误/矛盾信息 → 回答"部分正确"
                - 示例：
                    - "他失明了才自杀" → 部分正确（错误：实际是误以为）
                    - "因视力自杀但他是盲人" → 部分正确（矛盾：汤底视力正常）

                ## 当前汤底关键要素（仅你可见）
                - 核心事实：${gameState.turtleSoup.correctAnswer}
                - 必须匹配要素：${gameState.turtleSoup.correctAnswer}`,
            },
            { role: 'user', content: question }
        ];
        return new Promise((resolve, reject) => {
            // 设置超时定时器（默认30秒）
            const timer = setTimeout(() => {
                reject('API请求超时');
                if (xhr) {
                    xhr.abort(); // 终止请求
                }
            }, timeout);
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
                    clearTimeout(timer); // 清除超时定时器
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
                    clearTimeout(timer); // 清除超时定时器
                    reject(`API请求错误: ${error.status}`);
                },
                ontimeout: () => {
                    clearTimeout(timer);
                    reject('API请求超时（ontimeout）');
                },
                timeout: timeout // 设置GM_xmlhttpRequest内置超时
            });
        });
    }

    // 提供提示
    function provideHint() {
        if (gameState.turtleSoup.hintsUsed >= 3) {
            sendChatReply("提示次数已用完！");
            return;
        }

        gameState.turtleSoup.hintsUsed++;
        const hints = [
            `💡 提示 #${gameState.turtleSoup.hintsUsed}: 思考${gameState.turtleSoup.victoryCondition}`,
            `💡 提示 #${gameState.turtleSoup.hintsUsed}: 注意谜题中的细节`,
            `💡 提示 #${gameState.turtleSoup.hintsUsed}: 考虑可能的情感因素`
        ];

        sendChatReply(hints[gameState.turtleSoup.hintsUsed - 1]);
    }

    // 揭示答案
    function revealAnswer() {
        sendChatReply(
            `🎉 谜底揭晓：\n\n${gameState.turtleSoup.correctAnswer}\n\n` +
            `游戏结束！输入"海龟汤"开始新游戏`
        );
        gameState.turtleSoup.isPlaying = false;
    }

    // 结束游戏
    function endTurtleSoupGame(isWin) {
        if (isWin) {
            sendChatReply(
                `🎉 恭喜你解开了谜题！\n\n正确答案：${gameState.turtleSoup.correctAnswer}\n\n` +
                `输入"海龟汤"开始新游戏`
            );
        } else {
            sendChatReply(
                `🛑 游戏结束！\n` +
                `输入"海龟汤"开始新游戏`
            );
        }
        gameState.turtleSoup.isPlaying = false;
    }

    async function switchChatMode(chat) {
        if (chat.message === '数字炸弹') {
            settings.chatMode = "game-digital-bomb";
            GM_setValue('pt_settings', settings);
            await sendChatReply(`开始游戏《数字炸弹》`);
            console.log(`已切换至"game-digital-bomb"模式`);
        } else if (chat.message === '16261') {
            settings.chatMode = "chat";
            GM_setValue('pt_settings', settings);
            console.log(`已切换至"chat"模式`);

        }
        else if (chat.message === '海龟汤' || chat.message === 'turtle soup') {
            settings.chatMode = "game-turtle-soup";
            GM_setValue('pt_settings', settings);
            await sendChatReply(`开始海龟汤推理游戏`);
            console.log(`已切换至"game-turtle-soup"模式`);
            initTurtleSoupGame();
        }
    }

    // 处理聊天消息
    async function processChatMessages() {
        while (settings.autoChatEnabled) {
            const chat = await messageQueue.dequeue();

            if (!chat) continue;

            console.log('处理消息:', `${chat.name}: ${chat.message}`);
            switchChatMode(chat);
            switch (settings.chatMode) {
                case 'game-digital-bomb':
                    handleDigitalBombMode(chat);
                    break;
                case 'story':
                    break;
                case 'game-turtle-soup':
                    await handleTurtleSoupMode(chat);
                    break;
                default: // chat模式
                    await handleChatMode(chat);
            }
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
            min-width: 40px;
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

        // === 新增：清空消息队列按钮 ===
        const clearQueueButton = createControlButton(
            '清空消息队列',
            () => {
                messageQueue.clear();
                QueueStatus();
            },
            '#ff79c6' // 粉色按钮
        );
        clearQueueButton.title = '清除当前所有待处理的消息';
        panel.appendChild(clearQueueButton);


        // === 新增：移除最旧消息按钮 ===
        const removeOldestButton = createControlButton(
            '移除最旧消息',
            async () => {
                const removed = await messageQueue.dequeueOldest();
                if (removed) {
                    // 更新队列状态显示
                    QueueStatus();

                    // 添加操作反馈
                    const feedback = `已移除: ${removed.name}的旧消息`;
                    console.log(feedback);
                    statusIndicator.textContent = feedback;
                    setTimeout(() => statusIndicator.textContent = '状态: 运行中', 3000);
                } else {
                    console.log('消息队列已空，无消息可移除');
                }
            },
            '#ffb86c' // 橙色按钮
        );
        removeOldestButton.title = '移除消息队列中最旧的一条待处理消息';
        panel.appendChild(removeOldestButton);


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

        modelSelector.addEventListener('change', function () {
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

        // ======消息获取间隔滑动条======
        const cooldownLabel = document.createElement('div');
        cooldownLabel.textContent = `消息获取间隔: ${settings.cooldownTime / 1000}秒`;
        cooldownLabel.style.marginTop = '12px';
        cooldownLabel.style.marginBottom = '5px';
        cooldownLabel.style.fontSize = '14px';
        panel.appendChild(cooldownLabel);

        const cooldownSlider = document.createElement('input');
        cooldownSlider.type = 'range';
        cooldownSlider.min = '1';
        cooldownSlider.max = '20';
        cooldownSlider.value = settings.cooldownTime / 1000;
        cooldownSlider.style.width = '100%';
        cooldownSlider.style.cursor = 'pointer';

        cooldownSlider.addEventListener('input', function () {
            settings.cooldownTime = this.value * 1000;
            cooldownLabel.textContent = `消息获取间隔: ${this.value}秒`;
            GM_setValue('pt_settings', settings);

            // 重启消息获取定时器
            clearInterval(messageInterval);
            messageInterval = setInterval(getLastChatMessage, settings.cooldownTime);
        });
        panel.appendChild(cooldownSlider);


        // ====== 上下文对话轮数滑动条 ======
        const historyLabel = document.createElement('div');
        historyLabel.textContent = `上下文记忆轮数: ${settings.maxHistoryTurns}`;
        historyLabel.style.marginTop = '12px';
        historyLabel.style.marginBottom = '5px';
        historyLabel.style.fontSize = '14px';
        panel.appendChild(historyLabel);

        const historySlider = document.createElement('input');
        historySlider.type = 'range';
        historySlider.min = '1';
        historySlider.max = '20';
        historySlider.value = settings.maxHistoryTurns;
        historySlider.style.width = '100%';
        historySlider.style.cursor = 'pointer';

        historySlider.addEventListener('input', function () {
            settings.maxHistoryTurns = parseInt(this.value);
            historyLabel.textContent = `上下文记忆轮数: ${this.value}`;
            GM_setValue('pt_settings', settings);

            // 立即应用新的历史长度限制
            trimConversationHistory();
        });
        panel.appendChild(historySlider);

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


        // 添加用于隐藏/显示的CSS样式
        const existingStyle = document.getElementById('pt-control-panel-style');
        if (!existingStyle) {
            const style = document.createElement('style');
            style.id = 'pt-control-panel-style';
            style.textContent = `
               #pt-control-panel.minimized {
                    width: 40px !important;       /* 圆形直径 */
                    height: 40px !important;      /* 与宽度相同 */
                    overflow: hidden !important;
                    padding: 0 !important;
                    border-radius: 50% !important; /* 关键：设为圆形 */
                    background: rgba(30, 30, 46, 0.85) !important; /* 保持背景色 */
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    cursor: pointer !important;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.25) !important; /* 保留阴影 */
                }
                #pt-control-panel.minimized div:first-child {
                    padding: 0 !important;
                    font-size: 24px !important;   /* 增大图标 */
                    line-height: 1 !important;
                    transform: translateY(-1px);  /* 微调居中 */
                }
                #pt-control-panel.minimized > *:not(:first-child) {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        // // 增加队列状态显示
        // const queueStatus = document.createElement('div');
        // queueStatus.id = 'pt-queue-status';
        // queueStatus.style.cssText = 'margin-top: 10px; font-size: 12px; color: #f1fa8c;';
        // panel.appendChild(queueStatus);
        // 新增：队列状态显示
        const queueStatus = document.createElement('div');
        queueStatus.id = 'pt-queue-status';
        queueStatus.textContent = '消息队列: 0 | 等待消费者: 0 |下一条: 无';
        queueStatus.style.cssText = `
            margin-top: 10px;
            font-size: 12px;
            padding: 5px;
            background: rgba(40, 42, 54, 0.7);
            border-radius: 6px;
            color: #f1fa8c;
        `;
        panel.appendChild(queueStatus);
    }

    // 切换控制面板的可见性
    function togglePanelVisibility() {
        const panel = document.getElementById('pt-control-panel');
        const header = panel.querySelector('div:first-child');
        panel.classList.toggle('minimized');
        header.textContent = panel.classList.contains('minimized') ? '>' : '≡';
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

        button.addEventListener('click', function () {
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

    // 使元素可拖动（添加点击隐藏/显示功能）
    function makeElementDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let startX, startY;
        let hasMoved = false;

        const header = document.createElement('div');
        header.textContent = '≡';
        header.style.cssText = `
            padding: 0; /* 清除内边距 */
            width: 100%;
            text-align: center;
        `;
        element.insertBefore(header, element.firstChild);

        header.addEventListener('mousedown', dragMouseDown);

        function dragMouseDown(e) {

            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            hasMoved = false;

            pos3 = e.clientX;
            pos4 = e.clientY;

            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }

        function elementDrag(e) {
            if (!hasMoved) {
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                if (dx > 5 || dy > 5) {
                    hasMoved = true;
                }
            }

            if (hasMoved) {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                // 计算新位置
                let newLeft = element.offsetLeft - pos1;
                let newTop = element.offsetTop - pos2;

                // 边界限制
                const maxLeft = window.innerWidth - element.offsetWidth;
                const maxTop = window.innerHeight - element.offsetHeight;

                // 确保面板不会移出屏幕边界
                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));

                // 应用新位置
                element.style.left = newLeft + "px";
                element.style.top = newTop + "px";
                element.style.right = "unset";
            }
        }

        function closeDragElement() {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);

            // 如果没有移动，则视为点击，切换面板可见性
            if (!hasMoved) {
                togglePanelVisibility();
            }
        }
    }

    function toggleFeature(feature) {
        settings[feature] = !settings[feature];
        GM_setValue('pt_settings', settings);

        // 更新按钮文本
        if (feature === 'autoChatEnabled') {

            const statusElement = document.getElementById('pt-status');
            if (statusElement) {
                statusElement.textContent = `状态: ${settings[feature] ? '运行中' : '已暂停'}`;
            }

            const button = document.querySelector('button[title="开启/关闭自动聊天功能"]');
            if (button) {
                button.textContent = settings.autoChatEnabled ? '🟢 聊天开启' : '🔴 聊天关闭';
                button.style.background = settings.autoChatEnabled ? '#50fa7b' : '#ff5555';
            }
            if (settings[feature]) { processChatMessages(); }
        }// 多轮对话特殊处理
        if (feature === 'multiTurnEnabled') {
            if (!settings.multiTurnEnabled) {
                conversationHistory = []; // 关闭时清除历史
            } else {
                trimConversationHistory(); // 启用时也应用限制
            }

            // 更新 multiTurnEnabled 对应的按钮
            const multiTurnButton = document.querySelector('button[title="开启/关闭上下文记忆功能"]');
            if (multiTurnButton) {
                multiTurnButton.textContent = settings.multiTurnEnabled ? '🟢 多轮对话开启' : '🔴 多轮对话关闭';
                multiTurnButton.style.background = settings.multiTurnEnabled ? '#50fa7b' : '#ff5555';
            }
            // 更新状态显示
            updateHistoryDisplay();
        }
        console.log(`功能 ${feature} ${settings[feature] ? '启用' : '禁用'}`);
    }


    // -------------------------------- 辅助函数 --------------------------------
    function conversationStatus() {
        if (!settings.multiTurnEnabled) return '上下文记忆: 已禁用';
        const entries = conversationHistory.length / 2;
        const remaining = (HISTORY_TIMEOUT - (Date.now() - lastInteractionTime)) / 60000;
        return `上下文: ${entries}/${settings.maxHistoryTurns}轮对话 | 超时: ${remaining.toFixed(1)}分钟`;
    }

    // === 历史记录截断函数 ===
    function trimConversationHistory() {
        if (conversationHistory.length > settings.maxHistoryTurns * 2) {
            conversationHistory = conversationHistory.slice(-settings.maxHistoryTurns * 2);
        }
        updateHistoryDisplay();
    }

    function updateHistoryDisplay() {
        const historyElement = document.getElementById('pt-history');
        if (historyElement) {
            historyElement.textContent = conversationStatus();
        }
    }


    // ================== 定时器设置 ==================
    function initQueueMonitor() {
        setInterval(() => {
            QueueStatus();
        }, 2000); // 每2秒更新一次队列状态
    }

    function QueueStatus() {
        const status = messageQueue.getStatus();
        const queueStatusElem = document.getElementById('pt-queue-status');

        if (queueStatusElem) {
            queueStatusElem.textContent =
                `消息队列: ${status.size} | 等待消费者: ${status.waiting} | 下一条: ${status.next}`;
        }
    }

    function initScript() {
        // 加载保存的设置
        const savedSettings = GM_getValue('pt_settings');
        if (savedSettings) {
            settings = { ...DEFAULT_SETTINGS, ...savedSettings };
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

    // 启动脚本
    setTimeout(() => {
        initScript();
        messageInterval = setInterval(getLastChatMessage, settings.cooldownTime);// 生产者：每3秒检查新消息
        processChatMessages();
        initQueueMonitor();
        console.log('Pony Town自动聊天脚本已启动');
    }, 3000);

})();