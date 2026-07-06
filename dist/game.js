const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('scoreValue');
const finalScoreElement = document.getElementById('finalScore');
const gameOverDiv = document.getElementById('gameOver');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const lifeDisplay = document.getElementById('lifeDisplay');
const lifeMinus = document.getElementById('lifeMinus');
const lifePlus = document.getElementById('lifePlus');
const presetBtns = document.querySelectorAll('.presetBtn');

// 摇杆元素
const joystickContainer = document.getElementById('joystickContainer');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

// 画布尺寸
canvas.width = 400;
canvas.height = 600;

// ========== 摇杆状态 ==========
const joystick = {
    active: false,
    dx: 0,
    dy: 0,
    radius: 0,
    baseX: 0,
    baseY: 0,
    knobRadius: 0,
    maxDistance: 0
};

// ========== 游戏状态 ==========
let gameRunning = false;
let gameStarted = false;
let score = 0;
let frameCount = 0;
let difficulty = 1;
let maxLives = 3;
let currentLives = 3;
let isInvincible = false;
let invincibleTimer = 0;
const INVINCIBLE_DURATION = 120;

// ========== 玩家 ==========
const player = {
    x: canvas.width / 2 - 25,
    y: canvas.height - 120,
    width: 40,
    height: 70,
    speed: 5,
    dx: 0,
    dy: 0,
    color: '#e74c3c'
};

let obstacles = [];
const obstacleColors = ['#f39c12', '#9b59b6', '#1abc9c', '#3498db', '#e67e22'];
let roadOffset = 0;

// ========== 键盘状态 ==========
const keys = {
    up: false,
    down: false,
    left: false,
    right: false
};

// ========== 摇杆初始化 ==========
function initJoystick() {
    const rect = joystickBase.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    
    joystick.baseX = (rect.left - canvasRect.left) * scaleX + rect.width / 2 * scaleX;
    joystick.baseY = (rect.top - canvasRect.top) * scaleY + rect.height / 2 * scaleY;
    joystick.radius = (rect.width / 2) * scaleX;
    joystick.knobRadius = (joystickKnob.offsetWidth / 2) * scaleX;
    joystick.maxDistance = joystick.radius - joystick.knobRadius;
}

// ========== 摇杆事件 ==========
function getJoystickPosition(clientX, clientY) {
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    return {
        x: (clientX - canvasRect.left) * scaleX,
        y: (clientY - canvasRect.top) * scaleY
    };
}

function handleJoystickStart(clientX, clientY) {
    joystick.active = true;
    joystickKnob.classList.add('active');
    handleJoystickMove(clientX, clientY);
}

function handleJoystickMove(clientX, clientY) {
    if (!joystick.active) return;
    
    const pos = getJoystickPosition(clientX, clientY);
    let dx = pos.x - joystick.baseX;
    let dy = pos.y - joystick.baseY;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDist = joystick.maxDistance;
    
    if (distance > maxDist && maxDist > 0) {
        dx = (dx / distance) * maxDist;
        dy = (dy / distance) * maxDist;
    }
    
    const percentX = maxDist > 0 ? (dx / maxDist) * 50 : 0;
    const percentY = maxDist > 0 ? (dy / maxDist) * 50 : 0;
    joystickKnob.style.transform = `translate(${-50 + percentX}%, ${-50 + percentY}%)`;
    
    const deadZone = 0.1;
    const normX = maxDist > 0 ? dx / maxDist : 0;
    const normY = maxDist > 0 ? dy / maxDist : 0;
    joystick.dx = Math.abs(normX) > deadZone ? Math.min(1, Math.max(-1, normX)) : 0;
    joystick.dy = Math.abs(normY) > deadZone ? Math.min(1, Math.max(-1, normY)) : 0;
}

function handleJoystickEnd() {
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickKnob.classList.remove('active');
    joystickKnob.style.transform = 'translate(-50%, -50%)';
}

// 触摸事件
joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleJoystickStart(touch.clientX, touch.clientY);
});

document.addEventListener('touchmove', (e) => {
    if (!joystick.active) return;
    e.preventDefault();
    const touch = e.touches[0];
    handleJoystickMove(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchend', () => {
    if (joystick.active) handleJoystickEnd();
});
document.addEventListener('touchcancel', () => {
    if (joystick.active) handleJoystickEnd();
});

// 鼠标事件
joystickBase.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleJoystickStart(e.clientX, e.clientY);
});

document.addEventListener('mousemove', (e) => {
    if (!joystick.active) return;
    handleJoystickMove(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    if (joystick.active) handleJoystickEnd();
});

// ========== 生命值选择 ==========
function updateLifeDisplay() {
    lifeDisplay.textContent = maxLives;
    presetBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value) === maxLives);
    });
}

lifeMinus.addEventListener('click', (e) => {
    e.stopPropagation();
    if (maxLives > 1) { maxLives--; updateLifeDisplay(); }
});

lifePlus.addEventListener('click', (e) => {
    e.stopPropagation();
    if (maxLives < 10) { maxLives++; updateLifeDisplay(); }
});

presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        maxLives = parseInt(btn.dataset.value);
        updateLifeDisplay();
    });
});

// ========== 窗口调整 ==========
window.addEventListener('resize', () => {
    setTimeout(initJoystick, 100);
});

// ========== 游戏初始化 ==========
function initGame() {
    console.log('游戏开始！'); // 调试日志
    player.x = canvas.width / 2 - player.width / 2;
    player.y = canvas.height - 120;
    player.dx = 0;
    player.dy = 0;
    obstacles = [];
    score = 0;
    difficulty = 1;
    frameCount = 0;
    currentLives = maxLives;
    isInvincible = false;
    invincibleTimer = 0;
    gameRunning = true;
    gameStarted = true;
    scoreElement.textContent = '0';
    gameOverDiv.style.display = 'none';
    startScreen.style.display = 'none';
    
    joystick.dx = 0;
    joystick.dy = 0;
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickKnob.classList.remove('active');
    
    setTimeout(initJoystick, 50);
}

// 使用多种方式绑定开始按钮
startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('开始按钮被点击');
    initGame();
});

startBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('开始按钮被触摸');
    initGame();
});

// ========== 重新开始 ==========
restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startScreen.style.display = 'flex';
    gameOverDiv.style.display = 'none';
    gameRunning = false;
    gameStarted = false;
    currentLives = maxLives;
    setTimeout(initJoystick, 100);
});

// ========== 障碍物 ==========
function createObstacle() {
    const minWidth = 30, maxWidth = 60;
    const width = Math.floor(Math.random() * (maxWidth - minWidth + 1)) + minWidth;
    const x = Math.floor(Math.random() * (canvas.width - width));
    const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
    obstacles.push({
        x, y: -50, width, height: 50,
        color,
        speed: 2 + difficulty * 0.3
    });
}

// ========== 更新 ==========
function update() {
    if (!gameRunning || !gameStarted) return;
    
    frameCount++;
    score += 0.5;
    scoreElement.textContent = Math.floor(score);
    difficulty = 1 + Math.floor(score / 200);
    
    const spawnRate = Math.max(20, 60 - difficulty * 3);
    if (frameCount % Math.floor(spawnRate) === 0) createObstacle();
    
    const speed = player.speed;
    let moveX = 0, moveY = 0;
    
    if (joystick.active || joystick.dx !== 0 || joystick.dy !== 0) {
        moveX = joystick.dx * speed;
        moveY = joystick.dy * speed;
    }
    
    if (keys.left) moveX = -speed;
    else if (keys.right) moveX = speed;
    if (keys.up) moveY = -speed;
    else if (keys.down) moveY = speed;
    
    if (!joystick.active && !keys.left && !keys.right) {
        moveX = player.dx * 0.9;
    }
    if (!joystick.active && !keys.up && !keys.down) {
        moveY = player.dy * 0.9;
    }
    
    player.dx = moveX;
    player.dy = moveY;
    player.x += moveX;
    player.y += moveY;
    
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    if (player.y < 0) player.y = 0;
    if (player.y + player.height > canvas.height) player.y = canvas.height - player.height;
    
    if (isInvincible) {
        invincibleTimer--;
        if (invincibleTimer <= 0) isInvincible = false;
    }
    
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.y += obs.speed;
        
        if (obs.y > canvas.height) {
            obstacles.splice(i, 1);
            continue;
        }
        
        if (!isInvincible && checkCollision(player, obs)) {
            currentLives--;
            if (currentLives <= 0) { gameOver(); return; }
            isInvincible = true;
            invincibleTimer = INVINCIBLE_DURATION;
            obstacles.splice(i, 1);
        }
    }
    
    roadOffset = (roadOffset + 2) % 40;
}

// ========== 碰撞检测 ==========
function checkCollision(player, obstacle) {
    const shrink = 8;
    return player.x + shrink < obstacle.x + obstacle.width - shrink &&
           player.x + player.width - shrink > obstacle.x + shrink &&
           player.y + shrink < obstacle.y + obstacle.height - shrink &&
           player.y + player.height - shrink > obstacle.y + shrink;
}

// ========== 绘制 ==========
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    
    obstacles.forEach(obs => {
        ctx.fillStyle = obs.color;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.width, obs.height, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.roundRect(obs.x + 5, obs.y + 5, obs.width - 10, 10, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.width, obs.height, 5);
        ctx.stroke();
    });
    
    if (isInvincible) {
        if (Math.floor(invincibleTimer / 8) % 2 === 0) {
            drawCar(player.x, player.y, player.width, player.height, player.color);
        }
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.3 + 0.3 * Math.sin(invincibleTimer / 10)})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 10]);
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height/2, 
                Math.max(player.width, player.height) / 1.5 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    } else {
        drawCar(player.x, player.y, player.width, player.height, player.color);
    }
    
    drawLives();
    
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 80, 25, 12);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.font = '12px Arial';
    ctx.fillText(`⚡ 等级 ${difficulty}`, 20, 28);
    
    if (isInvincible) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🛡️ 无敌', canvas.width / 2, 55);
        ctx.textAlign = 'start';
    }
}

// ========== 绘制生命值 ==========
function drawLives() {
    const heartSize = 18;
    const startX = canvas.width - 10 - heartSize;
    const startY = 15;
    const spacing = 4;
    
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(startX - heartSize - 10, 5, 
                  heartSize * maxLives + spacing * (maxLives - 1) + 20, 35, 12);
    ctx.fill();
    
    for (let i = 0; i < maxLives; i++) {
        const x = startX - i * (heartSize + spacing);
        drawHeart(x, startY, heartSize, i < currentLives ? '#ff4757' : '#444');
    }
}

function drawHeart(x, y, size, color) {
    ctx.fillStyle = color;
    ctx.shadowColor = color === '#ff4757' ? 'rgba(255, 71, 87, 0.3)' : 'transparent';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x + size/2, y + size*0.3);
    ctx.bezierCurveTo(x + size*0.1, y, x, y + size*0.2, x, y + size*0.4);
    ctx.bezierCurveTo(x, y + size*0.6, x + size*0.3, y + size*0.8, x + size/2, y + size);
    ctx.bezierCurveTo(x + size*0.7, y + size*0.8, x + size, y + size*0.6, x + size, y + size*0.4);
    ctx.bezierCurveTo(x + size, y + size*0.2, x + size*0.9, y, x + size/2, y + size*0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// ========== 绘制道路 ==========
function drawRoad() {
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 20]);
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, roadOffset);
    ctx.lineTo(canvas.width/2, canvas.height + roadOffset);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(20, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width-20, 0); ctx.lineTo(canvas.width-20, canvas.height);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let i = -20; i < canvas.height + 20; i += 40) {
        const offset = (i + roadOffset * 2) % 40;
        ctx.fillRect(30, i + offset, canvas.width - 60, 2);
    }
}

// ========== 绘制赛车 ==========
function drawCar(x, y, width, height, color) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 15;
    
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, lightenColor(color, 30));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.beginPath();
    ctx.roundRect(x + 8, y - 2, width - 16, 20, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 22, width - 20, 12, 3);
    ctx.fill();
    
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x + 8, y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + width - 8, y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(x + 8, y + height - 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + width - 8, y + height - 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.roundRect(x - 4, y + 12, 6, 15, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + width - 2, y + 12, 6, 15, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 4, y + height - 27, 6, 15, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + width - 2, y + height - 27, 6, 15, 3);
    ctx.fill();
}

// ========== 辅助函数 ==========
function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `rgb(${R},${G},${B})`;
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w/2) r = w/2;
        if (r > h/2) r = h/2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

// ========== 游戏结束 ==========
function gameOver() {
    gameRunning = false;
    finalScoreElement.textContent = Math.floor(score);
    gameOverDiv.style.display = 'block';
}

// ========== 游戏循环 ==========
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ========== 键盘事件 ==========
document.addEventListener('keydown', (e) => {
    if (!gameStarted && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (startScreen.style.display !== 'none') {
            initGame();
        }
        return;
    }
    
    if (!gameRunning) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startScreen.style.display = 'flex';
            gameOverDiv.style.display = 'none';
            gameRunning = false;
            gameStarted = false;
            currentLives = maxLives;
        }
        return;
    }
    
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = true;
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = true;
            e.preventDefault();
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = true;
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = true;
            e.preventDefault();
            break;
    }
});

document.addEventListener('keyup', (e) => {
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = false;
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = false;
            e.preventDefault();
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = false;
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = false;
            e.preventDefault();
            break;
    }
});

// ========== 启动游戏循环 ==========
console.log('游戏加载完成！');
gameLoop();

// 延迟初始化摇杆
setTimeout(initJoystick, 200);