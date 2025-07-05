// Territory Defense Game Logic
document.addEventListener('DOMContentLoaded', () => {
    const territorySection = document.getElementById('territory_defense');
    const loadingDiv = document.getElementById('game-territory-loading');
    const contentDiv = document.getElementById('game-territory-content');

    const currentActiveMap = { id: null, name: '', size: 0, gameLocked: false };
    let userGroupId = null; // Will be fetched or determined

    // Helper to show loading spinner (global one)
    const showGlobalLoading = (show) => {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = show ? 'flex' : 'none';
    };

    // Fetch initial user/group data if needed (e.g. to know user's group ID)
    // This might already be available globally or needs a dedicated API call
    async function fetchUserGroupData() {
        try {
            // Example: if user data is embedded or available via another global script
            // For now, let's assume it's fetched if not available.
            // This is a placeholder. You'll need to integrate with your actual user/group data source.
            const response = await axios.get('/api/groups/my-group-details'); // Assuming such an endpoint exists
            if (response.data && response.data.id) {
                userGroupId = response.data.id;
            } else {
                 // Try to get it from the DOM if your existing group.js populates it
                const groupCard = document.querySelector('#group-info-card[data-group-id]');
                if(groupCard) userGroupId = groupCard.dataset.groupId;
            }
            if(!userGroupId) console.warn("شناسه گروه کاربر برای بازی دفاع از قلمرو یافت نشد.");

        } catch (error) {
            console.error("Error fetching user group data for game:", error);
            // If group is essential and not found, might want to disable game interactions.
        }
    }


    async function getActiveMap() {
        try {
            const response = await axios.get('/api/game/map/active');
            if (response.data && response.data.id) {
                currentActiveMap.id = response.data.id;
                currentActiveMap.name = response.data.name;
                currentActiveMap.size = response.data.size;
                currentActiveMap.gameLocked = response.data.gameLocked;
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error fetching active map:", error);
            if (error.response && error.response.status === 404) {
                contentDiv.innerHTML = `<p class="text-center text-xl text-yellow-400">${error.response.data.message || 'نقشه فعالی برای بازی یافت نشد.'}</p>`;
            } else {
                contentDiv.innerHTML = `<p class="text-center text-xl text-red-400">خطا در بارگذاری اطلاعات نقشه.</p>`;
            }
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
            return false;
        }
    }

    async function fetchMapState() {
        if (!currentActiveMap.id) {
            loadingDiv.innerText = 'هیچ نقشه فعالی برای بارگذاری وجود ندارد.';
            showGlobalLoading(false);
            return;
        }
        showGlobalLoading(true);
        try {
            const response = await axios.get(`/api/game/map/${currentActiveMap.id}/state`);
            renderMap(response.data);
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
        } catch (error) {
            console.error("Error fetching map state:", error);
            contentDiv.innerHTML = `<p class="text-center text-xl text-red-400">خطا در بارگذاری وضعیت نقشه.</p>`;
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
        } finally {
            showGlobalLoading(false);
        }
    }

    function renderMap(mapData) {
        if (!mapData || !mapData.tiles) {
            contentDiv.innerHTML = '<p>اطلاعات نقشه ناقص است.</p>';
            return;
        }
        currentActiveMap.gameLocked = mapData.gameLocked; // Update game lock status

        let html = `<div class="mb-4 p-4 bg-gray-800 rounded-lg shadow">
                        <h2 class="text-2xl font-bold text-white text-center">${mapData.name} (سایز: ${mapData.size}x${mapData.size})</h2>
                        ${mapData.gameLocked ? '<p class="text-center text-yellow-400 font-semibold">این بازی قفل شده است. امکان خرید ملک جدید، ارتقا یا استقرار مهمات وجود ندارد.</p>' : ''}
                    </div>`;

        // Attack Timer
        if (mapData.attackWaves && mapData.attackWaves.length > 0) {
            const nextAttack = mapData.attackWaves[0];
            html += `<div id="attack-timer-container" class="mb-4 p-3 bg-red-700 text-white rounded-lg text-center">
                        <p class="font-bold">موج حمله بعدی در: <span id="attack-countdown"></span></p>
                        ${nextAttack.isPowerVisible ? `<p>قدرت حمله: ${nextAttack.power}</p>` : ''}
                     </div>`;
            startCountdown(nextAttack.attackTime);
        } else {
            html += `<div id="attack-timer-container" class="mb-4 p-3 bg-gray-600 text-white rounded-lg text-center">
                        <p>در حال حاضر موج حمله فعالی برنامه‌ریزی نشده است.</p>
                     </div>`;
        }


        html += `<div class="overflow-auto scrollable-map-container max-h-[70vh] bg-gray-700 p-2 rounded-lg shadow-inner">
                    <div id="game-grid" class="grid gap-0.5 bg-gray-900 border border-gray-600"
                         style="grid-template-columns: repeat(${mapData.size}, minmax(60px, 1fr));
                                width: ${mapData.size * 60}px;">`; // Min width for grid

        mapData.tiles.forEach(tile => {
            const ownerColor = tile.ownerGroup ? tile.ownerGroup.color : 'transparent';
            const displayColor = tile.ownerGroup ? ownerColor : '#4a5568'; // gray-700 for unowned
            const isOwner = tile.OwnerGroupId && tile.OwnerGroupId === userGroupId;

            html += `<div class="tile aspect-square flex flex-col items-center justify-center relative group"
                         data-tile-id="${tile.id}" data-x="${tile.x}" data-y="${tile.y}"
                         style="background-color: ${displayColor};">`;

            // Tile info display (e.g., coordinates, owner name on hover)
            html += `<div class="absolute top-0 right-0 text-xs p-0.5 bg-black bg-opacity-30 text-white rounded-bl-sm">${tile.x},${tile.y}</div>`;
            if (tile.ownerGroup) {
                html += `<div class="absolute bottom-0 left-0 text-xs p-0.5 bg-black bg-opacity-50 text-white rounded-tr-sm opacity-0 group-hover:opacity-100 transition-opacity">${tile.ownerGroup.name}</div>`;
            }


            if (tile.OwnerGroupId && tile.walls && tile.walls.length > 0) {
                // Walls container (simplified representation)
                // Outer border represents the combined strength of walls
                // Detailed walls are shown in modal
                let totalDefense = 0;
                tile.walls.forEach(wall => {
                    totalDefense += wall.health;
                    wall.deployedAmmunitions.forEach(ammo => {
                        totalDefense += ammo.health; // Use current health of deployed ammo
                    });
                });

                html += `<div class="wall-representation absolute inset-0 border-2 border-opacity-75 pointer-events-none"
                              style="border-color: ${isOwner ? 'cyan' : 'orange'};">
                              <span class="absolute text-xs text-white bg-black bg-opacity-50 px-1 rounded" style="top: 50%; left: 50%; transform: translate(-50%, -50%);">${totalDefense}</span>
                          </div>`;

                // Clickable overlay for owned tiles to open wall modal
                if(isOwner && tile.walls.length === 4){ // Assuming 4 walls means it's a standard tile
                     html += `<div class="absolute inset-0 cursor-pointer" data-action="open-wall-modal"></div>`;
                }

            } else if (!tile.OwnerGroupId && !currentActiveMap.gameLocked) {
                // Buy button for unowned tiles if game not locked
                html += `<button class="buy-tile-btn text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded" data-price="${tile.price}">خرید (${tile.price})</button>`;
            }
            html += `</div>`; // Close tile
        });

        html += `</div></div>`; // Close grid and scrollable container
        contentDiv.innerHTML = html;
        attachEventListeners();
    }

    function startCountdown(attackTime) {
        const countdownElement = document.getElementById('attack-countdown');
        if (!countdownElement) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = new Date(attackTime).getTime() - now;

            if (distance < 0) {
                clearInterval(interval);
                countdownElement.textContent = "زمان حمله فرا رسیده!";
                // Optionally trigger a map refresh here or wait for socket event
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            let countdownText = '';
            if (days > 0) countdownText += `${days} روز `;
            if (hours > 0 || days > 0) countdownText += `${hours} ساعت `;
            countdownText += `${minutes} دقیقه ${seconds} ثانیه`;
            countdownElement.textContent = countdownText;

        }, 1000);
    }


    function attachEventListeners() {
        const buyButtons = document.querySelectorAll('.buy-tile-btn');
        buyButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                if (currentActiveMap.gameLocked) {
                    sendNotification('error', 'بازی قفل شده است، امکان خرید وجود ندارد.');
                    return;
                }
                const tileElement = e.target.closest('.tile');
                const tileId = tileElement.dataset.tileId;
                const price = parseInt(e.target.dataset.price);

                // Confirm purchase
                if (!confirm(`آیا از خرید این ملک به قیمت ${price} امتیاز مطمئن هستید؟`)) return;
                showGlobalLoading(true);
                try {
                    await axios.post('/api/game/tile/buy', { tileId, mapId: currentActiveMap.id });
                    showAlert('ملک با موفقیت خریداری شد!', 'success');
                    // Map will be updated via socket event 'map-updated'
                } catch (error) {
                    console.error("Error buying tile:", error);
                    showAlert(error.response?.data?.message || 'خطا در خرید ملک.', 'error');
                } finally {
                    showGlobalLoading(false);
                }
            });
        });

        const wallModalTriggers = document.querySelectorAll('.tile [data-action="open-wall-modal"]');
        wallModalTriggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                const tileElement = e.target.closest('.tile');
                const tileId = tileElement.dataset.tileId;
                openWallManagementModal(tileId);
            });
        });
    }

    async function openWallManagementModal(tileId) {
        showGlobalLoading(true);
        try {
            // Fetch the specific tile's full data again to ensure freshness
            const response = await axios.get(`/api/game/map/${currentActiveMap.id}/state`);
            const mapData = response.data;
            const tile = mapData.tiles.find(t => t.id == tileId);

            if (!tile || !tile.walls) {
                showAlert('اطلاعات ملک برای مدیریت دیوارها یافت نشد.', 'error');
                return;
            }

            // Fetch group inventory for deploying ammo
            const invResponse = await axios.get('/api/game/ammunition/inventory');
            const groupInventory = invResponse.data.inventory;


            let modalHtml = `<div id="wall-modal-backdrop" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div class="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto text-white">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">مدیریت دیوارهای ملک (${tile.x}, ${tile.y})</h3>
                        <button id="close-wall-modal" class="text-gray-400 hover:text-white">&times;</button>
                    </div>`;

            if (currentActiveMap.gameLocked) {
                modalHtml += `<p class="text-center text-yellow-400 mb-4">بازی قفل شده است. امکان ارتقا یا استقرار مهمات جدید وجود ندارد.</p>`;
            }

            tile.walls.forEach(wall => {
                const wallTypeTranslations = { wood: 'چوبی', stone: 'سنگی', metal: 'فلزی' };
                modalHtml += `<div class="wall-section mb-6 p-4 border border-gray-700 rounded-lg bg-gray-750">
                                <h4 class="text-lg font-semibold mb-2 capitalize">دیوار ${wall.direction} (${wallTypeTranslations[wall.type]}) - سلامت: ${wall.health}</h4>

                                <!-- Upgrade Wall -->
                                ${!currentActiveMap.gameLocked && wall.type !== 'metal' ? `
                                <div class="mb-3">
                                    <button class="upgrade-wall-btn btn-primary text-sm" data-wall-id="${wall.id}" data-current-type="${wall.type}">ارتقا دیوار</button>
                                    <span class="text-xs text-gray-400 ml-2">هزینه و نوع بعدی بر اساس ماتریس ارتقا</span>
                                </div>` : wall.type === 'metal' ? '<p class="text-sm text-green-400">دیوار در بالاترین سطح است.</p>' : ''}

                                <!-- Deploy Ammunition -->
                                <h5 class="text-md font-medium mt-3 mb-1">مهمات مستقر شده:</h5>`;
                if (wall.deployedAmmunitions && wall.deployedAmmunitions.length > 0) {
                    modalHtml += `<ul class="list-disc list-inside pl-4 text-sm space-y-1">`;
                    wall.deployedAmmunitions.forEach(ammo => {
                        modalHtml += `<li>${ammo.ammunitionDetail.name} (سلامت: ${ammo.health}/${ammo.ammunitionDetail.health})</li>`;
                    });
                    modalHtml += `</ul>`;
                } else {
                    modalHtml += `<p class="text-xs text-gray-400">هیچ مهماتی روی این دیوار مستقر نشده است.</p>`;
                }

                if (!currentActiveMap.gameLocked) {
                    modalHtml += `<div class="mt-3">
                                    <h5 class="text-md font-medium mb-1">افزودن مهمات جدید:</h5>
                                    <select class="deploy-ammo-select input-field bg-gray-700 text-sm w-full mb-2" data-wall-id="${wall.id}">
                                        <option value="">انتخاب مهمات از انبار...</option>`;
                    groupInventory.forEach(invItem => {
                        if (invItem.quantity > 0) {
                             modalHtml += `<option value="${invItem.AmmunitionId}" data-max-per-wall="${invItem.ammunition.maxPerWall}">${invItem.ammunition.name} (موجودی: ${invItem.quantity})</option>`;
                        }
                    });
                    modalHtml += `  </select>
                                    <input type="number" min="1" value="1" class="deploy-ammo-quantity input-field bg-gray-700 text-sm w-24 mr-2" placeholder="تعداد">
                                    <button class="deploy-ammo-btn btn-secondary text-sm" data-wall-id="${wall.id}">افزودن</button>
                                 </div>`;
                }
                modalHtml += `</div>`; // Close wall-section
            });

            modalHtml += `</div></div>`; // Close modal content and backdrop
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('close-wall-modal').addEventListener('click', () => {
                document.getElementById('wall-modal-backdrop').remove();
            });

            // Attach event listeners for upgrade and deploy buttons
            document.querySelectorAll('.upgrade-wall-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (currentActiveMap.gameLocked) {
                        showAlert('بازی قفل شده است.', 'error'); return;
                    }
                    const wallId = e.target.dataset.wallId;
                    // Add confirmation for upgrade cost
                    if (!confirm("آیا از ارتقا این دیوار مطمئن هستید؟ امتیاز از گروه کسر خواهد شد.")) return;
                    showGlobalLoading(true);
                    try {
                        await axios.post('/api/game/wall/upgrade', { wallId });
                        showAlert('درخواست ارتقا دیوار ارسال شد.', 'success');
                        document.getElementById('wall-modal-backdrop').remove(); // Close modal
                        // Map will update via socket
                    } catch (error) {
                        showAlert(error.response?.data?.message || 'خطا در ارتقا دیوار.', 'error');
                    } finally {
                        showGlobalLoading(false);
                    }
                });
            });

            document.querySelectorAll('.deploy-ammo-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                     if (currentActiveMap.gameLocked) {
                        showAlert('بازی قفل شده است.', 'error'); return;
                    }
                    const wallId = e.target.dataset.wallId;
                    const section = e.target.closest('.wall-section');
                    const select = section.querySelector('.deploy-ammo-select');
                    const quantityInput = section.querySelector('.deploy-ammo-quantity');
                    const ammunitionId = select.value;
                    const quantityToDeploy = parseInt(quantityInput.value);

                    if (!ammunitionId || quantityToDeploy <= 0) {
                        showAlert('لطفا مهمات و تعداد معتبر انتخاب کنید.', 'warning');
                        return;
                    }
                    showGlobalLoading(true);
                    try {
                        await axios.post('/api/game/ammunition/deploy', { wallId, ammunitionId, quantityToDeploy });
                        showAlert('درخواست استقرار مهمات ارسال شد.', 'success');
                        document.getElementById('wall-modal-backdrop').remove(); // Close modal
                        // Map and inventory will update via socket
                    } catch (error) {
                        showAlert(error.response?.data?.message || 'خطا در استقرار مهمات.', 'error');
                    } finally {
                        showGlobalLoading(false);
                    }
                });
            });

        } catch (error) {
            showAlert(error.response?.data?.message || 'خطا در باز کردن مودال دیوار.', 'error');
        } finally {
            showGlobalLoading(false);
        }
    }


    // Socket event listeners
    if (window.socket) {
        window.socket.on('map-updated', (data) => {
            console.log('Socket event: map-updated', data);
            if (data.map && data.map.id === currentActiveMap.id) {
                renderMap(data.map); // Re-render the whole map
                showAlert('نقشه به‌روزرسانی شد!', 'info', 1500);
            } else if (data.tileId && data.updatedTile) {
                // More granular update - harder to do without full re-render or complex DOM manipulation
                // For now, let's just refresh if it's our current map
                if (data.updatedTile.MapId === currentActiveMap.id) {
                     fetchMapState(); // Simpler to refetch and re-render
                     showAlert('بخشی از نقشه به‌روزرسانی شد!', 'info', 1500);
                }
            }
        });

        window.socket.on('tile-lost', (data) => {
            if (data.mapId === currentActiveMap.id) {
                showAlert(`ملک در (${data.x}, ${data.y}) مالک خود را از دست داد.`, 'warning');
                // Map should be updated by 'map-updated' event that should follow or be part of this logic
                // fetchMapState(); // Or wait for map-updated
            }
        });

        window.socket.on('group-eliminated', (data) => {
            if (data.mapId === currentActiveMap.id) {
                showAlert(`گروه ${data.groupName || data.groupId} از بازی حذف شد!`, 'error');
            }
        });

        window.socket.on('game-locked', (data) => {
            if (data.mapId === currentActiveMap.id) {
                currentActiveMap.gameLocked = data.gameLocked;
                showAlert('وضعیت قفل بازی تغییر کرد!', 'info');
                fetchMapState(); // Re-render to reflect locked state (e.g., disable buttons)
            }
        });

        window.socket.on('attack-imminent', (data) => {
            if (data.mapId === currentActiveMap.id && data.wave) {
                showAlert('موج حمله جدیدی تعریف شد یا به‌روز شد!', 'info');
                // Update timer if already displayed or re-render that part
                const timerContainer = document.getElementById('attack-timer-container');
                if(timerContainer){
                    let newTimerHtml = `<p class="font-bold">موج حمله بعدی در: <span id="attack-countdown"></span></p>
                                     ${data.wave.isPowerVisible ? `<p>قدرت حمله: ${data.wave.power}</p>` : ''}`;
                    timerContainer.innerHTML = newTimerHtml;
                    startCountdown(data.wave.attackTime);
                }
            }
        });
        window.socket.on('admin-settings-changed', (data) => {
            // General event that might affect the game, good to refresh map state
            if (data.event === 'map_created' || data.event === 'map_updated' || data.event === 'tile_price_changed' || data.event === 'game_reset'){
                 if (territorySection.classList.contains('active')) { // Only if this tab is active
                    console.log("Admin settings changed, re-initializing game view");
                    initializeGameView();
                }
            }
        });
         window.socket.on('force-reload', (data) => {
            if (territorySection.classList.contains('active')) {
                showAlert(data.message || "تغییرات مهمی از سوی ادمین اعمال شده، صفحه مجدداً بارگذاری می‌شود...", "warning");
                setTimeout(() => window.location.reload(), 2000);
            }
        });
    }

    async function initializeGameView() {
        showGlobalLoading(true);
        contentDiv.style.display = 'none';
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = 'در حال بارگذاری اطلاعات بازی...';

        await fetchUserGroupData(); // Fetch group ID first

        if (await getActiveMap()) {
            await fetchMapState();
        }
        // Else, getActiveMap already showed a message
        showGlobalLoading(false);
    }


    // Initialize when the tab becomes active
    const observer = new MutationObserver((mutationsList, observer) => {
        for(const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (territorySection.classList.contains('active')) {
                    initializeGameView();
                } else {
                    // Clear content or stop intervals if any when tab is not active
                    contentDiv.innerHTML = '';
                    const countdownElement = document.getElementById('attack-countdown');
                    if(countdownElement && window.countdownIntervalId){ // Assuming you store intervalId globally or scoped
                        clearInterval(window.countdownIntervalId);
                    }
                }
            }
        }
    });

    if (territorySection) {
        observer.observe(territorySection, { attributes: true });
        // Initial load if the tab is already active (e.g. on page refresh)
        if (territorySection.classList.contains('active')) {
            initializeGameView();
        }
    }
     // Handle refresh button
    const refreshButton = document.getElementById('btn-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            if (territorySection.classList.contains('active')) {
                showAlert('در حال به‌روزرسانی اطلاعات نقشه...', 'info', 2000);
                initializeGameView();
            }
        });
    }

});
