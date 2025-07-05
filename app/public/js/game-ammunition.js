// Ammunition Store Logic
document.addEventListener('DOMContentLoaded', () => {
    const ammunitionSection = document.getElementById('ammunition_store');
    const contentDiv = document.getElementById('game-ammunition-content');
    let userScore = 0;
    let userInventory = [];
    let storeItems = [];
    let gameIsLocked = false;

    const showGlobalLoading = (show) => {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = show ? 'flex' : 'none';
    };

    async function fetchInitialData() {
        showGlobalLoading(true);
        try {
            const mapResponse = await axios.get('/api/game/map/active');
            if (mapResponse.data && mapResponse.data.id) {
                gameIsLocked = mapResponse.data.gameLocked;
            } else {
                console.warn("No active map found for ammunition store context.");
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
            if (error.response && error.response.status === 403 && error.response.data.message && error.response.data.message.includes("عضو هیچ گروهی نیستید")) {
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
        html += `</div></div>`;

        contentDiv.innerHTML = html;
        attachEventListeners();
    }

    function attachEventListeners() {
        if (gameIsLocked) return;

        document.querySelectorAll('.buy-ammo-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ammunitionId = e.target.dataset.ammoId;
                const price = parseInt(e.target.dataset.price);
                const itemCard = e.target.closest('.store-item');
                const itemNameElement = itemCard.querySelector('h3');
                const itemName = itemNameElement ? itemNameElement.textContent.trim() : 'مهمات انتخاب شده';
                const quantityInput = itemCard.querySelector('.buy-ammo-quantity');
                const quantity = parseInt(quantityInput.value);

                if (isNaN(quantity) || quantity <= 0) {
                    sendNotification('warning', 'لطفاً تعداد معتبر برای خرید وارد کنید.');
                    return;
                }

                sendConfirmationNotification('confirm', `آیا از خرید ${quantity} عدد ${itemName} به قیمت کل ${price * quantity} امتیاز مطمئن هستید؟`, async (confirmed) => {
                    if (!confirmed) return;
                    showGlobalLoading(true);
                    try {
                        const response = await axios.post('/api/game/ammunition/buy', { ammunitionId, quantity });
                        sendNotification('success', 'مهمات با موفقیت خریداری شد!');
                        if (response.data.inventory && response.data.newScore !== undefined) {
                            userInventory = response.data.inventory;
                            userScore = response.data.newScore;
                            renderAmmunitionStore();
                        }
                    } catch (error) {
                        console.error("Error buying ammunition:", error);
                        sendNotification('error', error.response?.data?.message || 'خطا در خرید مهمات.');
                    } finally {
                        showGlobalLoading(false);
                    }
                });
            });
        });
    }

    if (window.socket) {
        window.socket.on('inventory-updated', (data) => {
            console.log('Socket event: inventory-updated', data);
            if (data.inventory && data.score !== undefined) {
                userInventory = data.inventory;
                userScore = data.score;
                 if (ammunitionSection && ammunitionSection.classList.contains('active')) {
                    renderAmmunitionStore();
                    sendNotification('info', 'انبار و امتیاز شما به‌روز شد.');
                }
            }
        });
        window.socket.on('admin-settings-changed', (data) => {
            if (data.event === 'ammo_created' || data.event === 'ammo_updated' || data.event === 'ammo_deleted'){
                 if (ammunitionSection && ammunitionSection.classList.contains('active')) {
                    console.log("Admin settings for ammo changed, re-fetching store data.");
                    fetchInitialData();
                }
            }
        });
         window.socket.on('game-locked', (data) => {
            gameIsLocked = data.gameLocked;
            if (ammunitionSection && ammunitionSection.classList.contains('active')) {
                sendNotification('info', `وضعیت قفل بازی تغییر کرد. ${data.gameLocked ? 'خرید مهمات غیرفعال شد.' : 'خرید مهمات فعال شد.'}`);
                renderAmmunitionStore();
            }
        });
    }

    const observer = new MutationObserver((mutationsList, observer) => {
        for(const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (ammunitionSection && ammunitionSection.classList.contains('active')) {
                    fetchInitialData();
                } else {
                     contentDiv.innerHTML = '';
                }
            }
        }
    });

    if (ammunitionSection) {
        observer.observe(ammunitionSection, { attributes: true });
        if (ammunitionSection.classList.contains('active')) {
            fetchInitialData();
        }
    }

    const refreshButton = document.getElementById('btn-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            if (ammunitionSection && ammunitionSection.classList.contains('active')) {
                 sendNotification('info', 'در حال به‌روزرسانی اطلاعات فروشگاه مهمات...');
                fetchInitialData();
            }
        });
    }
});
```

با این بازنویسی‌ها، اطمینان حاصل می‌شود که آخرین نسخه اصلاح شده از کدها در فایل‌ها قرار می‌گیرد و مشکلات مربوط به `confirm` و `showAlert` برطرف می‌شوند.

اکنون کد برای ارسال با این اصلاحات آماده است.
