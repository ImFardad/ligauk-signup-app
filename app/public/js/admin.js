// app/public/js/admin.js (فایل اصلی و جدید)
new Vue({
  el: '#adminApp',
  // تمام منطق‌های جدا شده را به عنوان mixin به نمونه اصلی Vue اضافه می‌کنیم
  mixins: [
    adminUsersMixin,
    adminAnnouncementsMixin,
    adminGroupsMixin,
    adminContentsMixin,
    shopAdminMixin, // برای ارزها
    adminUniqueItemsMixin,
    adminFeaturesMixin, // میکسین جدید برای مدیریت رویدادها
    adminRadioMixin,     // --- میکس‌این جدید رادیو اضافه شد ---
    adminMinigameMixin   // Added Minigame Admin Mixin
  ],
  data: {
    editingId: null, // این فیلد ممکن است بین mixinها مشترک باشد، پس در سطح اصلی می‌ماند
    activeSection: 'users',
    sections: [
      { key: 'users', label: 'کاربرها' },
      { key: 'mentors', label: 'منتورها' },
      { key: 'announcements', label: 'اطلاعیه‌ها' },
      { key: 'groups', label: 'گروه‌ها' },
      { key: 'items', label: 'فروشگاه' },
      { key: 'contents', label: 'محتواها' },
      { key: 'features', label: 'مدیریت رویدادها' },
      { key: 'radio', label: 'رادیو' }, // --- بخش جدید رادیو اضافه شد ---
      { key: 'minigame_admin', label: 'مدیریت مینی‌گیم' } // Added Minigame Admin Section
    ]
  },
  created() {
    // لیسنرهای عمومی Socket.IO
    window.socket.on('announcementCreated', ann => this.announcements.unshift(ann));
    window.socket.on('announcementUpdated', ann => {
      const idx = this.announcements.findIndex(a => a.id === ann.id);
      if (idx !== -1) this.$set(this.announcements, idx, ann);
    });
    window.socket.on('announcementDeleted', ({ id }) => this.announcements = this.announcements.filter(a => a.id !== id));
    window.socket.on('groupCreated', grp => this.groups.unshift(grp));
    window.socket.on('groupUpdated', grp => {
      const idx = this.groups.findIndex(g => g.id === grp.id);
      if (idx !== -1) this.$set(this.groups, idx, grp);
    });
    window.socket.on('groupDeleted', ({ id }) => this.groups = this.groups.filter(g => g.id !== id));
    window.socket.on('userUpdated', updatedUser => {
        const userIndex = this.users.findIndex(u => u.id === updatedUser.id);
        if (userIndex !== -1) this.$set(this.users, userIndex, updatedUser);
        const mentorIndex = this.mentors.findIndex(m => m.id === updatedUser.id);
        if (mentorIndex !== -1) this.$set(this.mentors, mentorIndex, updatedUser);
    });
    window.socket.on('userDeleted', ({ id }) => {
        this.users = this.users.filter(u => u.id !== id);
        this.mentors = this.mentors.filter(m => m.id !== id);
    });
    window.socket.on('contentCreated', () => this.activeSection === 'contents' && this.fetchTraining());
    window.socket.on('contentUpdated', () => this.activeSection === 'contents' && this.fetchTraining());
    window.socket.on('contentDeleted', () => this.activeSection === 'contents' && this.fetchTraining());
    
    // لیسنر برای آپدیت لحظه‌ای قابلیت‌ها
    window.socket.on('featureFlagsUpdated', () => {
        if (this.activeSection === 'features') {
            this.fetchFeatureFlags();
        }
    });
    
    // اولین بارگذاری اطلاعات
    this.loadSection();
  },
  mounted() {
    window.socket.emit('joinAdminRoom');
    document.getElementById('refresh-btn').addEventListener('click', this.refreshData);
  },
  methods: {
    // متدهای عمومی و مشترک
    selectSection(key) {
      // --- START OF FIX ---
      // متد را ساده‌سازی می‌کنیم تا فقط وضعیت را عوض کند
      // watcher بقیه کارها را به صورت خودکار انجام می‌دهد
      this.activeSection = key;
      // --- END OF FIX ---
    },
    setLoadingState(on) {
      const el = document.getElementById('loading-spinner');
      if (el) el.style.display = on ? 'flex' : 'none';
    },
    sendNotification(type, text) {
      const cfgs = { success: { color: 'bg-green-500', icon: '✔️' }, error: { color: 'bg-red-500', icon: '❌' } };
      const cfg = cfgs[type] || cfgs.success;
      const n = document.createElement('div');
      n.className = `alert-box ${cfg.color} text-white`;
      n.innerHTML = `<span class="ml-2">${cfg.icon}</span><p>${text}</p>`;
      document.getElementById('alert-container').appendChild(n);
      setTimeout(() => n.classList.add('show'), 10);
      setTimeout(() => {
        n.classList.remove('show');
        setTimeout(() => n.remove(), 500);
      }, 3000);
    },
    async refreshData() {
      this.setLoadingState(true);
      await this.loadSection();
      this.setLoadingState(false);
    },
    async loadSection() {
        if (!this.activeSection) return;
        this.setLoadingState(true);
        // فراخوانی متد مربوط به هر بخش
        // --- START OF FIX ---
        // کیس 'radio' به سوییچ اضافه شد
        switch(this.activeSection) {
            case 'users': await this.fetchUsers(); break;
            case 'mentors': await this.fetchMentors(); break;
            case 'announcements': await this.fetchAnnouncements(); break;
            case 'groups': await this.fetchGroups(); break;
            case 'contents': await this.fetchTraining(); break;
            case 'items':
                await this.fetchCurrencies();
                await this.fetchUniqueItems();
                break;
            case 'features':
                await this.fetchFeatureFlags();
                break;
            case 'radio':
                // بخش رادیو نیازی به بارگذاری داده اولیه ندارد
                break;
            case 'minigame_admin': // Added Minigame Admin
                await this.loadMinigameAdminData(); // Method from adminMinigameMixin
                break;
        }
        // --- END OF FIX ---
        this.setLoadingState(false);
    }
  },
  watch: {
    // هرگاه بخش فعال تغییر کرد، اطلاعات آن را بارگذاری کن
    activeSection(newSection, oldSection) {
        if (newSection !== oldSection) {
            this.loadSection();
        }
    }
  }
});