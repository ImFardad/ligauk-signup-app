// app/public/js/adminMinigameMixin.js
const adminMinigameMixin = {
  data: {
    minigameBlocks: [],
    minigameTreasures: [],
    newBlock: { x: 0, y: 0, z: 0, type: 'grass', isWalkable: true },
    newTreasure: { positionX: 0, positionY: 0, positionZ: 0, prizeType: 'fuel', prizeAmount: 10 },
    mapViewCenter: { x:0, y:0 }, // For simple 2D map display
    mapViewScale: 10, // Pixels per block unit for 2D map
    selectedBlockForTreasure: null, // For placing treasure via map click
  },
  methods: {
    async fetchMinigameData() {
      this.setLoadingState(true);
      try {
        const response = await axios.get('/admin/api/minigame/map-data');
        this.minigameBlocks = response.data.blocks || [];
        this.minigameTreasures = response.data.treasures || [];
      } catch (error) {
        console.error('Error fetching minigame data:', error);
        this.sendNotification('error', 'خطا در دریافت اطلاعات مینی‌گیم.');
      } finally {
        this.setLoadingState(false);
      }
    },
    async submitNewBlock() {
      if (this.newBlock.type === '') {
        this.sendNotification('error', 'نوع بلاک نمی‌تواند خالی باشد.');
        return;
      }
      this.setLoadingState(true);
      try {
        const response = await axios.post('/admin/api/minigame/map/block', this.newBlock);
        if (response.data.success) {
          this.sendNotification('success', response.data.message || 'بلاک با موفقیت ذخیره شد.');
          // Refresh data or update locally
          const existingIndex = this.minigameBlocks.findIndex(b => b.x === response.data.block.x && b.y === response.data.block.y && b.z === response.data.block.z);
          if (existingIndex > -1) {
            this.$set(this.minigameBlocks, existingIndex, response.data.block);
          } else {
            this.minigameBlocks.push(response.data.block);
          }
          this.newBlock = { x: 0, y: 0, z: 0, type: 'grass', isWalkable: true }; // Reset form
        } else {
          this.sendNotification('error', response.data.message || 'خطا در ذخیره بلاک.');
        }
      } catch (error) {
        console.error('Error submitting new block:', error);
        this.sendNotification('error', error.response?.data?.message || 'خطای سرور در ذخیره بلاک.');
      } finally {
        this.setLoadingState(false);
      }
    },
    async submitNewTreasure() {
      if (this.newTreasure.prizeAmount <= 0) {
        this.sendNotification('error', 'مقدار جایزه باید مثبت باشد.');
        return;
      }
      this.setLoadingState(true);
      try {
        const response = await axios.post('/admin/api/minigame/treasure', this.newTreasure);
        if (response.data.success) {
          this.sendNotification('success', response.data.message || 'جعبه جایزه با موفقیت اضافه شد.');
          this.minigameTreasures.push(response.data.treasureBox);
          this.newTreasure = { positionX: 0, positionY: 0, positionZ: 0, prizeType: 'fuel', prizeAmount: 10 };
          this.selectedBlockForTreasure = null; // Reset selection
        } else {
          this.sendNotification('error', response.data.message || 'خطا در افزودن جعبه جایزه.');
        }
      } catch (error) {
        console.error('Error submitting new treasure:', error);
        this.sendNotification('error', error.response?.data?.message || 'خطای سرور در افزودن جعبه جایزه.');
      } finally {
        this.setLoadingState(false);
      }
    },
    async removeTreasure(treasureId, index) {
      if (!confirm('آیا از حذف این جعبه جایزه مطمئن هستید؟')) return;
      this.setLoadingState(true);
      try {
        const response = await axios.delete(`/admin/api/minigame/treasure/${treasureId}`);
        if (response.data.success) {
          this.sendNotification('success', 'جعبه جایزه حذف شد.');
          this.minigameTreasures.splice(index, 1);
        } else {
          this.sendNotification('error', response.data.message || 'خطا در حذف جعبه جایزه.');
        }
      } catch (error) {
        console.error('Error deleting treasure:', error);
        this.sendNotification('error', error.response?.data?.message || 'خطای سرور در حذف جعبه جایزه.');
      } finally {
        this.setLoadingState(false);
      }
    },
    async initializeMapForce() {
        if (!confirm('هشدار! این عمل تمام نقشه و جعبه‌های فعلی را پاک کرده و نقشه جدیدی ایجاد می‌کند. آیا مطمئن هستید؟')) return;
        this.setLoadingState(true);
        try {
            const response = await axios.post('/admin/api/minigame/map/initialize?force=true');
            if (response.data.success) {
                this.sendNotification('success', response.data.message || 'نقشه با موفقیت بازسازی و مقداردهی اولیه شد.');
                await this.fetchMinigameData(); // Reload all data
            } else {
                this.sendNotification('error', response.data.message || 'خطا در مقداردهی اولیه نقشه.');
            }
        } catch (error) {
            console.error('Error initializing map:', error);
            this.sendNotification('error', error.response?.data?.message || 'خطای سرور در مقداردهی اولیه نقشه.');
        } finally {
            this.setLoadingState(false);
        }
    },
    // Simple 2D map rendering (top-down view at z=0 for block placement visualization)
    drawMinigameMap() {
        const canvas = this.$refs.minigameMapCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const scale = this.mapViewScale;
        const canvasSize = 500; // Fixed canvas size
        canvas.width = canvasSize;
        canvas.height = canvasSize;

        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.save();
        // Center the view, typically around (0,0) or user-defined center
        ctx.translate(canvasSize / 2 - this.mapViewCenter.x * scale, canvasSize / 2 - this.mapViewCenter.y * scale);

        const blockColors = { grass: '#22aa22', dirt: '#8B4513', water: '#4488ff', stone: '#aaaaaa', sand: '#F4A460', wood_plank: '#DEB887', tree_trunk: '#795548', leaves: '#4CAF50', default: '#cccccc' };

        // Draw blocks (only those at z=0 for simplicity, or highest block at x,y)
        const drawnXY = new Set();
        // Create a copy of the array before sorting to prevent in-place modification triggering the watcher
        [...this.minigameBlocks].sort((a,b) => b.z - a.z) // Draw higher blocks on top
            .forEach(block => {
            const keyXY = `${block.x}_${block.y}`;
            if(drawnXY.has(keyXY)) return; // Only draw the top-most block for each x,y

            ctx.fillStyle = blockColors[block.type] || blockColors.default;
            if (block.type === 'water') ctx.globalAlpha = 0.7;
            else ctx.globalAlpha = 1.0;

            ctx.fillRect(block.x * scale, block.y * scale, scale, scale);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.strokeRect(block.x * scale, block.y * scale, scale, scale);
            drawnXY.add(keyXY);
        });
        ctx.globalAlpha = 1.0;

        // Draw treasures
        this.minigameTreasures.filter(t => !t.isOpened).forEach(treasure => {
            ctx.fillStyle = 'gold';
            ctx.beginPath();
            ctx.arc((treasure.positionX + 0.5) * scale, (treasure.positionY + 0.5) * scale, scale / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.stroke();
        });

        // Highlight selected block for treasure placement
        if (this.selectedBlockForTreasure) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.selectedBlockForTreasure.x * scale, this.selectedBlockForTreasure.y * scale, scale, scale);
            ctx.lineWidth = 1;
        }
        ctx.restore();
    },
    handleMapClick(event) { // For selecting a block on the canvas to place treasure
        const canvas = this.$refs.minigameMapCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scale = this.mapViewScale;
        const canvasSize = canvas.width;

        // Mouse position relative to canvas, then transform to map coordinates
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const mapX = Math.floor((mouseX - canvasSize / 2 + this.mapViewCenter.x * scale) / scale);
        const mapY = Math.floor((mouseY - canvasSize / 2 + this.mapViewCenter.y * scale) / scale);

        // Find the top-most walkable block at this x,y
        const targetBlock = this.minigameBlocks
            .filter(b => b.x === mapX && b.y === mapY && b.isWalkable)
            .sort((a,b) => b.z - a.z)[0];

        if (targetBlock) {
            this.selectedBlockForTreasure = targetBlock;
            this.newTreasure.positionX = targetBlock.x;
            this.newTreasure.positionY = targetBlock.y;
            this.newTreasure.positionZ = targetBlock.z; // Place treasure on this block's Z
            this.sendNotification('info', `بلاک (${targetBlock.x}, ${targetBlock.y}, ${targetBlock.z}) برای جعبه جایزه انتخاب شد.`);
        } else {
            this.sendNotification('warn', `هیچ بلاک قابل راه رفتنی در (${mapX}, ${mapY}) برای قرار دادن جعبه یافت نشد.`);
            this.selectedBlockForTreasure = null;
        }
        this.drawMinigameMap(); // Redraw to show selection
    },
    // Call this when the minigame admin section is loaded
    loadMinigameAdminData() {
        this.fetchMinigameData().then(() => {
            // Watcher should handle calling drawMinigameMap after data is fetched and minigameBlocks is updated.
            // this.$nextTick(() => {
            //     this.drawMinigameMap();
            // });
        });
    }
  },
  watch: {
    // Redraw map if blocks or treasures change and canvas is visible
    minigameBlocks: {
      deep: true,
      handler() { if (this.$refs.minigameMapCanvas && this.activeSection === 'minigame_admin') this.drawMinigameMap(); }
    },
    minigameTreasures: {
      deep: true,
      handler() { if (this.$refs.minigameMapCanvas && this.activeSection === 'minigame_admin') this.drawMinigameMap(); }
    },
    mapViewCenter: {
      deep: true,
      handler() { if (this.$refs.minigameMapCanvas && this.activeSection === 'minigame_admin') this.drawMinigameMap(); }
    }
  },
  // mounted() { // This would be called when the main admin Vue app is mounted
  //   if (this.activeSection === 'minigame_admin') { // Check if this section is initially active
  //     this.loadMinigameAdminData();
  //   }
  // }
};
