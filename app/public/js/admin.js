// app/public/js/admin.js (فایل اصلی و جدید)
new Vue({
  el: '#adminApp',
  mixins: [
    adminUsersMixin,
    adminAnnouncementsMixin,
    adminGroupsMixin,
    adminContentsMixin,
    shopAdminMixin,
    adminUniqueItemsMixin,
    adminFeaturesMixin,
    adminRadioMixin,
    adminQuestionBankMixin, // Added Question Bank Mixin
    adminGameManagementMixin // New Mixin for Territory Defense Game Management
  ],
  data: {
    editingId: null,
    activeSection: 'users', // Default active section
    sections: [
      { key: 'users', label: 'کاربرها' },
      { key: 'mentors', label: 'منتورها' },
      { key: 'announcements', label: 'اطلاعیه‌ها' },
      { key: 'groups', label: 'گروه‌ها' },
      { key: 'items', label: 'فروشگاه' },
      { key: 'contents', label: 'محتواها' },
      { key: 'game_management', label: 'مدیریت دفاع از قلمرو', featureFlag: 'admin_game_management' }, // New Admin Section
      { key: 'question_bank_questions', label: 'طرح سوال (بانک سوال)' },
      { key: 'question_bank_correction', label: 'تصحیح سوالات (بانک سوال)' },
      { key: 'question_bank_settings', label: 'تنظیمات بانک سوال' },
      { key: 'features', label: 'مدیریت رویدادها' },
      { key: 'radio', label: 'رادیو' }
    ],
    // userRole will be determined in created/mounted based on session or an API call if needed
    // For now, we assume `isAdminUser` computed property will handle admin-specific UI.
    // The mixin methods themselves might have role checks or rely on API-level protection.
  },
   computed: {
    isAdminUser() {
      // This is a simplified check. In a real app, this might come from a store or initial data.
      // It's used to show/hide admin-only UI elements like "Settings" for question bank.
      // Replace with your actual admin role detection logic.
      // For instance, if you have a global `currentUser` object: return this.currentUser && this.currentUser.role === 'admin';
      // Or if the admin panel is ONLY for admins, this can just be true.
      // Given the current structure, let's assume if they are on /admin, they are an admin.
      // This needs to be more robust if mentors also access parts of this admin panel.
      // For now, for UI purposes, we'll assume true if they're in the admin panel context.
      // The actual API calls are protected by session checks on the backend.
      return true; // Placeholder: refine this based on how admin/mentor roles are identified on client
    },
    isMentorUser() {
        // Placeholder for mentor role detection on client-side for UI logic
        return false; // Placeholder: refine this
    },
    // Filter sections based on role
    filteredSections() {
        if (this.isAdminUser) { // Or a more specific role check from session/user object
            return this.sections;
        }
        // Example for Mentor: Hide Question Bank Settings
        return this.sections.filter(sec => sec.key !== 'question_bank_settings');
    }
  },
  created() {
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
    
    window.socket.on('featureFlagsUpdated', () => {
        if (this.activeSection === 'features') {
            this.fetchFeatureFlags();
        }
    });
    
    this.loadSection();
    if (typeof this.handleSocketUpdates_QuestionBank === 'function') { // Check if mixin method exists
        this.handleSocketUpdates_QuestionBank();
    }
  },
  mounted() {
    window.socket.emit('joinAdminRoom');
    document.getElementById('refresh-btn').addEventListener('click', this.refreshData);
  },
  methods: {
    selectSection(key) {
      this.activeSection = key;
      // this.loadSection(); // Load data when section is selected via click
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
            case 'question_bank_questions':
                if (typeof this.fetchQuestions === 'function') await this.fetchQuestions();
                break;
            case 'question_bank_correction':
                if (typeof this.fetchSubmissionsForCorrection === 'function') await this.fetchSubmissionsForCorrection();
                break;
            case 'question_bank_settings':
                if (this.isAdminUser && typeof this.fetchQuestionBankSettings === 'function') {
                     await this.fetchQuestionBankSettings();
                } else if (!this.isAdminUser) {
                    this.sendNotification('error', 'شما مجاز به مشاهده این بخش نیستید.');
                    this.activeSection = 'users'; // Redirect to a default section
                }
                break;
            case 'features':
                await this.fetchFeatureFlags();
                break;
            case 'radio':
                // No specific data to load initially for radio, it's event-driven
                break;
        }
        this.setLoadingState(false);
    }
  },
  watch: {
    activeSection(newSection, oldSection) {
        if (newSection !== oldSection) {
            this.loadSection(); // Load data when activeSection changes
        }
    }
  }
});