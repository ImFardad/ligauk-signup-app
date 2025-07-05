// app/public/js/admin-game-management-mixin.js
const adminGameManagementMixin = {
  data: {
    // Game Management Specific Data
    gameManagementActiveTab: 'maps', // 'maps', 'attacks', 'ammunition', 'settings', 'reset'

    // Maps Tab
    gameMaps: [],
    newMapForm: { name: '', size: 20 },
    editingMap: null, // Store map being edited

    // Attacks Tab
    attackWaves: [],
    newAttackForm: {
        mapId: '',
        power: 100,
        durationValue: 30,
        durationUnit: 'minutes', // 'minutes', 'hours', 'days'
        isPowerVisible: true
    },
    attackDurationUnits: [
        { value: 'minutes', text: 'دقیقه' },
        { value: 'hours', text: 'ساعت' },
        { value: 'days', text: 'روز' },
    ],
    availableMapsForAttack: [], // For dropdown in attack form

    // Ammunition Tab
    gameAmmunitions: [],
    newAmmunitionForm: {
        name: '',
        price: 10,
        health: 50,
        defenseLine: 1,
        maxPerWall: 3,
        isVisible: true,
        imageFile: null,
        imagePreview: null
    },
    editingAmmunition: null, // Store ammunition being edited

    // Settings Tab
    tilePriceSettings: { defaultTilePrice: 100, mapIdForPrice: '' }, // mapIdForPrice is optional
    wallUpgradeSettings: { // Readonly for now, or fetched if dynamic
        wood: { next: 'stone', cost: 150, health: 250, currentHealth: 100 },
        stone: { next: 'metal', cost: 300, health: 500, currentHealth: 250 },
        metal: { next: null, cost: 0, health: 500, currentHealth: 500 } // Added metal for completeness
    },

    // Reset Tab
    mapToReset: ''

  },
  methods: {
    // --- Initialization ---
    async initializeGameManagement() {
        this.setLoadingState(true);
        await this.fetchGameMaps(); // Also populates availableMapsForAttack
        await this.fetchAttackWaves();
        await this.fetchGameAmmunitions();
        await this.fetchGameSettings(); // Fetches tile prices and potentially wall costs
        this.setLoadingState(false);
    },

    // --- Tab Switching ---
    selectGameManagementTab(tabKey) {
        this.gameManagementActiveTab = tabKey;
        if (tabKey === 'maps' && this.gameMaps.length === 0) this.fetchGameMaps(); // Fetch if not already loaded
        else if (tabKey === 'attacks' && this.attackWaves.length === 0) this.fetchAttackWaves();
        else if (tabKey === 'ammunition' && this.gameAmmunitions.length === 0) this.fetchGameAmmunitions();
        else if (tabKey === 'settings') this.fetchGameSettings(); // Always refresh settings as they might depend on selected map
    },

    // --- Maps Tab Methods ---
    async fetchGameMaps() {
        this.setLoadingState(true);
        try {
            const response = await axios.get('/admin/api/game/maps');
            this.gameMaps = response.data;
            this.availableMapsForAttack = this.gameMaps.filter(map => map.isActive);
            if (this.availableMapsForAttack.length > 0 && !this.newAttackForm.mapId) {
                this.newAttackForm.mapId = this.availableMapsForAttack[0].id;
            }
            // Do not auto-select for tilePriceSettings.mapIdForPrice, let admin choose or use global.
        } catch (error) {
            this.sendNotification('error', 'خطا در دریافت لیست نقشه‌ها: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    async createNewMap() {
        if (!this.newMapForm.name || !this.newMapForm.size || parseInt(this.newMapForm.size) <= 0) {
            this.sendNotification('error', 'نام و اندازه معتبر (بزرگتر از صفر) برای نقشه الزامی است.');
            return;
        }
        this.setLoadingState(true);
        try {
            await axios.post('/admin/api/game/maps', {name: this.newMapForm.name, size: parseInt(this.newMapForm.size)});
            this.sendNotification('success', 'نقشه جدید با موفقیت ایجاد شد.');
            this.newMapForm = { name: '', size: 20 }; // Reset form
            await this.fetchGameMaps(); // Refresh list
        } catch (error) {
            this.sendNotification('error', 'خطا در ایجاد نقشه: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    openEditMapModal(map) {
        this.editingMap = JSON.parse(JSON.stringify(map));
    },
    async saveMapChanges() {
        if (!this.editingMap) return;
        this.setLoadingState(true);
        try {
            const payload = {
                name: this.editingMap.name,
                isActive: this.editingMap.isActive,
                gameLocked: this.editingMap.gameLocked
                // Size cannot be changed as per backend logic
            };
            await axios.put(`/admin/api/game/maps/${this.editingMap.id}`, payload);
            this.sendNotification('success', `نقشه '${this.editingMap.name}' با موفقیت به‌روز شد.`);
            this.editingMap = null;
            await this.fetchGameMaps();
        } catch (error) {
            this.sendNotification('error', 'خطا در ذخیره تغییرات نقشه: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    cancelEditMap() {
        this.editingMap = null;
    },

    // --- Attacks Tab Methods ---
    async fetchAttackWaves() {
        this.setLoadingState(true);
        try {
            const response = await axios.get('/admin/api/game/attack-waves'); // Gets all waves
            this.attackWaves = response.data;
        } catch (error) {
            this.sendNotification('error', 'خطا در دریافت لیست امواج حمله: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    async scheduleNewAttack() {
        if (!this.newAttackForm.mapId || !this.newAttackForm.power || this.newAttackForm.durationValue === undefined || !this.newAttackForm.durationUnit) {
            this.sendNotification('error', 'انتخاب نقشه، قدرت، مقدار زمان و واحد زمان الزامی است.');
            return;
        }
        if (parseInt(this.newAttackForm.durationValue) <= 0) {
             this.sendNotification('error', 'مقدار زمان باید عددی مثبت باشد.');
            return;
        }
        this.setLoadingState(true);
        try {
            // Payload now includes durationValue and durationUnit instead of attackTime
            const payload = {
                mapId: this.newAttackForm.mapId,
                power: parseInt(this.newAttackForm.power),
                durationValue: parseInt(this.newAttackForm.durationValue),
                durationUnit: this.newAttackForm.durationUnit,
                isPowerVisible: this.newAttackForm.isPowerVisible
            };
            await axios.post('/admin/api/game/attack-waves', payload);
            this.sendNotification('success', 'موج حمله جدید با موفقیت زمان‌بندی شد.');
            this.newAttackForm = {
                mapId: this.availableMapsForAttack.length > 0 ? this.availableMapsForAttack[0].id : '',
                power: 100,
                durationValue: 30,
                durationUnit: 'minutes',
                isPowerVisible: true
            };
            await this.fetchAttackWaves();
        } catch (error) {
            this.sendNotification('error', 'خطا در زمان‌بندی موج حمله: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    async executeAttackWaveManually(mapId) {
        if (!mapId) {
            this.sendNotification('error', 'نقشه‌ای برای اجرای حمله انتخاب نشده است. از لیست نقشه‌های فعال در تب "حملات" انتخاب کنید.');
            return;
        }
        const mapForAttack = this.gameMaps.find(m => m.id === mapId);
        if (!mapForAttack) {
            this.sendNotification('error', 'نقشه انتخاب شده برای حمله یافت نشد.');
            return;
        }
        if (!confirm(`آیا مطمئن هستید که می‌خواهید موج حمله بعدی را برای نقشه "${mapForAttack.name}" به صورت دستی اجرا کنید؟`)) return;

        this.setLoadingState(true);
        try {
            const response = await axios.post('/admin/api/game/attack-waves/execute', { mapId });
            this.sendNotification('success', response.data.message || 'موج حمله با موفقیت اجرا شد.');
            await this.fetchAttackWaves();
        } catch (error) {
            this.sendNotification('error', 'خطا در اجرای دستی موج حمله: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    formatDateForDisplay(dateString) {
        if (!dateString) return '---';
        return new Date(dateString).toLocaleString('fa-IR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    },

    // --- Ammunition Tab Methods ---
    async fetchGameAmmunitions() {
        this.setLoadingState(true);
        try {
            const response = await axios.get('/admin/api/game/ammunition');
            this.gameAmmunitions = response.data;
        } catch (error) {
            this.sendNotification('error', 'خطا در دریافت لیست مهمات: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    handleAmmunitionImageUpload(event, targetForm = 'new') {
        const file = event.target.files[0];
        if (file) {
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                this.sendNotification('error', 'فرمت فایل تصویر نامعتبر است. فقط JPEG, PNG, GIF مجاز هستند.');
                event.target.value = ''; // Clear the input
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB
                this.sendNotification('error', 'حجم فایل تصویر نباید بیشتر از 5 مگابایت باشد.');
                event.target.value = ''; // Clear the input
                return;
            }

            if (targetForm === 'new') {
                this.newAmmunitionForm.imageFile = file;
                this.newAmmunitionForm.imagePreview = URL.createObjectURL(file);
            } else if (targetForm === 'edit' && this.editingAmmunition) {
                this.editingAmmunition.imageFile = file;
                this.editingAmmunition.imagePreview = URL.createObjectURL(file);
            }
        } else { // No file selected or selection cancelled
             if (targetForm === 'new') {
                this.newAmmunitionForm.imageFile = null;
                this.newAmmunitionForm.imagePreview = null;
            } else if (targetForm === 'edit' && this.editingAmmunition) {
                this.editingAmmunition.imageFile = null;
                // Keep existing image for preview if user deselects:
                this.editingAmmunition.imagePreview = this.editingAmmunition.image || null;
            }
        }
    },
    clearAmmunitionImagePreview(targetForm = 'new') {
        if (targetForm === 'new') {
            this.newAmmunitionForm.imageFile = null;
            this.newAmmunitionForm.imagePreview = null;
            const fileInput = document.getElementById('newAmmoImageFile');
            if(fileInput) fileInput.value = '';
        } else if (targetForm === 'edit' && this.editingAmmunition) {
            this.editingAmmunition.imageFile = null;
            this.editingAmmunition.imagePreview = null; // Will remove preview, backend handles if no new file
            const fileInput = document.getElementById('editAmmoImageFile');
            if(fileInput) fileInput.value = '';
             // To indicate that the existing image should be removed on save:
            this.editingAmmunition.image = null; // Or a special flag like `removeImage: true`
        }
    },
    async saveNewAmmunition() {
        const formData = new FormData();
        for (const key in this.newAmmunitionForm) {
            if (key === 'imageFile' && this.newAmmunitionForm.imageFile) {
                formData.append('imageFile', this.newAmmunitionForm.imageFile);
            } else if (key !== 'imagePreview' && key !== 'imageFile') {
                 formData.append(key, this.newAmmunitionForm[key]);
            }
        }

        this.setLoadingState(true);
        try {
            await axios.post('/admin/api/game/ammunition', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            this.sendNotification('success', 'مهمات جدید با موفقیت ایجاد شد.');
            this.newAmmunitionForm = { name: '', price: 10, health: 50, defenseLine: 1, maxPerWall: 3, isVisible: true, imageFile: null, imagePreview: null };
            const fileInput = document.getElementById('newAmmoImageFile');
            if(fileInput) fileInput.value = '';
            await this.fetchGameAmmunitions();
        } catch (error) {
            this.sendNotification('error', 'خطا در ایجاد مهمات: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    openEditAmmunitionModal(ammo) {
        this.editingAmmunition = JSON.parse(JSON.stringify(ammo));
        this.editingAmmunition.imageFile = null;
        this.editingAmmunition.imagePreview = ammo.image || null;
        const fileInput = document.getElementById('editAmmoImageFile');
        if(fileInput) fileInput.value = '';
    },
    async saveAmmunitionChanges() {
        if (!this.editingAmmunition) return;
        const formData = new FormData();

        // Append all fields except imageFile and imagePreview initially
        for (const key in this.editingAmmunition) {
            if (key !== 'imageFile' && key !== 'imagePreview' && key !== 'image') {
                 formData.append(key, this.editingAmmunition[key]);
            }
        }
        // Handle file separately
        if (this.editingAmmunition.imageFile) { // A new file was selected
            formData.append('imageFile', this.editingAmmunition.imageFile);
        } else if (this.editingAmmunition.image === null && this.editingAmmunition.id && !this.editingAmmunition.imageFile) {
            // This case means the image was explicitly cleared in the UI, and no new file was chosen.
            // The backend needs a way to know to delete the image. We can send the `image` field as empty.
            // Or, if your backend PUT /ammunition/:id without an imageFile field means "keep existing image",
            // and sending `image: null` or an empty string means "remove image", adjust accordingly.
            // For now, we assume if `imageFile` is not present, backend keeps the old image unless `image` field itself is modified.
            // If `editingAmmunition.image` was set to `null` by `clearAmmunitionImagePreview`, this is a signal.
             if(this.editingAmmunition.image === null) {
                 // This signals to backend to remove if it's designed that way
                 // Alternatively, add a specific flag: formData.append('removeCurrentImage', 'true');
             }
        }


        this.setLoadingState(true);
        try {
            await axios.put(`/admin/api/game/ammunition/${this.editingAmmunition.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            this.sendNotification('success', `مهمات '${this.editingAmmunition.name}' با موفقیت به‌روز شد.`);
            this.editingAmmunition = null;
            await this.fetchGameAmmunitions();
        } catch (error) {
            this.sendNotification('error', 'خطا در ذخیره تغییرات مهمات: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    cancelEditAmmunition() {
        this.editingAmmunition = null;
    },
    async deleteGameAmmunition(ammoId) {
        if (!confirm('آیا از حذف این مهمات مطمئن هستید؟ این عمل غیرقابل بازگشت است.')) return;
        this.setLoadingState(true);
        try {
            await axios.delete(`/admin/api/game/ammunition/${ammoId}`);
            this.sendNotification('success', 'مهمات با موفقیت حذف شد.');
            await this.fetchGameAmmunitions();
        } catch (error) {
            this.sendNotification('error', 'خطا در حذف مهمات: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },

    // --- Settings Tab Methods ---
    async fetchGameSettings() {
        this.setLoadingState(true);
        try {
            const params = {};
            if (this.tilePriceSettings.mapIdForPrice) {
                params.mapId = this.tilePriceSettings.mapIdForPrice;
            }
            const tilePriceRes = await axios.get('/admin/api/game/prices/tiles', { params });
            this.tilePriceSettings.defaultTilePrice = tilePriceRes.data.defaultTilePrice;

            const wallCostRes = await axios.get('/admin/api/game/prices/walls');
            this.wallUpgradeSettings = wallCostRes.data;
        } catch (error) {
             this.sendNotification('error', 'خطا در دریافت تنظیمات بازی: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    async saveTilePriceSettings() {
        if (parseInt(this.tilePriceSettings.defaultTilePrice) < 0) {
            this.sendNotification('error', 'قیمت ملک نمی‌تواند منفی باشد.');
            return;
        }
        this.setLoadingState(true);
        try {
            const payload = { defaultPrice: parseInt(this.tilePriceSettings.defaultTilePrice) };
            if (this.tilePriceSettings.mapIdForPrice) {
                payload.mapId = this.tilePriceSettings.mapIdForPrice;
            }
            await axios.post('/admin/api/game/prices/tiles', payload);
            this.sendNotification('success', 'قیمت پیش‌فرض املاک (خالی) با موفقیت ذخیره شد.');
        } catch (error) {
            this.sendNotification('error', 'خطا در ذخیره قیمت املاک: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },
    // saveWallUpgradeCosts would go here if wall costs were dynamically configurable via API

    // --- Reset Tab Methods ---
    async resetGameDataForMap() {
        if (!this.mapToReset) {
            this.sendNotification('error', 'لطفاً یک نقشه برای ریست کردن انتخاب کنید.');
            return;
        }
        const mapNameToReset = this.gameMaps.find(m => m.id == this.mapToReset)?.name || `ID: ${this.mapToReset}`;
        if (!confirm(`هشدار جدی! آیا مطمئن هستید که می‌خواهید تمام اطلاعات بازی (مالکیت املاک، دیوارها، مهمات مستقر شده، امواج حمله) را برای نقشه "${mapNameToReset}" ریست کنید؟ این عمل غیرقابل بازگشت است و تمام پیشرفت بازیکنان در این نقشه از بین خواهد رفت.`)) return;

        this.setLoadingState(true);
        try {
            await axios.post('/admin/api/game/reset', { mapId: this.mapToReset }); // Changed endpoint to match route
            this.sendNotification('success', `اطلاعات بازی برای نقشه "${mapNameToReset}" با موفقیت ریست شد.`);
            this.mapToReset = '';
        } catch (error) {
            this.sendNotification('error', 'خطا در ریست کردن اطلاعات بازی: ' + (error.response?.data?.message || error.message));
        } finally {
            this.setLoadingState(false);
        }
    },

    // --- Socket Event Handlers ---
    handleGameAdminSocketEvents() {
        if (!window.socket || this._gameAdminSocketHandlersAttached) return;

        this._gameAdminSocketHandlersAttached = true; // Flag to prevent attaching multiple times
        console.log("Attaching game admin socket event handlers.");

        window.socket.on('admin-settings-changed', (data) => {
            if (this.activeSection !== 'game_management') return;
            console.log("Admin Game Management received admin-settings-changed:", data);

            if (data.event === 'map_created' || data.event === 'map_updated' || data.event === 'game_reset') {
                if(this.gameManagementActiveTab === 'maps' || this.gameManagementActiveTab === 'settings' || this.gameManagementActiveTab === 'reset' || this.gameManagementActiveTab === 'attacks') {
                    this.fetchGameMaps(); // Refresh map list for various tabs
                }
            }
            if (data.event === 'attack_wave_created') {
                 if(this.gameManagementActiveTab === 'attacks') this.fetchAttackWaves();
            }
            if (data.event === 'ammo_created' || data.event === 'ammo_updated' || data.event === 'ammo_deleted') {
                 if(this.gameManagementActiveTab === 'ammunition') this.fetchGameAmmunitions();
            }
             if (data.event === 'tile_price_changed' || data.event === 'wall_costs_changed') { // Assuming wall_costs_changed for future
                 if(this.gameManagementActiveTab === 'settings') this.fetchGameSettings();
            }
        });
    }
  },
  watch: {
    'tilePriceSettings.mapIdForPrice': function(newVal, oldVal) {
        if (newVal !== oldVal && this.activeSection === 'game_management' && this.gameManagementActiveTab === 'settings') {
            this.fetchGameSettings();
        }
    },
    activeSection(newVal) {
        if (newVal === 'game_management') {
            this.initializeGameManagement();
            this.handleGameAdminSocketEvents(); // Ensure handlers are attached when section becomes active
        }
    },
    gameManagementActiveTab(newTab) {
        // Auto-refresh data when switching to a tab if its data array is empty or needs refresh
        if (newTab === 'maps' && (!this.gameMaps || this.gameMaps.length === 0)) this.fetchGameMaps();
        else if (newTab === 'attacks' && (!this.attackWaves || this.attackWaves.length === 0)) this.fetchAttackWaves();
        else if (newTab === 'ammunition' && (!this.gameAmmunitions || this.gameAmmunitions.length === 0)) this.fetchGameAmmunitions();
        else if (newTab === 'settings') this.fetchGameSettings(); // Settings often good to refresh
    }
  },
  mounted() { // `mounted` in mixin is merged with component's mounted
    this.$nextTick(() => { // Ensure Vue instance is fully mounted
        if (this.activeSection === 'game_management') {
            this.initializeGameManagement();
            this.handleGameAdminSocketEvents();
        }
    });
  },
  beforeDestroy() { // Clean up socket listeners if component using mixin is destroyed
    if (window.socket && this._gameAdminSocketHandlersAttached) {
        console.log("Removing game admin socket event handlers.");
        window.socket.off('admin-settings-changed'); // Be more specific if you have other listeners
        this._gameAdminSocketHandlersAttached = false;
    }
  }
};
