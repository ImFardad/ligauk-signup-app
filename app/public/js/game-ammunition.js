// Ammunition Store Logic
document.addEventListener('DOMContentLoaded', () => {
    const ammunitionSection = document.getElementById('ammunition_store');
    const contentDiv = document.getElementById('game-ammunition-content');
    let userScore = 0;
    let userInventory = [];
    let storeItems = [];
    let gameIsLocked = false; // Keep track of game lock status

    // Helper to show loading spinner (global one)
    const showGlobalLoading = (show) => {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = show ? 'flex' : 'none';
    };

    async function fetchInitialData() {
        showGlobalLoading(true);
        try {
            // Fetch game lock status first
            const mapResponse = await axios.get('/api/game/map/active');
            if (mapResponse.data && mapResponse.data.id) {
                gameIsLocked = mapResponse.data.gameLocked;
            } else {
                // No active map, assume game functionality might be limited or store still works
                console.warn("No active map found, but proceeding to load ammunition store.");
            }


            const [storeRes, inventoryRes] = await Promise.all([
                axios.get('/api/game/ammunition/store'),
                axios.get('/api/game/ammunition/inventory')
            ]);
            storeItems = storeRes.data;
            userInventory = inventoryRes.data.inventory;
            userScore = inventoryRes.data.score;
            renderAmmunitionStore();
        } catch (error) {
            console.error("Error fetching ammunition data:", error);
            let errorMsg = "خطا در بارگذاری فروشگاه مهمات.";
            if (error.response && error.response.status === 403 && error.response.data.message.includes("عضو هیچ گروهی نیستید")) {
                errorMsg = "برای دسترسی به فروشگاه مهمات، ابتدا باید عضو یک گروه شوید یا یک گروه ایجاد کنید.";
            } else if (error.response && error.response.data && error.response.data.message) {
                errorMsg = error.response.data.message;
            }
            contentDiv.innerHTML = `<p class="text-center text-xl text-red-400 p-4">${errorMsg}</p>`;
        } finally {
            showGlobalLoading(false);
        }
    }

    function renderAmmunitionStore() {
        let html = `<div class="container mx-auto p-4">`;

        // User Inventory and Score Display
        html += `<div class="mb-8 p-4 bg-gray-800 rounded-lg shadow">
                    <h2 class="text-xl font-bold text-white mb-3">انبار مهمات شما</h2>
                    <p class="text-lg text-yellow-400 mb-3">امتیاز گروه شما: <span id="user-score">${userScore}</span></p>`;
        if (gameIsLocked) {
             html += `<p class="text-center text-yellow-400 font-semibold mb-3">بازی قفل شده است. امکان خرید مهمات جدید وجود ندارد.</p>`;
        }
        if (userInventory.length > 0) {
            html += `<ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">`;
            userInventory.forEach(item => {
                html += `<li class="bg-gray-700 p-3 rounded-md shadow">
                            <div class="flex items-center">
                                <img src="${item.ammunition.image || 'https://via.placeholder.com/50?text=Ammo'}" alt="${item.ammunition.name}" class="w-12 h-12 object-cover rounded mr-3">
                                <div>
                                    <span class="font-semibold text-white">${item.ammunition.name}</span>
                                    <span class="text-sm text-gray-300 block">تعداد: ${item.quantity}</span>
                                </div>
                            </div>
                         </li>`;
            });
            html += `</ul>`;
        } else {
            html += `<p class="text-gray-400">انبار مهمات شما خالی است.</p>`;
        }
        html += `</div>`;

        // Ammunition Store Items
        html += `<div class="mb-8">
                    <h2 class="text-xl font-bold text-white mb-4">مهمات قابل خرید</h2>`;
        if (storeItems.length > 0) {
            html += `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">`;
            storeItems.forEach(item => {
                html += `<div class="store-item bg-gray-750 p-4 rounded-lg shadow-lg flex flex-col justify-between">
                            <div>
                                <img src="${item.image || 'https://via.placeholder.com/150?text=Ammo'}" alt="${item.name}" class="w-full h-32 object-contain rounded mb-3 bg-gray-600 p-1">
                                <h3 class="text-lg font-semibold text-white mb-1">${item.name}</h3>
                                <p class="text-sm text-gray-400 mb-1">قیمت: ${item.price} امتیاز</p>
                                <p class="text-xs text-gray-400 mb-1">سلامت: ${item.health} | خط دفاعی: ${item.defenseLine}</p>
                                <p class="text-xs text-gray-400 mb-2">حداکثر در دیوار: ${item.maxPerWall}</p>
                            </div>
                            ${!gameIsLocked ? `
                            <div class="mt-auto">
                                <input type="number" min="1" value="1" class="buy-ammo-quantity input-field bg-gray-700 text-sm w-full mb-2" placeholder="تعداد">
                                <button class="buy-ammo-btn btn-primary w-full text-sm" data-ammo-id="${item.id}" data-price="${item.price}">خرید</button>
                            </div>` : ''}
                         </div>`;
            });
            html += `</div>`;
        } else {
            html += `<p class="text-gray-400">در حال حاضر هیچ مهماتی برای فروش موجود نیست.</p>`;
        }
        html += `</div></div>`; // Close container

        contentDiv.innerHTML = html;
        attachEventListeners();
    }

    function attachEventListeners() {
        if (gameIsLocked) return; // Don't attach buy listeners if game is locked

        document.querySelectorAll('.buy-ammo-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const ammunitionId = e.target.dataset.ammoId;
                const price = parseInt(e.target.dataset.price);
                const itemCard = e.target.closest('.store-item');
                const quantityInput = itemCard.querySelector('.buy-ammo-quantity');
                const quantity = parseInt(quantityInput.value);

                if (isNaN(quantity) || quantity <= 0) {
                    sendNotification('warning', 'لطفاً تعداد معتبر برای خرید وارد کنید.');
                    return;
                }

                if (!confirm(`آیا از خرید ${quantity} عدد ${itemCard.querySelector('h3').textContent.trim()} به قیمت کل ${price * quantity} امتیاز مطمئن هستید؟`)) return;

                showGlobalLoading(true);
                try {
                    const response = await axios.post('/api/game/ammunition/buy', { ammunitionId, quantity });
                    sendNotification('success', 'مهمات با موفقیت خریداری شد!');
                    // Update inventory and score from response or via socket
                    if (response.data.inventory && response.data.newScore !== undefined) {
                        userInventory = response.data.inventory;
                        userScore = response.data.newScore;
                        renderAmmunitionStore(); // Re-render to show updated inventory and score
                    }
                } catch (error) {
                    console.error("Error buying ammunition:", error);
                    showAlert(error.response?.data?.message || 'خطا در خرید مهمات.', 'error');
                } finally {
                    showGlobalLoading(false);
                }
            });
        });
    }

    // Socket event listeners
    if (window.socket) {
        window.socket.on('inventory-updated', (data) => {
            console.log('Socket event: inventory-updated', data);
            if (data.inventory && data.score !== undefined) {
                userInventory = data.inventory;
                userScore = data.score;
                 if (ammunitionSection.classList.contains('active')) {
                    renderAmmunitionStore();
                    showAlert('انبار و امتیاز شما به‌روز شد.', 'info', 1500);
                }
            }
        });
        window.socket.on('admin-settings-changed', (data) => {
            // If admin changes ammo prices or visibility, good to refresh store
            if (data.event === 'ammo_created' || data.event === 'ammo_updated' || data.event === 'ammo_deleted'){
                 if (ammunitionSection.classList.contains('active')) {
                    console.log("Admin settings for ammo changed, re-fetching store data.");
                    fetchInitialData();
                }
            }
        });
         window.socket.on('game-locked', (data) => {
            gameIsLocked = data.gameLocked;
            if (ammunitionSection.classList.contains('active')) {
                showAlert(`وضعیت قفل بازی تغییر کرد. ${data.gameLocked ? 'خرید مهمات غیرفعال شد.' : 'خرید مهمات فعال شد.'}`, 'info');
                renderAmmunitionStore(); // Re-render to show/hide buy buttons
            }
        });
    }


    // Initialize when the tab becomes active
    const observer = new MutationObserver((mutationsList, observer) => {
        for(const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (ammunitionSection.classList.contains('active')) {
                    fetchInitialData();
                } else {
                     contentDiv.innerHTML = ''; // Clear content when tab is not active
                }
            }
        }
    });

    if (ammunitionSection) {
        observer.observe(ammunitionSection, { attributes: true });
        // Initial load if the tab is already active
        if (ammunitionSection.classList.contains('active')) {
            fetchInitialData();
        }
    }

    // Handle refresh button
    const refreshButton = document.getElementById('btn-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            if (ammunitionSection.classList.contains('active')) {
                 showAlert('در حال به‌روزرسانی اطلاعات فروشگاه مهمات...', 'info', 2000);
                fetchInitialData();
            }
        });
    }

});
