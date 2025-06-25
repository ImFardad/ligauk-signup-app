// app/public/js/minigame.js

// Ensure THREE is loaded (e.g. via CDN in dashboard.ejs)
// <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
// Make sure axios is available (loaded in dashboard.ejs)
// Make sure showLoadingSpinner and sendNotification are available (global helpers from existing scripts)

const Minigame = {
    // Three.js components
    scene: null,
    camera: null,
    renderer: null,
    playerMesh: null,
    otherPlayerMeshes: {}, // { groupId: mesh }
    mapBlockMeshes: {},    // { 'x_y_z': mesh }
    treasureBoxMeshes: {}, // { treasureId: mesh }
    groupNameSprites: {}, // { groupId: sprite }

    // Game state
    isConnected: false,
    gameState: null,
    currentFuel: 0,
    playerPosition: { x: 0, y: 0, z: 0 }, // Game coordinates
    cameraAngle: 0, // 0: North (looking towards +Y game), 90: East (+X game), 180: South (-Y game), 270: West (-X game)
    groupId: null, // Current player's group ID (synonymous with playerId for this module)

    // Constants (some might be duplicated from server for convenience, but server is authoritative)
    VIEW_RADIUS: 10, // Should match server's view radius for consistency
    PLAYER_MESH_COLOR: 0x007bff, // Blue
    OTHER_PLAYER_MESH_COLOR: 0xdc3545, // Red
    TREASURE_MESH_COLOR: 0xffcc00, // Gold-ish
    BLOCK_SIZE: 1, // Assuming 1x1x1 blocks

    // DOM Elements
    containerEl: null,
    loadingScreenEl: null,
    gameScreenEl: null,
    connectBtnEl: null,
    fuelDisplayEl: null,
    settingsModalEl: null,
    mapOverviewContainerEl: null,
    gameCanvasContainerEl: null, // Specific container for the canvas

    // --- Initialization and Setup ---
    init(containerElementId) {
        this.containerEl = document.getElementById(containerElementId);
        if (!this.containerEl) {
            console.error('Minigame container element not found:', containerElementId);
            return;
        }
        // Dynamically create needed HTML structure inside the container if not present
        // This makes the EJS part simpler, just need one div for minigame.
        this.containerEl.innerHTML = `
            <div id="minigame-loading-screen" class="p-4 text-center" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <h2 class="text-2xl font-bold text-white mb-4">مینی‌گیم جزیره گنج</h2>
                <div id="minigame-map-overview-container" class="mb-4 text-gray-300">در حال بارگذاری نقشه...</div>
                <button id="minigame-connect-btn" class="pixel-btn pixel-btn-success">اتصال به بازی</button>
            </div>
            <div id="minigame-game-screen" style="display: none; width:100%; height:100%; position:relative;">
                <div id="minigame-canvas-container" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:1;"></div>
                <div id="minigame-hud" class="absolute top-0 left-0 p-2 md:p-4 text-white w-full" style="z-index:2; pointer-events:none;">
                    <div class="flex justify-between items-center">
                        <div>سوخت: <span id="minigame-fuel-display" class="font-bold">0</span></div>
                        <button id="minigame-settings-btn" class="pixel-btn pixel-btn-sm" style="pointer-events:auto;">تنظیمات</button>
                    </div>
                </div>
                <div id="minigame-game-controls" class="absolute bottom-0 left-1/2 transform -translate-x-1/2 p-2 md:p-4 flex space-x-1 md:space-x-2" style="z-index:2; pointer-events:auto;">
                    <button id="minigame-rotate-left" title="چرخش دوربین به چپ" class="pixel-btn"><i class="fas fa-undo"></i></button>
                    <button id="minigame-move-forward" title="حرکت به جلو" class="pixel-btn"><i class="fas fa-arrow-up"></i></button>
                    <button id="minigame-rotate-right" title="چرخش دوربین به راست" class="pixel-btn"><i class="fas fa-redo"></i></button>
                    <button id="minigame-move-left" title="حرکت به چپ" class="pixel-btn"><i class="fas fa-arrow-left"></i></button>
                    <button id="minigame-move-backward" title="حرکت به عقب" class="pixel-btn"><i class="fas fa-arrow-down"></i></button>
                    <button id="minigame-move-right" title="حرکت به راست" class="pixel-btn"><i class="fas fa-arrow-right"></i></button>
                    <button id="minigame-action-btn" title="بازکردن جعبه / تعامل" class="pixel-btn pixel-btn-action"><i class="fas fa-hand-paper"></i></button>
                </div>
            </div>
            <div id="minigame-settings-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center" style="display: none; z-index:100;">
                <div class="bg-gray-800 p-6 rounded-lg shadow-xl text-white w-full max-w-md pixel-border">
                    <h3 class="text-xl font-bold mb-4 text-center">تنظیمات مینی‌گیم</h3>
                    <button id="minigame-buy-fuel-btn" class="pixel-btn pixel-btn-info w-full mb-3">خرید سوخت</button>
                    <button id="minigame-disconnect-btn-modal" class="pixel-btn pixel-btn-danger w-full mb-6">قطع اتصال از بازی</button>
                    <button id="minigame-settings-close-btn" class="pixel-btn w-full">بستن</button>
                </div>
            </div>
        `;

        // Assign DOM elements after innerHTML is set
        this.loadingScreenEl = document.getElementById('minigame-loading-screen');
        this.gameScreenEl = document.getElementById('minigame-game-screen');
        this.connectBtnEl = document.getElementById('minigame-connect-btn');
        this.fuelDisplayEl = document.getElementById('minigame-fuel-display');
        this.settingsModalEl = document.getElementById('minigame-settings-modal');
        this.mapOverviewContainerEl = document.getElementById('minigame-map-overview-container');
        this.gameCanvasContainerEl = document.getElementById('minigame-canvas-container');


        this.setupLoadingScreen();
        this.bindEventListeners();
        this.initSocketListeners();
    },

    setupLoadingScreen() {
        this.loadingScreenEl.style.display = 'flex';
        this.gameScreenEl.style.display = 'none';
        this.mapOverviewContainerEl.innerHTML = 'در حال بارگذاری نقشه اولیه...';
        axios.get('/api/minigame/map/overview')
            .then(response => {
                if (response.data && response.data.blocks) {
                     this.mapOverviewContainerEl.innerHTML = `<p class="text-sm text-gray-400">نقشه با ${response.data.blocks.length} بلاک آماده است. برای شروع، به بازی متصل شوید.</p>`;
                     // Optionally, render a simple 2D canvas preview here
                } else {
                    this.mapOverviewContainerEl.innerHTML = 'خطا در بارگذاری پیش‌نمایش نقشه.';
                }
            })
            .catch(error => {
                console.error('Error fetching map overview:', error);
                this.mapOverviewContainerEl.innerHTML = 'خطا در بارگذاری پیش‌نمایش نقشه.';
                this.showError('خطا در دریافت اطلاعات اولیه نقشه.');
            });
    },

    bindEventListeners() {
        this.connectBtnEl.addEventListener('click', () => this.connect());

        document.getElementById('minigame-move-forward')?.addEventListener('click', () => this.move('forward'));
        document.getElementById('minigame-move-backward')?.addEventListener('click', () => this.move('backward'));
        document.getElementById('minigame-move-left')?.addEventListener('click', () => this.move('left'));
        document.getElementById('minigame-move-right')?.addEventListener('click', () => this.move('right'));
        document.getElementById('minigame-rotate-left')?.addEventListener('click', () => this.rotateCamera(false));
        document.getElementById('minigame-rotate-right')?.addEventListener('click', () => this.rotateCamera(true));
        document.getElementById('minigame-action-btn')?.addEventListener('click', () => this.performAction());


        document.getElementById('minigame-buy-fuel-btn')?.addEventListener('click', () => this.promptBuyFuel());
        document.getElementById('minigame-settings-btn')?.addEventListener('click', () => this.toggleSettingsModal(true));
        document.getElementById('minigame-settings-close-btn')?.addEventListener('click', () => this.toggleSettingsModal(false));
        document.getElementById('minigame-disconnect-btn-modal')?.addEventListener('click', () => this.disconnect());
    },

    initThreeJS() {
        if (this.renderer) return; // Already initialized

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue color

        const containerWidth = this.gameCanvasContainerEl.clientWidth;
        const containerHeight = this.gameCanvasContainerEl.clientHeight;

        this.camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(containerWidth, containerHeight);
        this.gameCanvasContainerEl.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(10, 15, 5); // x, y (height), z
        directionalLight.castShadow = false; // Optional: shadows can be expensive
        this.scene.add(directionalLight);

        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.animate();
    },

    onWindowResize() {
        if (!this.camera || !this.renderer || !this.gameCanvasContainerEl) return;
        const width = this.gameCanvasContainerEl.clientWidth;
        const height = this.gameCanvasContainerEl.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },

    animate() {
        // Check if game is active and renderer exists
        if (!this.isConnected || !this.renderer || this.gameScreenEl.style.display === 'none') {
            // If the game screen is not visible, or not connected, don't continue the animation loop.
            // This is a basic way to pause rendering when the minigame section is not active.
            // A more robust solution would involve explicitly stopping/starting the loop when the section visibility changes.
            return;
        }
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    },

    // --- Game Logic & API Calls ---
    connect() {
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
        axios.post('/api/minigame/connect')
            .then(response => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                if (response.data.success) {
                    this.isConnected = true;
                    this.gameState = response.data.state;
                    this.groupId = this.gameState.groupId || null; // Make sure server sends groupId
                    this.currentFuel = this.gameState.fuel;
                    this.playerPosition = this.gameState.position;

                    this.loadingScreenEl.style.display = 'none';
                    this.gameScreenEl.style.display = 'block';

                    this.initThreeJS();
                    this.updateGameUI();
                    this.renderSceneFromServerState(this.gameState);
                    this.updateCameraView();

                    if (window.socket && this.groupId) {
                        window.socket.emit('minigame:join', this.groupId); // For server to add to group room
                    }
                    this.showSuccess('به بازی متصل شدید!');
                    if (!this.renderer.info.render.frame) this.animate(); // Restart animation loop if it was stopped
                } else {
                    this.showError(response.data.message || 'خطا در اتصال به بازی.');
                }
            })
            .catch(error => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                this.showError(error.response?.data?.message || 'خطای شبکه در اتصال به بازی.');
                console.error('Connect error:', error);
            });
    },

    disconnect(isAutoDisconnect = false) { // isAutoDisconnect for when user leaves section
        if (!this.isConnected && !isAutoDisconnect) return; // Don't spam if already disconnected by user action

        axios.post('/api/minigame/disconnect')
            .then(response => {
                if (response.data.success && !isAutoDisconnect) {
                    this.showSuccess('اتصال شما از بازی قطع شد.');
                }
            })
            .catch(error => {
                if (!isAutoDisconnect) {
                     this.showError(error.response?.data?.message || 'خطا در قطع اتصال.');
                }
                console.error('Disconnect error:', error);
            })
            .finally(() => {
                this.isConnected = false;
                this.gameState = null;
                if (window.socket && this.groupId) {
                    window.socket.emit('minigame:leave', this.groupId);
                }
                this.groupId = null;

                this.clearScene(); // Clear 3D objects
                // The renderer and camera are kept, but animate() loop will stop.

                this.setupLoadingScreen(); // Go back to loading screen
                this.toggleSettingsModal(false);
            });
    },

    updateGameUI() {
        if (this.fuelDisplayEl) this.fuelDisplayEl.textContent = this.currentFuel;
        // Enable/disable game controls based on isConnected or other states
        document.querySelectorAll('#minigame-game-controls button, #minigame-hud button').forEach(btn => btn.disabled = !this.isConnected);
    },

    clearScene() {
        if (this.scene) {
            // Dispose geometries and materials to free GPU memory
            const disposeObject = (obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            };
            // Remove all meshes and sprites
            Object.values(this.mapBlockMeshes).forEach(disposeObject);
            Object.values(this.treasureBoxMeshes).forEach(disposeObject);
            Object.values(this.otherPlayerMeshes).forEach(disposeObject);
            Object.values(this.groupNameSprites).forEach(disposeObject);
            if(this.playerMesh) disposeObject(this.playerMesh);

            while (this.scene.children.length > 0) {
                this.scene.remove(this.scene.children[0]);
            }
        }
        this.playerMesh = null;
        this.otherPlayerMeshes = {};
        this.mapBlockMeshes = {};
        this.treasureBoxMeshes = {};
        this.groupNameSprites = {};
        // Re-add lights if they were removed
        if (this.scene) {
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            this.scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
            directionalLight.position.set(10, 15, 5);
            this.scene.add(directionalLight);
        }
    },

    renderSceneFromServerState(newState) {
        if (!this.scene || !this.isConnected || !newState) return;

        this.clearScene(); // Clear previous meshes before re-rendering from new state

        this.gameState = newState; // Update local cache of state
        this.currentFuel = newState.fuel;
        this.playerPosition = newState.position; // Game coords {x, y, z}
        if (!this.groupId && newState.groupId) this.groupId = newState.groupId;


        this.updateGameUI(); // Update HUD elements like fuel

        // Render current player
        const playerGeo = new THREE.BoxGeometry(this.BLOCK_SIZE * 0.8, this.BLOCK_SIZE * 1.5, this.BLOCK_SIZE * 0.8);
        const playerMat = new THREE.MeshPhongMaterial({ color: this.PLAYER_MESH_COLOR });
        this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
        // Game Z is height, so it's Y in THREE. Player pivot at base.
        this.playerMesh.position.set(this.playerPosition.x, this.playerPosition.z + (this.BLOCK_SIZE * 1.5 / 2), this.playerPosition.y);
        this.scene.add(this.playerMesh);
        this.addPlayerNameTag(this.groupId, "شما", this.playerMesh.position, true);


        // Render map blocks
        newState.map.forEach(block => {
            const key = `${block.x}_${block.y}_${block.z}`;
            const blockColors = { grass: 0x22aa22, dirt: 0x8B4513, water: 0x4488ff, stone: 0xaaaaaa, sand: 0xF4A460, wood_plank: 0xDEB887, tree_trunk: 0x795548, leaves: 0x4CAF50, default: 0xcccccc };
            const geo = new THREE.BoxGeometry(this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
            const mat = new THREE.MeshPhongMaterial({ color: blockColors[block.type] || blockColors.default, transparent: block.type === 'water', opacity: block.type === 'water' ? 0.7 : 1.0});
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(block.x, block.z + this.BLOCK_SIZE / 2, block.y); // Game Z to THREE Y
            this.mapBlockMeshes[key] = mesh;
            this.scene.add(mesh);
        });

        // Render treasure boxes
        newState.treasures.forEach(box => {
            const geo = new THREE.BoxGeometry(this.BLOCK_SIZE * 0.6, this.BLOCK_SIZE * 0.6, this.BLOCK_SIZE * 0.6);
            const mat = new THREE.MeshPhongMaterial({ color: this.TREASURE_MESH_COLOR });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(box.x, box.z + this.BLOCK_SIZE * 0.3, box.y);
            mesh.userData = { id: box.id, type: 'treasure' };
            this.treasureBoxMeshes[box.id] = mesh;
            this.scene.add(mesh);
        });

        // Render other players
        newState.otherPlayers.forEach(p => {
            const geo = new THREE.BoxGeometry(this.BLOCK_SIZE * 0.8, this.BLOCK_SIZE * 1.5, this.BLOCK_SIZE * 0.8);
            const mat = new THREE.MeshPhongMaterial({ color: this.OTHER_PLAYER_MESH_COLOR });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(p.position.x, p.position.z + (this.BLOCK_SIZE * 1.5 / 2), p.position.y);
            this.otherPlayerMeshes[p.groupId] = mesh;
            this.scene.add(mesh);
            this.addPlayerNameTag(p.groupId, p.groupName, mesh.position, false);
        });
        this.updateCameraView(); // Ensure camera is correctly positioned after scene update
    },

    // Helper to create text sprites for names
    makeTextSprite(message, parameters) {
        const fontface = parameters.fontface || 'Arial';
        const fontsize = parameters.fontsize || 18;
        const borderThickness = parameters.borderThickness || 2;
        const borderColor = parameters.borderColor || { r:0, g:0, b:0, a:1.0 };
        const backgroundColor = parameters.backgroundColor || { r:255, g:255, b:255, a:0.0 }; // Transparent background
        const textColor = parameters.textColor || { r:255, g:255, b:255, a:1.0 };

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `Bold ${fontsize}px ${fontface}`;

        const metrics = context.measureText(message);
        const textWidth = metrics.width;

        canvas.width = textWidth + borderThickness * 2;
        canvas.height = fontsize + borderThickness * 2;
        // Make canvas power of 2 for better performance if possible, or use Texture.DEFAULT_MAPPING
        // For simplicity, direct size is used here.

        context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;
        context.strokeStyle = `rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.a})`;
        context.lineWidth = borderThickness;
        // context.fillRect(0, 0, canvas.width, canvas.height); // No background fill
        // context.strokeRect(0, 0, canvas.width, canvas.height); // No border stroke for cleaner text

        context.fillStyle = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, 1.0)`;
        context.fillText(message, borderThickness, fontsize + borderThickness / 2); // Adjusted Y for better baseline

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width/fontsize * 2, canvas.height/fontsize * 2, 1.0); // Adjust scale as needed
        return sprite;
    },

    addPlayerNameTag(groupId, name, playerPositionTHREE, isSelf) { // playerPositionTHREE is THREE.Vector3
        if (this.groupNameSprites[groupId]) {
            this.scene.remove(this.groupNameSprites[groupId]);
            delete this.groupNameSprites[groupId];
        }
        const sprite = this.makeTextSprite(name, {
            fontsize: 24,
            textColor: { r:255, g:255, b:255, a:1.0 },
            // backgroundColor: isSelf ? {r:0,g:100,b:200,a:0.3} : {r:200,g:0,b:0,a:0.3}
        });
        sprite.position.set(playerPositionTHREE.x, playerPositionTHREE.y + 1.2, playerPositionTHREE.z); // Above player head
        this.groupNameSprites[groupId] = sprite;
        this.scene.add(sprite);
    },


    updateCameraView() {
        if (!this.camera || !this.playerMesh) return;

        const camHeightAbovePlayer = 10; // How high the camera is relative to player's head
        const camHorizontalDistance = 7; // How far back the camera is

        let camActualX = this.playerPosition.x; // Game X
        let camActualY_THREE = this.playerPosition.z + (this.BLOCK_SIZE * 1.5 / 2) + camHeightAbovePlayer; // Game Z (height) -> THREE Y
        let camActualZ_THREE = this.playerPosition.y; // Game Y (depth) -> THREE Z

        // Offset camera based on angle, making it orbit around player
        if (this.cameraAngle === 0) { // Looking North (player "up" on screen if Y is depth)
            camActualZ_THREE -= camHorizontalDistance;
        } else if (this.cameraAngle === 90) { // Looking East (player "right" on screen)
            camActualX -= camHorizontalDistance;
        } else if (this.cameraAngle === 180) { // Looking South (player "down" on screen)
            camActualZ_THREE += camHorizontalDistance;
        } else if (this.cameraAngle === 270) { // Looking West (player "left" on screen)
            camActualX += camHorizontalDistance;
        }

        this.camera.position.set(camActualX, camActualY_THREE, camActualZ_THREE);
        // Look at a point slightly above player's feet for better perspective
        this.camera.lookAt(this.playerPosition.x, this.playerPosition.z + (this.BLOCK_SIZE * 0.5), this.playerPosition.y);
    },

    rotateCamera(isClockwise) {
        if (!this.isConnected) return;
        if (isClockwise) {
            this.cameraAngle = (this.cameraAngle + 90) % 360;
        } else {
            this.cameraAngle = (this.cameraAngle - 90 + 360) % 360;
        }
        this.updateCameraView();
    },

    move(direction) {
        if (!this.isConnected) return;
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
        axios.post('/api/minigame/move', { direction, cameraAngle: this.cameraAngle })
            .then(response => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                if (response.data.success) {
                    // Server sends full state, re-render based on it
                    this.renderSceneFromServerState(response.data.newState);
                    // Camera update is called inside renderSceneFromServerState
                } else {
                    this.showError(response.data.message || 'خطا در حرکت.');
                }
            })
            .catch(error => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                this.showError(error.response?.data?.message || 'خطای شبکه در هنگام حرکت.');
            });
    },

    performAction() {
        if (!this.isConnected) return;
        // Currently, action is only opening treasure chests
        this.openTreasureBoxAtPlayerLocation();
    },

    promptBuyFuel() {
        if (!this.isConnected) return;
        const amountStr = prompt("چه مقدار سوخت می‌خواهید بخرید؟ (هر واحد سوخت ۱۰ امتیاز - تخفیف برای خرید بیشتر)", "10");
        if (amountStr) {
            const amount = parseInt(amountStr);
            if (!isNaN(amount) && amount > 0) {
                this.buyFuel(amount);
            } else {
                this.showError("مقدار وارد شده نامعتبر است.");
            }
        }
    },

    buyFuel(amount) {
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
        axios.post('/api/minigame/fuel/buy', { amount })
            .then(response => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                if (response.data.success) {
                    this.currentFuel = response.data.newFuel; // Server sends back new fuel amount
                    this.updateGameUI(); // Update HUD
                    this.showSuccess(response.data.message || `سوخت با موفقیت خریداری شد.`);
                } else {
                    this.showError(response.data.message || 'خطا در خرید سوخت.');
                }
            })
            .catch(error => {
                if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                this.showError(error.response?.data?.message || 'خطای شبکه در خرید سوخت.');
            });
    },

    openTreasureBoxAtPlayerLocation() {
        if (!this.gameState || !this.gameState.treasures) {
            this.showInfo("هیچ جعبه‌ای در دیدرس نیست.");
            return;
        }
        const playerPos = this.playerPosition; // Game coords
        const targetTreasure = this.gameState.treasures.find(
            t => t.x === playerPos.x && t.y === playerPos.y && t.z === playerPos.z
        );

        if (targetTreasure) {
            if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
            axios.post('/api/minigame/treasure/open', { treasureId: targetTreasure.id })
                .then(response => {
                    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                    if (response.data.success) {
                        this.showSuccess(response.data.message);
                        // Server sends the new comprehensive state which includes removal of opened treasure
                        this.renderSceneFromServerState(response.data.newState);
                    } else {
                        this.showError(response.data.message || 'خطا در باز کردن جعبه.');
                    }
                })
                .catch(error => {
                    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
                    this.showError(error.response?.data?.message || 'خطای شبکه در باز کردن جعبه.');
                });
        } else {
            this.showInfo("هیچ جعبه‌ای در مکان فعلی شما برای باز کردن وجود ندارد.");
        }
    },

    toggleSettingsModal(show) {
        if (this.settingsModalEl) {
            this.settingsModalEl.style.display = show ? 'flex' : 'none';
        }
    },

    // --- Socket.IO Event Handlers ---
    initSocketListeners() {
        if (!window.socket) {
            console.warn("Socket.IO client not found. Minigame real-time updates will not work.");
            return;
        }

        // This player's state is fully updated by server push
        window.socket.on('minigame:playerUpdate', (fullPlayerState) => {
            if (this.isConnected && this.groupId && this.groupId === fullPlayerState.groupId) {
                this.renderSceneFromServerState(fullPlayerState);
            }
        });

        // Updates for other players or general game events
        window.socket.on('minigame:playerMoved', (data) => { // { groupId, groupName, newPosition, oldPosition }
            if (this.isConnected && this.groupId !== data.groupId && this.otherPlayerMeshes[data.groupId]) {
                this.otherPlayerMeshes[data.groupId].position.set(data.newPosition.x, data.newPosition.z + (this.BLOCK_SIZE * 1.5 / 2), data.newPosition.y);
                // Update name tag position as well
                if (this.groupNameSprites[data.groupId]) {
                     this.groupNameSprites[data.groupId].position.set(data.newPosition.x, data.newPosition.z + (this.BLOCK_SIZE * 1.5 / 2) + 1.2, data.newPosition.y);
                }
            } else if (this.isConnected && this.groupId !== data.groupId && !this.otherPlayerMeshes[data.groupId]) {
                // Player came into view, add them (this case might be covered by full state update)
                // This requires more info (like groupName) or a request for full state.
                // For now, assume full state update will handle new players entering view.
            }
        });

        window.socket.on('minigame:playerLeft', (data) => { // { groupId }
            if (this.isConnected && this.otherPlayerMeshes[data.groupId]) {
                this.scene.remove(this.otherPlayerMeshes[data.groupId]);
                if(this.otherPlayerMeshes[data.groupId].geometry) this.otherPlayerMeshes[data.groupId].geometry.dispose();
                if(this.otherPlayerMeshes[data.groupId].material) this.otherPlayerMeshes[data.groupId].material.dispose();
                delete this.otherPlayerMeshes[data.groupId];

                if (this.groupNameSprites[data.groupId]) {
                    this.scene.remove(this.groupNameSprites[data.groupId]);
                    delete this.groupNameSprites[data.groupId];
                }
            }
        });

        window.socket.on('minigame:treasureOpened', (data) => { // { treasureId, position }
            if (this.isConnected && this.treasureBoxMeshes[data.treasureId]) {
                this.scene.remove(this.treasureBoxMeshes[data.treasureId]);
                if(this.treasureBoxMeshes[data.treasureId].geometry) this.treasureBoxMeshes[data.treasureId].geometry.dispose();
                if(this.treasureBoxMeshes[data.treasureId].material) this.treasureBoxMeshes[data.treasureId].material.dispose();
                delete this.treasureBoxMeshes[data.treasureId];
            }
        });

        window.socket.on('minigame:treasureAdded', (treasure) => { // { id, x, y, z }
            if (this.isConnected && !this.treasureBoxMeshes[treasure.id]) {
                // Check if in view (simplified, server should ideally send this only if relevant or client requests full state)
                const dx = treasure.x - this.playerPosition.x;
                const dy = treasure.y - this.playerPosition.y;
                if (Math.sqrt(dx*dx + dy*dy) <= this.VIEW_RADIUS) {
                    const geo = new THREE.BoxGeometry(this.BLOCK_SIZE * 0.6, this.BLOCK_SIZE * 0.6, this.BLOCK_SIZE * 0.6);
                    const mat = new THREE.MeshPhongMaterial({ color: this.TREASURE_MESH_COLOR });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(treasure.x, treasure.z + this.BLOCK_SIZE * 0.3, treasure.y);
                    mesh.userData = { id: treasure.id, type: 'treasure' };
                    this.treasureBoxMeshes[treasure.id] = mesh;
                    this.scene.add(mesh);
                }
            }
        });

        window.socket.on('minigame:mapBlockUpdated', (block) => { // { x, y, z, type, isWalkable }
            if (this.isConnected) {
                const key = `${block.x}_${block.y}_${block.z}`;
                // Check if in view
                const dx = block.x - this.playerPosition.x;
                const dy = block.y - this.playerPosition.y;
                 if (Math.sqrt(dx*dx + dy*dy) <= this.VIEW_RADIUS) {
                    if (this.mapBlockMeshes[key]) { // Remove old block
                        this.scene.remove(this.mapBlockMeshes[key]);
                        if(this.mapBlockMeshes[key].geometry) this.mapBlockMeshes[key].geometry.dispose();
                        if(this.mapBlockMeshes[key].material) this.mapBlockMeshes[key].material.dispose();
                        delete this.mapBlockMeshes[key];
                    }
                    // Add new/updated block
                    const blockColors = { grass: 0x22aa22, dirt: 0x8B4513, water: 0x4488ff, stone: 0xaaaaaa, sand: 0xF4A460, wood_plank: 0xDEB887, tree_trunk: 0x795548, leaves: 0x4CAF50, default: 0xcccccc };
                    const geo = new THREE.BoxGeometry(this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                    const mat = new THREE.MeshPhongMaterial({ color: blockColors[block.type] || blockColors.default, transparent: block.type === 'water', opacity: block.type === 'water' ? 0.7 : 1.0});
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(block.x, block.z + this.BLOCK_SIZE / 2, block.y);
                    this.mapBlockMeshes[key] = mesh;
                    this.scene.add(mesh);
                }
            }
        });

        window.socket.on('minigame:notification', (data) => { // { type, message }
            if (this.isConnected) { // Show only if player is in the game
                if (data.type === 'error') this.showError(data.message);
                else if (data.type === 'success') this.showSuccess(data.message);
                else this.showInfo(data.message); // Assuming showInfo exists or defaults to a type
            }
        });
    },

    // --- UI Helper Methods (assumes global sendNotification exists) ---
    showError(message) { if(typeof sendNotification === 'function') sendNotification('error', message); else console.error(message); },
    showSuccess(message) { if(typeof sendNotification === 'function') sendNotification('success', message); else console.log(message);},
    showInfo(message) { if(typeof sendNotification === 'function') sendNotification('info', message); else console.info(message); } // May need to add 'info' style to sendNotification
};

// The Minigame object is now defined.
// It should be initialized when the minigame section becomes visible.
// Example:
// if (document.getElementById('minigame-content-area')) { // Or whatever the main div for this section is
//   Minigame.init('minigame-content-area');
// }
// This initialization logic will be handled in the main script that manages sections/tabs.
// For now, this file just defines the Minigame object.

// Add specific CSS for pixel buttons if not already globally available
function addPixelButtonStyles() {
    if (document.getElementById('minigame-pixel-styles')) return;
    const style = document.createElement('style');
    style.id = 'minigame-pixel-styles';
    style.innerHTML = `
        .pixel-btn {
            font-family: 'Pixelated MS Sans Serif', 'Arial'; /* Need a pixel font */
            background-color: #ddd;
            border: 2px solid #000;
            box-shadow: 2px 2px 0px #000;
            padding: 8px 12px;
            margin: 2px;
            cursor: pointer;
            text-align: center;
            color: #000;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 40px; /* For icon buttons */
        }
        .pixel-btn:active {
            box-shadow: none;
            transform: translate(2px, 2px);
        }
        .pixel-btn-sm { padding: 4px 8px; font-size: 0.8em; }
        .pixel-btn-success { background-color: #90ee90; } /* LightGreen */
        .pixel-btn-danger { background-color: #f08080; } /* LightCoral */
        .pixel-btn-info { background-color: #add8e6; } /* LightBlue */
        .pixel-btn-action { background-color: #ffd700; } /* Gold */

        .pixel-border {
            border: 4px solid;
            border-image-slice: 2;
            border-image-width: 2;
            border-image-repeat: stretch;
            border-image-source: url('data:image/svg+xml;utf8,<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 6 6" style="enable-background:new 0 0 6 6;" xml:space="preserve"><rect x="2" y="0" fill="%23000000" width="2" height="2"/><rect x="4" y="2" fill="%23000000" width="2" height="2"/><rect x="2" y="4" fill="%23000000" width="2" height="2"/><rect x="0" y="2" fill="%23000000" width="2" height="2"/></svg>');
            padding: 10px; /* Adjust padding if content is too close to border */
        }
        /* Fallback border */
        @supports not (border-image-source: url('...')) {
          .pixel-border {
            border: 2px solid black;
          }
        }
    `;
    document.head.appendChild(style);
}
addPixelButtonStyles();

// Make Minigame object available globally or attach to window if needed for external calls
window.Minigame = Minigame;
