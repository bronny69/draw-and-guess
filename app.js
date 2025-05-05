// 初始化 Gun
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);

// 遊戲狀態管理
const gameState = gun.get('gameState');
const players = gun.get('players');
const drawings = gun.get('drawings');

// 遊戲配置
const ROUND_TIME = 60; // 每輪遊戲時間（秒）
const WORDS = ['貓', '狗', '房子', '太陽', '月亮', '樹', '花', '魚', '鳥', '汽車', 
               '飛機', '船', '書', '電腦', '手機', '眼鏡', '雨傘', '鑰匙', '椅子', '桌子'];

// 遊戲狀態
let myPlayer = null;
let isDrawing = false;
let currentDrawer = null;
let gameStarted = false;
let currentWord = '';
let timer = null;

// 畫布設置
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let isDrawingEnabled = false;
let lastX = 0;
let lastY = 0;

// 設置畫布大小
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

// 初始化
window.addEventListener('load', () => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupDrawingEvents();
    setupGameEvents();
});

// 設置繪圖事件
function setupDrawingEvents() {
    const colorPicker = document.getElementById('colorPicker');
    const brushSize = document.getElementById('brushSize');
    const clearButton = document.getElementById('clearCanvas');

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    clearButton.addEventListener('click', () => {
        if (isDrawingEnabled) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawings.get('current').put(null);
        }
    });

    function startDrawing(e) {
        if (!isDrawingEnabled) return;
        isDrawing = true;
        [lastX, lastY] = getMousePos(e);
    }

    function draw(e) {
        if (!isDrawing || !isDrawingEnabled) return;
        const [x, y] = getMousePos(e);
        
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = brushSize.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // 同步繪圖數據
        drawings.get('current').put({
            from: { x: lastX, y: lastY },
            to: { x, y },
            color: colorPicker.value,
            size: brushSize.value
        });

        [lastX, lastY] = [x, y];
    }

    function stopDrawing() {
        isDrawing = false;
    }
}

// 獲取滑鼠位置
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return [
        e.clientX - rect.left,
        e.clientY - rect.top
    ];
}

// 設置遊戲事件
function setupGameEvents() {
    const startButton = document.getElementById('startGame');
    const guessInput = document.getElementById('guessInput');
    const playerNameInput = document.getElementById('playerName');

    startButton.addEventListener('click', joinGame);
    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isDrawingEnabled) {
            submitGuess(guessInput.value.trim());
            guessInput.value = '';
        }
    });

    // 監聽遊戲狀態
    gameState.on((data) => {
        if (data) {
            updateGameState(data);
        }
    });

    // 監聽繪圖數據
    drawings.get('current').on((data) => {
        if (data && !isDrawingEnabled && currentDrawer) {
            drawRemoteStroke(data);
        }
    });
}

// 加入遊戲
function joinGame() {
    const playerName = document.getElementById('playerName').value.trim() || '玩家' + Math.floor(Math.random() * 1000);
    const playerId = Math.random().toString(36).substr(2, 9);

    myPlayer = {
        id: playerId,
        name: playerName,
        score: 0
    };

    // 將玩家資訊同步到 Gun
    players.get(playerId).put(myPlayer);

    document.getElementById('startGame').disabled = true;
    document.getElementById('playerName').disabled = true;

    // 檢查是否需要開始新遊戲
    gameState.once((data) => {
        if (!data || !data.currentDrawer) {
            startNewRound();
        }
    });
}

// 開始新回合
function startNewRound() {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    
    players.map().once((player, id) => {
        if (player) {
            if (!currentDrawer) {
                currentDrawer = { id, name: player.name };
                isDrawingEnabled = (id === myPlayer.id);
                
                gameState.put({
                    currentDrawer: currentDrawer,
                    currentWord: word,
                    startTime: Date.now()
                });

                if (isDrawingEnabled) {
                    document.getElementById('current-word').textContent = `請畫出: ${word}`;
                    document.getElementById('guessInput').disabled = true;
                } else {
                    document.getElementById('current-word').textContent = '輪到 ' + player.name + ' 畫畫';
                    document.getElementById('guessInput').disabled = false;
                }

                startTimer();
            }
        }
    });
}

// 提交猜測
function submitGuess(guess) {
    if (guess.toLowerCase() === currentWord.toLowerCase()) {
        // 答對了
        const points = calculatePoints();
        myPlayer.score += points;
        players.get(myPlayer.id).get('score').put(myPlayer.score);
        
        addMessage(`🎉 ${myPlayer.name} 答對了！獲得 ${points} 分`, 'correct');
        setTimeout(startNewRound, 2000);
    } else {
        // 答錯了
        addMessage(`${myPlayer.name}: ${guess}`);
    }
}

// 計算得分
function calculatePoints() {
    const timeLeft = document.querySelector('#timer span').textContent;
    return Math.max(10, Math.floor(timeLeft * 0.5));
}

// 開始計時器
function startTimer() {
    let timeLeft = ROUND_TIME;
    const timerSpan = document.querySelector('#timer span');
    
    clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            addMessage('⌛ 時間到！', 'system');
            setTimeout(startNewRound, 2000);
        }
    }, 1000);
}

// 更新遊戲狀態
function updateGameState(state) {
    if (state.currentDrawer) {
        currentDrawer = state.currentDrawer;
        currentWord = state.currentWord;
        
        isDrawingEnabled = (currentDrawer.id === myPlayer?.id);
        
        if (isDrawingEnabled) {
            document.getElementById('current-word').textContent = `請畫出: ${currentWord}`;
            document.getElementById('guessInput').disabled = true;
        } else if (myPlayer) {
            document.getElementById('current-word').textContent = '輪到 ' + currentDrawer.name + ' 畫畫';
            document.getElementById('guessInput').disabled = false;
        }
    }
}

// 繪製遠端筆畫
function drawRemoteStroke(data) {
    if (!data.from || !data.to) return;
    
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(data.from.x, data.from.y);
    ctx.lineTo(data.to.x, data.to.y);
    ctx.stroke();
}

// 添加訊息到聊天區
function addMessage(text, type = '') {
    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message' + (type ? ` ${type}` : '');
    messageElement.textContent = text;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}