// ===================== 3D 赛车游戏 =====================
// 使用 Three.js 构建完整环形赛道竞速游戏

let scene, camera, renderer, clock;
let trackCurve, trackPoints = [];
let trackWidth = 14;
let trackRadius = 80;
let playerCar;
let aiCars = [];
let trackMeshes = [];
let barrierMeshes = [];
let trees = [];
let particles = [];
const MAX_POOL_PARTICLES = 80;
let particlePool = {
    mesh: null,
    positions: null,
    total: 0,
    active: []
};
let keys = {};
let gameState = 'menu'; // menu, countdown, racing, finished
let lapData = { current: 0, total: 3, times: [], best: null, startTime: 0, checkpointPassed: false };
let raceTime = 0;
let countdownValue = 3;
let countdownTimer = 0;
let countdownTimeouts = [];
let minimapCanvas, minimapCtx;
let raceResults = [];
let speedBlurEl;
let collisionTextEl;
let hudEl, startScreenEl, gameOverEl, countdownEl;
let lastRank = 1;

// ===================== 初始化 =====================
function init() {
    clock = new THREE.Clock();
    
    // DOM 元素
    hudEl = document.getElementById('hud');
    startScreenEl = document.getElementById('startScreen');
    gameOverEl = document.getElementById('gameOver');
    countdownEl = document.getElementById('countdown');
    speedBlurEl = document.getElementById('speedBlur');
    collisionTextEl = document.getElementById('collisionText');
    minimapCanvas = document.getElementById('minimapCanvas');
    minimapCtx = minimapCanvas.getContext('2d');
    
    // 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 60, 250);
    
    // 相机
    const container = document.getElementById('canvasContainer');
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(0, 10, 15);
    
    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);
    
    // 光照
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);
    
    // 地面
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // 生成赛道
    generateTrack();
    
    // 创建车辆
    createPlayerCar();
    createAICars();
    
    // 创建环境
    createEnvironment();
    
    // 事件绑定
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.getElementById('startBtn').addEventListener('click', startCountdown);
    document.getElementById('restartBtn').addEventListener('click', restartGame);
    
    // 启动循环
    animate();
    
    // 初始化粒子池
    initParticlePool();
}

// ===================== 赛道生成 =====================
function generateTrack() {
    // 创建椭圆形赛道控制点
    const controlPoints = [];
    const numPoints = 16;
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        // 椭圆 + 小幅扰动让赛道更自然
        const rX = trackRadius + Math.sin(angle * 3) * 10;
        const rZ = trackRadius * 0.6 + Math.cos(angle * 2) * 8;
        const x = Math.cos(angle) * rX;
        const z = Math.sin(angle) * rZ;
        controlPoints.push(new THREE.Vector3(x, 0, z));
    }
    // 闭环
    controlPoints.push(controlPoints[0].clone());
    
    trackCurve = new THREE.CatmullRomCurve3(controlPoints);
    trackCurve.closed = true;
    
    // 生成赛道地面和护栏
    const segments = 140;
    const trackMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const curbMatL = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    const curbMatR = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    for (let i = 0; i < segments; i++) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const p0 = trackCurve.getPointAt(t0);
        const p1 = trackCurve.getPointAt(t1);
        const tangent = trackCurve.getTangentAt(t0).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        // 赛道片段中心
        const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        const length = p0.distanceTo(p1);
        
        // 赛道地面（沥青）
        const roadGeo = new THREE.BoxGeometry(trackWidth, 0.1, length + 0.2);
        const roadMesh = new THREE.Mesh(roadGeo, trackMat);
        roadMesh.position.copy(mid);
        roadMesh.position.y = 0.05;
        roadMesh.lookAt(p1);
        roadMesh.receiveShadow = true;
        scene.add(roadMesh);
        trackMeshes.push(roadMesh);
        
        // 路肩（左红右白交替）
        const curbWidth = 1.0;
        const isRed = i % 4 < 2;
        const curbMat = isRed ? curbMatL : curbMatR;
        
        const curbGeo = new THREE.BoxGeometry(curbWidth, 0.2, length + 0.2);
        const curbL = new THREE.Mesh(curbGeo, curbMat);
        curbL.position.copy(mid).add(normal.clone().multiplyScalar(trackWidth / 2 + curbWidth / 2));
        curbL.position.y = 0.1;
        curbL.lookAt(p1);
        scene.add(curbL);
        trackMeshes.push(curbL);
        
        const curbR = new THREE.Mesh(curbGeo, curbMat);
        curbR.position.copy(mid).add(normal.clone().multiplyScalar(-(trackWidth / 2 + curbWidth / 2)));
        curbR.position.y = 0.1;
        curbR.lookAt(p1);
        scene.add(curbR);
        trackMeshes.push(curbR);
        
        // 护栏
        const barrierHeight = 1.2;
        const barrierThick = 0.3;
        const barrierGeo = new THREE.BoxGeometry(barrierThick, barrierHeight, length + 0.2);
        
        const barrierL = new THREE.Mesh(barrierGeo, barrierMat);
        barrierL.position.copy(mid).add(normal.clone().multiplyScalar(trackWidth / 2 + curbWidth + barrierThick / 2));
        barrierL.position.y = barrierHeight / 2;
        barrierL.lookAt(p1);
        barrierL.castShadow = true;
        scene.add(barrierL);
        barrierMeshes.push(barrierL);
        
        const barrierR = new THREE.Mesh(barrierGeo, barrierMat);
        barrierR.position.copy(mid).add(normal.clone().multiplyScalar(-(trackWidth / 2 + curbWidth + barrierThick / 2)));
        barrierR.position.y = barrierHeight / 2;
        barrierR.lookAt(p1);
        barrierR.castShadow = true;
        scene.add(barrierR);
        barrierMeshes.push(barrierR);
        
        // 中心虚线（每4段显示一次）
        if (i % 4 === 0) {
            const lineGeo = new THREE.BoxGeometry(0.3, 0.05, length * 1.5);
            const lineMesh = new THREE.Mesh(lineGeo, lineMat);
            lineMesh.position.copy(mid);
            lineMesh.position.y = 0.08;
            lineMesh.lookAt(p1);
            scene.add(lineMesh);
            trackMeshes.push(lineMesh);
        }
    }
    
    // 起点/终点线
    const startPoint = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
    const finishMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let j = 0; j < 10; j++) {
        const blockW = trackWidth / 10;
        const blockGeo = new THREE.BoxGeometry(blockW, 0.06, 2);
        const blockMat = (j % 2 === 0) ? finishMat : new THREE.MeshBasicMaterial({ color: 0x000000 });
        const block = new THREE.Mesh(blockGeo, blockMat);
        block.position.copy(startPoint).add(startNormal.clone().multiplyScalar((j - 4.5) * blockW));
        block.position.y = 0.08;
        block.lookAt(startPoint.clone().add(startTangent));
        scene.add(block);
        trackMeshes.push(block);
    }
    
    // 生成路径点（供AI使用）
    const pathRes = 100;
    for (let i = 0; i < pathRes; i++) {
        const t = i / pathRes;
        trackPoints.push({
            position: trackCurve.getPointAt(t),
            tangent: trackCurve.getTangentAt(t).normalize()
        });
    }
}

// ===================== 车辆创建 =====================
function createCar(color, isPlayer) {
    const carGroup = new THREE.Group();
    
    // 车身
    const bodyGeo = new THREE.BoxGeometry(2.2, 0.8, 4.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    carGroup.add(body);
    
    // 车顶
    const roofGeo = new THREE.BoxGeometry(1.8, 0.6, 2.2);
    const roofMat = new THREE.MeshLambertMaterial({ color: darkenColor(color, 20) });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 1.4;
    roof.position.z = -0.2;
    roof.castShadow = true;
    carGroup.add(roof);
    
    // 前挡风玻璃
    const windshieldGeo = new THREE.BoxGeometry(1.6, 0.45, 0.1);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.y = 1.35;
    windshield.position.z = 0.85;
    windshield.rotation.x = -0.3;
    carGroup.add(windshield);
    
    // 后挡风玻璃
    const rearWindow = new THREE.Mesh(windshieldGeo, glassMat);
    rearWindow.position.y = 1.35;
    rearWindow.position.z = -1.25;
    rearWindow.rotation.x = 0.3;
    carGroup.add(rearWindow);
    
    // 轮子
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const wheelPositions = [
        { x: -1.1, y: 0.35, z: 1.4 },
        { x: 1.1, y: 0.35, z: 1.4 },
        { x: -1.1, y: 0.35, z: -1.4 },
        { x: 1.1, y: 0.35, z: -1.4 }
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        carGroup.add(wheel);
    });
    
    // 前大灯
    const headlightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const hlL = new THREE.Mesh(headlightGeo, headlightMat);
    hlL.position.set(-0.7, 0.8, 2.2);
    carGroup.add(hlL);
    const hlR = new THREE.Mesh(headlightGeo, headlightMat);
    hlR.position.set(0.7, 0.8, 2.2);
    carGroup.add(hlR);
    
    // 尾灯
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const tlL = new THREE.Mesh(headlightGeo, taillightMat);
    tlL.position.set(-0.7, 0.8, -2.2);
    carGroup.add(tlL);
    const tlR = new THREE.Mesh(headlightGeo, taillightMat);
    tlR.position.set(0.7, 0.8, -2.2);
    carGroup.add(tlR);
    
    // 尾翼
    const wingGeo = new THREE.BoxGeometry(2.0, 0.1, 0.6);
    const wingMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, 1.6, -2.0);
    carGroup.add(wing);
    const wingPostGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    const wpL = new THREE.Mesh(wingPostGeo, wingMat);
    wpL.position.set(-0.8, 1.35, -2.0);
    carGroup.add(wpL);
    const wpR = new THREE.Mesh(wingPostGeo, wingMat);
    wpR.position.set(0.8, 1.35, -2.0);
    carGroup.add(wpR);
    
    // 车辆物理属性
    carGroup.userData = {
        velocity: new THREE.Vector3(0, 0, 0),
        speed: 0,
        maxSpeed: 35,
        acceleration: 12,
        braking: 20,
        friction: 3,
        turnSpeed: 2.5,
        angle: 0,
        isDrifting: false,
        driftAngle: 0,
        onGround: true,
        width: 2.2,
        length: 4.5,
        color: color,
        isPlayer: isPlayer,
        lap: 0,
        checkpoint: 0,
        checkpointPassed: false,
        lapStartTime: 0,
        totalTime: 0,
        pathIndex: 0,
        offsetFromCenter: 0,
        targetOffset: 0,
        name: isPlayer ? '玩家' : 'AI',
        finished: false,
        wallHitCooldown: 0,
        carHitCooldown: 0
    };
    
    scene.add(carGroup);
    return carGroup;
}

function createPlayerCar() {
    playerCar = createCar(0xe74c3c, true);
    // 放置在起点线后
    const startPoint = trackCurve.getPointAt(0.01);
    const startTangent = trackCurve.getTangentAt(0.01).normalize();
    playerCar.position.copy(startPoint);
    playerCar.position.y = 0;
    playerCar.userData.angle = Math.atan2(startTangent.x, startTangent.z);
    playerCar.rotation.y = playerCar.userData.angle;
}

function createAICars() {
    const aiColors = [0x3498db, 0x2ecc71, 0xf39c12]; // 蓝、绿、橙
    const aiNames = ['蓝风', '绿影', '橙电'];
    
    for (let i = 0; i < 3; i++) {
        const aiCar = createCar(aiColors[i], false);
        // 不同起跑位置
        const startT = 0.01 - (i + 1) * 0.005;
        const startPoint = trackCurve.getPointAt(Math.max(0, startT));
        const startTangent = trackCurve.getTangentAt(Math.max(0, startT)).normalize();
        const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
        
        // 错开位置
        const laneOffset = ((i % 2 === 0) ? 1 : -1) * (2 + i * 0.5);
        aiCar.position.copy(startPoint).add(startNormal.multiplyScalar(laneOffset));
        aiCar.position.y = 0;
        aiCar.userData.angle = Math.atan2(startTangent.x, startTangent.z);
        aiCar.rotation.y = aiCar.userData.angle;
        aiCar.userData.name = aiNames[i];
        aiCar.userData.maxSpeed = 28 + Math.random() * 4; // 略有差异
        aiCar.userData.pathIndex = 0;
        aiCar.userData.offsetFromCenter = laneOffset;
        aiCar.userData.targetOffset = laneOffset;
        
        aiCars.push(aiCar);
    }
}

// ===================== 环境创建 =====================
function createEnvironment() {
    // 树木
    const treePositions = [];
    for (let i = 0; i < 40; i++) {
        const t = Math.random();
        const point = trackCurve.getPointAt(t);
        const tangent = trackCurve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const side = Math.random() > 0.5 ? 1 : -1;
        const dist = trackWidth / 2 + 3 + Math.random() * 15;
        const pos = point.clone().add(normal.multiplyScalar(side * dist));
        
        // 避免与其他树太近
        let tooClose = false;
        for (const tp of treePositions) {
            if (tp.distanceTo(pos) < 5) { tooClose = true; break; }
        }
        if (tooClose) continue;
        treePositions.push(pos);
        
        createTree(pos.x, pos.z);
    }
    
    // 天空装饰（简单云朵）
    for (let i = 0; i < 8; i++) {
        const cloudGeo = new THREE.SphereGeometry(3 + Math.random() * 4, 8, 6);
        const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const cloud = new THREE.Mesh(cloudGeo, cloudMat);
        cloud.position.set(
            (Math.random() - 0.5) * 300,
            40 + Math.random() * 30,
            (Math.random() - 0.5) * 300
        );
        cloud.scale.y = 0.4;
        scene.add(cloud);
    }
}

function createTree(x, z) {
    const treeGroup = new THREE.Group();
    
    // 树干
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    treeGroup.add(trunk);
    
    // 树冠
    const crownGeo = new THREE.ConeGeometry(2.5, 5, 8);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = 3.5;
    crown.castShadow = true;
    treeGroup.add(crown);
    
    treeGroup.position.set(x, 0, z);
    scene.add(treeGroup);
    trees.push(treeGroup);
}

// ===================== 物理更新 =====================
function updatePlayerPhysics(dt) {
    const data = playerCar.userData;
    data.wallHitCooldown = Math.max(0, data.wallHitCooldown - dt);
    data.carHitCooldown = Math.max(0, data.carHitCooldown - dt);
    
    // 输入
    let accelInput = 0;
    let steerInput = 0;
    let handbrake = false;
    
    const forwardPressed = keys['ArrowUp'] || keys['KeyW'] || keys['w'] || keys['W'];
    const backwardPressed = keys['ArrowDown'] || keys['KeyS'] || keys['s'] || keys['S'];
    if (forwardPressed && !backwardPressed) accelInput = 1;
    if (backwardPressed && !forwardPressed) accelInput = -0.6;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['a'] || keys['A']) steerInput = 1;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['d'] || keys['D']) steerInput = -1;
    if (keys['Space'] || keys[' ']) handbrake = true;
    
    // 加速/刹车
    if (accelInput > 0) {
        data.speed += data.acceleration * dt * accelInput;
    } else if (accelInput < 0) {
        if (data.speed > 0) {
            data.speed -= data.braking * dt * Math.abs(accelInput);
        } else {
            data.speed -= data.acceleration * 0.5 * dt * Math.abs(accelInput);
        }
    }
    
    // 摩擦
    if (Math.abs(accelInput) < 0.1) {
        data.speed -= data.friction * dt * Math.sign(data.speed);
    }
    
    // 手刹
    if (handbrake && data.speed > 5) {
        data.isDrifting = true;
        data.speed -= data.braking * 0.5 * dt;
        data.driftAngle += steerInput * 3 * dt;
        data.driftAngle *= 0.95; // 漂移角度衰减
    } else {
        data.isDrifting = false;
        data.driftAngle *= 0.9;
    }
    
    // 限制速度
    data.speed = Math.max(-8, Math.min(data.maxSpeed, data.speed));
    if (Math.abs(accelInput) < 0.1 && Math.abs(data.speed) < 0.1) data.speed = 0;
    
    // 转向（低速/静止时也允许转向，避免顶住栏杆或其它车后无法脱困）
    const speedFactor = Math.min(1, Math.abs(data.speed) / 10);
    const effectiveTurnSpeed = data.turnSpeed * (1 - speedFactor * 0.3);
    if (Math.abs(steerInput) > 0.01) {
        const turnDir = Math.abs(data.speed) > 0.5 ? (data.speed > 0 ? 1 : -1) : (accelInput < 0 ? -1 : 1);
        const lowSpeedGrip = Math.abs(data.speed) > 0.5 ? 1 : 0.65;
        data.angle += steerInput * effectiveTurnSpeed * dt * turnDir * lowSpeedGrip;
    }
    
    // 更新方向
    const forward = new THREE.Vector3(Math.sin(data.angle), 0, Math.cos(data.angle));
    const right = new THREE.Vector3(Math.cos(data.angle), 0, -Math.sin(data.angle));
    
    // 速度向量（考虑漂移）
    const driftFactor = Math.abs(data.driftAngle) * 0.3;
    const driftRight = right.clone().multiplyScalar(data.driftAngle * 0.5);
    data.velocity = forward.clone().multiplyScalar(data.speed).add(driftRight);
    
    // 更新位置
    playerCar.position.add(data.velocity.clone().multiplyScalar(dt));
    playerCar.position.y = 0;
    
    // 车身旋转
    playerCar.rotation.y = data.angle + data.driftAngle * 0.5;
    
    // 车身倾斜（转向时）
    const leanAmount = steerInput * 0.15 * Math.min(1, Math.abs(data.speed) / 10);
    playerCar.rotation.z = leanAmount;
    
    // 检查是否偏离赛道
    checkTrackBounds(playerCar);
}

function updateAIPhysics(aiCar, dt) {
    const data = aiCar.userData;
    if (data.finished) return;
    data.wallHitCooldown = Math.max(0, data.wallHitCooldown - dt);
    data.carHitCooldown = Math.max(0, data.carHitCooldown - dt);
    
    // 获取当前目标路径点
    let targetPoint = trackPoints[data.pathIndex].position;
    const distToTarget = aiCar.position.distanceTo(targetPoint);
    
    // 到达目标点，切换到下一个
    if (distToTarget < 3) {
        data.pathIndex = (data.pathIndex + 1) % trackPoints.length;
        targetPoint = trackPoints[data.pathIndex].position;
    }
    
    // 计算到目标点的方向
    const dirToTarget = new THREE.Vector3().subVectors(targetPoint, aiCar.position).normalize();
    const targetAngle = Math.atan2(dirToTarget.x, dirToTarget.z);
    
    // 平滑转向
    let angleDiff = targetAngle - data.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    const steerAmount = Math.max(-1, Math.min(1, angleDiff * 2));
    data.angle += steerAmount * data.turnSpeed * 0.6 * dt;
    
    // 保持目标车道偏移
    const currentTangent = new THREE.Vector3(Math.sin(data.angle), 0, Math.cos(data.angle));
    const currentNormal = new THREE.Vector3(-currentTangent.z, 0, currentTangent.x);
    const centerPos = getClosestTrackPoint(aiCar.position);
    const offsetError = data.targetOffset - getLateralOffset(aiCar.position, centerPos);
    data.angle += offsetError * 0.02 * dt;
    
    // 速度控制
    const cornerFactor = Math.abs(steerAmount);
    const targetSpeed = data.maxSpeed * (1 - cornerFactor * 0.4);
    
    // 与前车保持距离
    let minDistToFront = 999;
    const allCars = [playerCar, ...aiCars];
    const aiForward = new THREE.Vector3(Math.sin(data.angle), 0, Math.cos(data.angle));
    const aiRight = new THREE.Vector3(Math.cos(data.angle), 0, -Math.sin(data.angle));
    for (const other of allCars) {
        if (other === aiCar) continue;
        const toOther = new THREE.Vector3().subVectors(other.position, aiCar.position);
        const forwardDist = toOther.dot(aiForward);
        const sideDist = Math.abs(toOther.dot(aiRight));
        if (forwardDist > 0 && sideDist < 3.5 && forwardDist < minDistToFront) {
            minDistToFront = forwardDist;
        }
    }
    
    if (minDistToFront < 6 && data.speed > 3) {
        data.speed -= data.braking * 0.5 * dt;
    } else if (data.speed < targetSpeed) {
        data.speed += data.acceleration * 0.7 * dt;
    } else {
        data.speed -= data.friction * 0.5 * dt;
    }
    
    data.speed = Math.max(0, Math.min(data.maxSpeed, data.speed));
    
    // 更新位置
    const forward = new THREE.Vector3(Math.sin(data.angle), 0, Math.cos(data.angle));
    data.velocity = forward.multiplyScalar(data.speed);
    aiCar.position.add(data.velocity.clone().multiplyScalar(dt));
    aiCar.position.y = 0;
    aiCar.rotation.y = data.angle;
    aiCar.rotation.z = 0;
    
    checkTrackBounds(aiCar);
}

// ===================== 赛道边界检测 =====================
function getClosestTrackPoint(pos) {
    let closestT = 0;
    let closestDist = Infinity;
    for (let i = 0; i < trackPoints.length; i++) {
        const dist = pos.distanceTo(trackPoints[i].position);
        if (dist < closestDist) {
            closestDist = dist;
            closestT = i / trackPoints.length;
        }
    }
    return { t: closestT, position: trackCurve.getPointAt(closestT), tangent: trackCurve.getTangentAt(closestT).normalize() };
}

function getLateralOffset(pos, trackPoint) {
    const toPos = new THREE.Vector3().subVectors(pos, trackPoint.position);
    const normal = new THREE.Vector3(-trackPoint.tangent.z, 0, trackPoint.tangent.x).normalize();
    return toPos.dot(normal);
}

function removeVelocityIntoObstacle(car, obstacleNormal) {
    const data = car.userData;
    const intoObstacleSpeed = data.velocity.dot(obstacleNormal);
    if (intoObstacleSpeed > 0) {
        data.velocity.add(obstacleNormal.clone().multiplyScalar(-intoObstacleSpeed));
        const forward = new THREE.Vector3(Math.sin(data.angle), 0, Math.cos(data.angle));
        data.speed = data.velocity.dot(forward);
        if (Math.abs(data.speed) < 0.1) data.speed = 0;
    }
}

function checkTrackBounds(car) {
    const trackPoint = getClosestTrackPoint(car.position);
    const offset = getLateralOffset(car.position, trackPoint);
    const limit = trackWidth / 2 - 0.5;
    
    if (Math.abs(offset) > limit) {
        // 撞墙/出界
        const trackNormal = new THREE.Vector3(-trackPoint.tangent.z, 0, trackPoint.tangent.x).normalize();
        const outwardNormal = trackNormal.clone().multiplyScalar(offset > 0 ? 1 : -1);
        const inwardNormal = outwardNormal.clone().multiplyScalar(-1);
        const pushAmount = Math.abs(offset) - limit + 0.5;
        car.position.add(inwardNormal.clone().multiplyScalar(pushAmount));
        car.position.y = 0;
        
        removeVelocityIntoObstacle(car, outwardNormal);
        
        if (car.userData.isPlayer) {
            const forwardPressed = keys['ArrowUp'] || keys['KeyW'] || keys['w'] || keys['W'];
            const backwardPressed = keys['ArrowDown'] || keys['KeyS'] || keys['s'] || keys['S'];
            const escapeInput = forwardPressed ? 1 : (backwardPressed ? -1 : 0);
            if (escapeInput !== 0) {
                const forward = new THREE.Vector3(Math.sin(car.userData.angle), 0, Math.cos(car.userData.angle));
                const escapeDir = forward.clone().multiplyScalar(escapeInput);
                if (escapeDir.dot(outwardNormal) <= 0.2) {
                    car.position.add(escapeDir.multiplyScalar(0.35));
                    car.userData.speed = escapeInput * Math.max(2, Math.abs(car.userData.speed));
                }
            }
        }
        
        // 撞墙只在短暂冷却后减速一次，避免贴着栏杆时每帧被扣速导致操作像失效
        if (car.userData.wallHitCooldown <= 0) {
            car.userData.speed *= 0.8;
            car.userData.velocity.multiplyScalar(0.8);
            car.userData.wallHitCooldown = 0.35;
        }
        
        if (car.userData.isPlayer && car.userData.wallHitCooldown === 0.35) {
            showCollisionText('💥 撞墙！');
            spawnParticles(car.position, 0xffaa00, 8, 'spark');
        }
    }
}

// ===================== 碰撞检测（车辆间 OBB-SAT） =====================
function carsOverlapping(carA, carB) {
    const hw = 1.1, hl = 2.25;
    const dx = carB.position.x - carA.position.x;
    const dz = carB.position.z - carA.position.z;
    const aA = carA.userData.angle;
    const aB = carB.userData.angle;

    // 局部坐标轴（XZ平面）
    const aFx = Math.sin(aA), aFz = Math.cos(aA);
    const aRx = Math.cos(aA), aRz = -Math.sin(aA);
    const bFx = Math.sin(aB), bFz = Math.cos(aB);
    const bRx = Math.cos(aB), bRz = -Math.sin(aB);

    // 各形状在4个分离轴上的半投影长度
    const aProj = [
        hl, // 沿A前轴
        hw, // 沿A右轴
        Math.abs(bFx*aFx + bFz*aFz)*hl + Math.abs(bRx*aFx + bRz*aFz)*hw,
        Math.abs(bFx*aRx + bFz*aRz)*hl + Math.abs(bRx*aRx + bRz*aRz)*hw
    ];
    const bProj = [
        Math.abs(aFx*bFx + aFz*bFz)*hl + Math.abs(aRx*bFx + aRz*bFz)*hw,
        Math.abs(aFx*bRx + aFz*bRz)*hl + Math.abs(aRx*bRx + aRz*bRz)*hw,
        hl,
        hw
    ];

    // B中心相对A中心在各轴上的投影
    const dists = [dx*aFx+dz*aFz, dx*aRx+dz*aRz, dx*bFx+dz*bFz, dx*bRx+dz*bRz];

    for (let i = 0; i < 4; i++) {
        if (dists[i] > aProj[i] + bProj[i] || dists[i] < -(aProj[i] + bProj[i])) return false;
    }
    return true;
}

function checkCarCollisions() {
    const allCars = [playerCar, ...aiCars];
    
    for (let i = 0; i < allCars.length; i++) {
        for (let j = i + 1; j < allCars.length; j++) {
            const carA = allCars[i];
            const carB = allCars[j];
            const offset = new THREE.Vector3().subVectors(carB.position, carA.position);
            const dist = offset.length();
            
            if (dist > 8) continue;
            
            if (carsOverlapping(carA, carB)) {
                // 碰撞响应：先推出安全距离，避免下一帧继续重叠导致“粘住”
                const normal = dist > 0.001
                    ? offset.normalize()
                    : new THREE.Vector3(Math.sin(carA.userData.angle), 0, Math.cos(carA.userData.angle)).normalize();
                const bounceDistance = 0.65;
                
                carA.position.add(normal.clone().multiplyScalar(-bounceDistance));
                carB.position.add(normal.clone().multiplyScalar(bounceDistance));
                carA.position.y = 0;
                carB.position.y = 0;
                removeVelocityIntoObstacle(carA, normal);
                removeVelocityIntoObstacle(carB, normal.clone().multiplyScalar(-1));
                
                const shouldApplyHit = carA.userData.carHitCooldown <= 0 || carB.userData.carHitCooldown <= 0;
                if (shouldApplyHit) {
                    // 碰撞后减速 20%，但同一次贴近接触不会每帧重复减速
                    if (carA.userData.carHitCooldown <= 0) {
                        carA.userData.speed *= 0.8;
                        carA.userData.velocity.multiplyScalar(0.8);
                        carA.userData.carHitCooldown = 0.35;
                    }
                    if (carB.userData.carHitCooldown <= 0) {
                        carB.userData.speed *= 0.8;
                        carB.userData.velocity.multiplyScalar(0.8);
                        carB.userData.carHitCooldown = 0.35;
                    }
                    
                    // 粒子特效
                    const midPoint = carA.position.clone().add(carB.position).multiplyScalar(0.5);
                    spawnParticles(midPoint, 0xff3333, 12, 'spark');
                }
                
                if (shouldApplyHit && (carA.userData.isPlayer || carB.userData.isPlayer)) {
                    showCollisionText('💥 碰撞！');
                }
            }
        }
    }
}

// ===================== 粒子系统 =====================
function initParticlePool() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_POOL_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.3,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Points(geo, mat);
    scene.add(mesh);
    particlePool.mesh = mesh;
    particlePool.positions = pos;
    particlePool.total = 0;
    particlePool.active = [];
}

function spawnParticles(position, color, count, type) {
    if (particlePool.active.length >= MAX_POOL_PARTICLES) return;
    count = Math.min(count, MAX_POOL_PARTICLES - particlePool.active.length);
    const pos = particlePool.positions;
    for (let i = 0; i < count; i++) {
        const idx = particlePool.total;
        const px = position.x + (Math.random() - 0.5) * 1;
        const py = position.y + Math.random() * 1;
        const pz = position.z + (Math.random() - 0.5) * 1;
        pos[idx * 3] = px;
        pos[idx * 3 + 1] = py;
        pos[idx * 3 + 2] = pz;
        particlePool.active.push({
            idx: idx,
            x: px, y: py, z: pz,
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * 5,
            vz: (Math.random() - 0.5) * 8,
            life: 0.5 + Math.random() * 0.5
        });
        particlePool.total++;
    }
    particlePool.mesh.material.color.setHex(color);
    particlePool.mesh.geometry.attributes.position.needsUpdate = true;
}

function updateParticles(dt) {
    const active = particlePool.active;
    if (active.length === 0) return;
    const pos = particlePool.positions;
    for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        p.life -= dt;
        if (p.life <= 0) {
            active.splice(i, 1);
            continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt;
        pos[p.idx * 3] = p.x;
        pos[p.idx * 3 + 1] = p.y;
        pos[p.idx * 3 + 2] = p.z;
    }
    particlePool.mesh.geometry.attributes.position.needsUpdate = true;
    if (active.length === 0) {
        particlePool.total = 0;
    }
}

// ===================== 摄像机跟随 =====================
function updateCamera(dt) {
    const data = playerCar.userData;
    const speedRatio = Math.abs(data.speed) / data.maxSpeed;
    
    // 相机跟随位置
    const carPos = playerCar.position.clone();
    const carAngle = data.angle;
    
    // 相机距离随速度变化
    const baseDistance = 10;
    const distance = baseDistance + speedRatio * 5;
    const height = 4 + speedRatio * 2;
    
    const offsetX = Math.sin(carAngle) * (-distance);
    const offsetZ = Math.cos(carAngle) * (-distance);
    
    const targetPos = new THREE.Vector3(
        carPos.x + offsetX,
        carPos.y + height,
        carPos.z + offsetZ
    );
    
    // 平滑跟随
    camera.position.lerp(targetPos, 5 * dt);
    
    // 相机看向车辆前方
    const lookOffset = new THREE.Vector3(
        Math.sin(carAngle) * 8,
        0,
        Math.cos(carAngle) * 8
    );
    const lookTarget = carPos.clone().add(lookOffset);
    
    // 使用临时对象平滑lookAt
    const currentLook = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    currentLook.lerp(lookTarget, 5 * dt);
    camera.lookAt(currentLook);
    
    // FOV变化（速度感）
    const targetFOV = 60 + speedRatio * 15;
    camera.fov += (targetFOV - camera.fov) * 3 * dt;
    camera.updateProjectionMatrix();
}

// ===================== 圈数检测 =====================
function updateLapProgress() {
    const allCars = [playerCar, ...aiCars];
    
    for (const car of allCars) {
        const data = car.userData;
        if (data.finished) continue;
        
        // 获取在赛道上的位置（t值）
        const trackPoint = getClosestTrackPoint(car.position);
        const t = trackPoint.t;
        
        // 检测通过起点线（t从接近1跳到接近0，或反过来）
        const wasBefore = data.checkpoint < 0.5;
        const isAfter = t > 0.5;
        
        // 简单检测：通过起点区域（t在0附近）且之前已经走了大半圈
        if (data.checkpointPassed && t < 0.15 && data.checkpoint > 0.5) {
            data.lap++;
            data.checkpointPassed = false;
            
            if (car === playerCar) {
                const lapTime = raceTime - lapData.startTime;
                lapData.times.push(lapTime);
                if (!lapData.best || lapTime < lapData.best) lapData.best = lapTime;
                lapData.startTime = raceTime;
                lapData.current = data.lap + 1;
                updateLapTimesDisplay();
                
                if (data.lap >= lapData.total) {
                    finishRace();
                }
            }
        }
        
        data.checkpoint = t;
        if (t > 0.3) data.checkpointPassed = true;
    }
}

function updateLapTimesDisplay() {
    const list = document.getElementById('lapTimesList');
    const container = document.getElementById('lapTimes');
    list.innerHTML = '';
    
    lapData.times.forEach((time, i) => {
        const div = document.createElement('div');
        div.className = 'lap-time-item' + (time === lapData.best ? ' best' : '');
        div.textContent = `第${i + 1}圈: ${formatTime(time)}`;
        list.appendChild(div);
    });
    
    if (lapData.times.length > 0) container.style.display = 'block';
}

function finishRace() {
    gameState = 'finished';
    playerCar.userData.finished = true;
    playerCar.userData.totalTime = raceTime;
    
    // 计算AI的最终成绩
    const allCars = [playerCar, ...aiCars];
    for (const car of allCars) {
        if (!car.userData.finished) {
            car.userData.totalTime = raceTime + (lapData.total - car.userData.lap) * 60;
        }
    }
    
    // 排名
    allCars.sort((a, b) => a.userData.totalTime - b.userData.totalTime);
    const playerRank = allCars.indexOf(playerCar) + 1;
    
    // 显示结果
    document.getElementById('finalRank').textContent = `第 ${playerRank} 名`;
    document.getElementById('finalTime').textContent = formatTime(raceTime);
    document.getElementById('bestLap').textContent = lapData.best ? formatTime(lapData.best) : '-';
    
    const title = document.getElementById('gameOverTitle');
    if (playerRank === 1) title.textContent = '🏆 冠军！';
    else if (playerRank === 2) title.textContent = '🥈 亚军！';
    else if (playerRank === 3) title.textContent = '🥉 季军！';
    else title.textContent = '比赛结束';
    
    gameOverEl.style.display = 'block';
    hudEl.style.display = 'none';
    document.getElementById('minimap').style.display = 'none';
}

// ===================== HUD 更新 =====================
function updateHUD() {
    const data = playerCar.userData;
    
    // 速度（km/h）
    const kmh = Math.abs(data.speed) * 3.6;
    document.getElementById('speedValue').textContent = Math.floor(kmh);
    const speedPercent = Math.min(100, (Math.abs(data.speed) / data.maxSpeed) * 100);
    document.getElementById('speedFill').style.width = speedPercent + '%';
    
    // 速度模糊效果
    if (speedPercent > 60) {
        const blur = (speedPercent - 60) / 40 * 4;
        speedBlurEl.style.backdropFilter = `blur(${blur}px)`;
    } else {
        speedBlurEl.style.backdropFilter = 'blur(0px)';
    }
    
    // 圈数
    document.getElementById('lapValue').textContent = `${Math.min(lapData.current, lapData.total)} / ${lapData.total}`;
    
    // 计时
    document.getElementById('timerValue').textContent = formatTime(raceTime);
    
    // 排名
    const rank = calculateRank();
    if (rank !== lastRank) {
        lastRank = rank;
        document.getElementById('rankValue').textContent = `${rank} / 4`;
    }
    
    // 漂移指示
    const driftInd = document.getElementById('driftIndicator');
    driftInd.style.display = data.isDrifting ? 'block' : 'none';
}

function calculateRank() {
    const allCars = [playerCar, ...aiCars];
    // 按圈数，然后按赛道进度
    allCars.sort((a, b) => {
        if (a.userData.lap !== b.userData.lap) return b.userData.lap - a.userData.lap;
        return b.userData.checkpoint - a.userData.checkpoint;
    });
    return allCars.indexOf(playerCar) + 1;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function showCollisionText(text) {
    collisionTextEl.textContent = text;
    collisionTextEl.style.display = 'block';
    collisionTextEl.style.animation = 'none';
    collisionTextEl.offsetHeight; // 触发回流
    collisionTextEl.style.animation = 'collisionPop 0.8s ease forwards';
    setTimeout(() => { collisionTextEl.style.display = 'none'; }, 800);
}

// ===================== 小地图 =====================
function updateMinimap() {
    if (!minimapCtx) return;
    const ctx = minimapCtx;
    const w = 150, h = 150;
    
    ctx.clearRect(0, 0, w, h);
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    
    // 绘制赛道轮廓
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= trackPoints.length; i++) {
        const idx = i % trackPoints.length;
        const p = trackPoints[idx].position;
        const x = (p.x / 120 + 0.5) * w;
        const y = (p.z / 120 + 0.5) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // 绘制车辆
    const allCars = [playerCar, ...aiCars];
    allCars.forEach(car => {
        const p = car.position;
        const x = (p.x / 120 + 0.5) * w;
        const y = (p.z / 120 + 0.5) * h;
        const color = car === playerCar ? '#e74c3c' : '#' + car.userData.color.toString(16).padStart(6, '0');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, car === playerCar ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ===================== 游戏控制 =====================
function clearCountdownTimers() {
    countdownTimeouts.forEach(id => clearTimeout(id));
    countdownTimeouts = [];
}

function beginRaceAfterCountdown() {
    if (gameState !== 'countdown') return;
    countdownEl.style.display = 'none';
    gameState = 'racing';
    raceTime = 0;
    lapData.startTime = 0;
    clock.getDelta();
}

function setCountdownText(text) {
    const countdownNum = document.getElementById('countdownNum');
    countdownNum.textContent = text;
    countdownNum.style.animation = 'none';
    countdownNum.offsetWidth;
    countdownNum.style.animation = 'countPop 0.9s ease';
}

function startCountdown() {
    clearCountdownTimers();
    keys = {};
    startScreenEl.style.display = 'none';
    hudEl.style.display = 'block';
    document.getElementById('minimap').style.display = 'block';
    gameState = 'countdown';
    countdownValue = 3;
    countdownTimer = 0;
    countdownEl.style.display = 'flex';
    setCountdownText(countdownValue);
    
    countdownTimeouts.push(setTimeout(() => {
        if (gameState === 'countdown') setCountdownText('2');
    }, 1000));
    countdownTimeouts.push(setTimeout(() => {
        if (gameState === 'countdown') setCountdownText('1');
    }, 2000));
    countdownTimeouts.push(setTimeout(() => {
        if (gameState === 'countdown') setCountdownText('GO!');
    }, 3000));
    countdownTimeouts.push(setTimeout(beginRaceAfterCountdown, 4000));
}

function restartGame() {
    clearCountdownTimers();
    // 重置游戏状态
    gameState = 'menu';
    raceTime = 0;
    lapData = { current: 1, total: 3, times: [], best: null, startTime: 0, checkpointPassed: false };
    lastRank = 1;
    
    // 重置车辆位置
    resetCar(playerCar, 0.01, 0);
    for (let i = 0; i < aiCars.length; i++) {
        const startT = 0.01 - (i + 1) * 0.005;
        resetCar(aiCars[i], Math.max(0, startT), ((i % 2 === 0) ? 1 : -1) * (2 + i * 0.5));
    }
    
    // 清除粒子
    particlePool.active = [];
    particlePool.total = 0;
    
    // 重置HUD
    document.getElementById('lapTimes').style.display = 'none';
    document.getElementById('lapTimesList').innerHTML = '';
    document.getElementById('speedFill').style.width = '0%';
    speedBlurEl.style.backdropFilter = 'blur(0px)';
    
    gameOverEl.style.display = 'none';
    startScreenEl.style.display = 'flex';
    hudEl.style.display = 'none';
    document.getElementById('minimap').style.display = 'none';
}

function resetCar(car, t, lateralOffset) {
    const point = trackCurve.getPointAt(t);
    const tangent = trackCurve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    
    car.position.copy(point).add(normal.multiplyScalar(lateralOffset));
    car.position.y = 0;
    car.userData.speed = 0;
    car.userData.velocity.set(0, 0, 0);
    car.userData.angle = Math.atan2(tangent.x, tangent.z);
    car.rotation.y = car.userData.angle;
    car.rotation.z = 0;
    car.userData.lap = 0;
    car.userData.checkpoint = 0;
    car.userData.checkpointPassed = false;
    car.userData.finished = false;
    car.userData.totalTime = 0;
    car.userData.driftAngle = 0;
    car.userData.isDrifting = false;
    car.userData.wallHitCooldown = 0;
    car.userData.carHitCooldown = 0;
}

// ===================== 事件处理 =====================
function onWindowResize() {
    const container = document.getElementById('canvasContainer');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function onKeyDown(e) {
    keys[e.key] = true;
    keys[e.code] = true;
    if (e.key === 'ArrowUp' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.code === 'KeyW') {
        keys['ArrowDown'] = keys['KeyS'] = keys['s'] = keys['S'] = false;
    }
    if (e.key === 'ArrowDown' || e.code === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.code === 'KeyS') {
        keys['ArrowUp'] = keys['KeyW'] = keys['w'] = keys['W'] = false;
    }
    if (e.key === ' ' && gameState === 'racing') e.preventDefault();
    if ((e.key === 'Enter' || e.key === ' ') && gameState === 'menu') {
        e.preventDefault();
        startCountdown();
    }
}

function onKeyUp(e) {
    keys[e.key] = false;
    keys[e.code] = false;
}

// ===================== 游戏循环 =====================
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    
    if (gameState === 'countdown') {
        // 倒计时期间不更新车辆物理，实际开赛由 beginRaceAfterCountdown 控制
    } else if (gameState === 'racing') {
        raceTime += dt;
        updatePlayerPhysics(dt);
        aiCars.forEach(car => updateAIPhysics(car, dt));
        checkCarCollisions();
        updateParticles(dt);
        updateCamera(dt);
        updateLapProgress();
        updateHUD();
    }
    
    renderer.render(scene, camera);
    updateMinimap();
}

// ===================== 辅助函数 =====================
function darkenColor(hex, percent) {
    const r = ((hex >> 16) & 0xFF) * (1 - percent / 100);
    const g = ((hex >> 8) & 0xFF) * (1 - percent / 100);
    const b = (hex & 0xFF) * (1 - percent / 100);
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}

// 启动
init();
