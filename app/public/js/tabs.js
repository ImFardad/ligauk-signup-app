document.addEventListener('DOMContentLoaded', function(){
    const pageTitle = document.getElementById('page-title');
    let allMenuItems = []; // Initialize and populate later

    function updateMenuItems() {
        const desktopMenuItems = Array.from(document.querySelectorAll('#desktop-menu .menu-item'));
        const mobileMenuItems  = Array.from(document.querySelectorAll('#mobile-menu .menu-item'));
        allMenuItems = [...desktopMenuItems, ...mobileMenuItems];

        // Detach existing listeners before re-attaching, to prevent duplicates if called multiple times
        allMenuItems.forEach(item => {
            item.removeEventListener('click', handleMenuClick); // Named function for removal
            item.addEventListener('click', handleMenuClick);
        });
    }
    
    function handleMenuClick(e) {
        e.preventDefault();
        const clickedItem = e.currentTarget; // Use currentTarget for dynamically added listeners
        const sectionIdToShow = clickedItem.dataset.section;

        // Update active classes for all menu items
        // Query them fresh in case DOM changed (e.g. feature flags updated menu)
        const currentDesktopItems = Array.from(document.querySelectorAll('#desktop-menu .menu-item'));
        const currentMobileItems = Array.from(document.querySelectorAll('#mobile-menu .menu-item'));

        [...currentDesktopItems, ...currentMobileItems].forEach(i => {
            if (i.dataset.section === sectionIdToShow) {
                i.classList.add('active');
            } else {
                i.classList.remove('active');
            }
        });

        showSection(sectionIdToShow);

        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu && !mobileMenu.classList.contains('translate-x-full')) {
            mobileMenu.classList.replace('translate-x-0', 'translate-x-full');
        }
    }

    function showSection(id){
        const currentActiveSection = document.querySelector('.content-section.active');
        const nextSectionToShow    = document.getElementById(id);

        if (!nextSectionToShow) {
            console.warn(`Section with id "${id}" not found.`);
            return;
        }
        if (currentActiveSection && currentActiveSection.id === id) return; // Already active

        if (currentActiveSection) {
            currentActiveSection.classList.remove('fade-in');
            currentActiveSection.classList.add('fade-out');
            // Instead of transitionend, which can be tricky if transitions are disabled or short,
            // use a timeout or simply hide after starting fade-out.
            // For simplicity, we'll hide immediately and show next.
            // Proper handling of transitionend is better for smoother UX.
            currentActiveSection.classList.remove('active');
            currentActiveSection.classList.add('hidden'); // Ensure it's hidden
            currentActiveSection.classList.remove('fade-out');
        }

        nextSectionToShow.classList.remove('hidden'); // Make sure it's not hidden by default
        nextSectionToShow.classList.add('active');
        // Force reflow before adding fade-in for transition to work
        void nextSectionToShow.offsetWidth;
        nextSectionToShow.classList.add('fade-in');

        // Update page title
        const menuItem = allMenuItems.find(i => i.dataset.section === id); // allMenuItems should be up-to-date
        if (menuItem) {
            pageTitle.textContent = menuItem.innerText.trim();
        } else {
             // Fallback if menu item not found (e.g. direct call to showSection)
             // Try to get title from the section itself if it has one, or default
            pageTitle.textContent = nextSectionToShow.dataset.pageTitle || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
    }

    window.showSection = showSection; // Expose globally if needed by other scripts

    function initializeActiveTab() {
        updateMenuItems(); // Ensure allMenuItems is populated before use

        const desktopMenuContainer = document.getElementById('desktop-menu');
        if (!desktopMenuContainer) return;

        // Find the first *visible* menu item in the EJS 'sections' order
        // This relies on the EJS rendering LI elements that are visible based on feature flags.
        const firstVisibleMenuItem = Array.from(desktopMenuContainer.querySelectorAll('li > .menu-item')).find(item => {
            const style = window.getComputedStyle(item.parentElement); // Check visibility of parent LI
            return style.display !== 'none' && item.offsetParent !== null; // Check if item itself is rendered and visible
        });

        if (firstVisibleMenuItem) {
            const sectionId = firstVisibleMenuItem.dataset.section;
            const sectionElement = document.getElementById(sectionId);

            if (sectionElement) {
                // Deactivate all other sections
                document.querySelectorAll('.content-section.active').forEach(sec => {
                    if (sec.id !== sectionId) {
                        sec.classList.remove('active', 'fade-in');
                        sec.classList.add('hidden');
                    }
                });
                 // Activate the target section
                sectionElement.classList.remove('hidden');
                sectionElement.classList.add('active'); // No fade-in for initial load

                // Set active class on menu items
                allMenuItems.forEach(i => {
                    if (i.dataset.section === sectionId) i.classList.add('active');
                    else i.classList.remove('active');
                });
                pageTitle.textContent = firstVisibleMenuItem.innerText.trim();
            } else {
                console.warn(`Default section element with id "${sectionId}" not found.`);
                 // Fallback to the very first item in the list if its section exists
                const firstItemInDomOrder = desktopMenuContainer.querySelector('.menu-item');
                if (firstItemInDomOrder) {
                    const fallbackSectionId = firstItemInDomOrder.dataset.section;
                    const fallbackSection = document.getElementById(fallbackSectionId);
                    if (fallbackSection) {
                        showSection(fallbackSectionId); // Use showSection to handle classes
                        allMenuItems.forEach(i => {
                           if (i.dataset.section === fallbackSectionId) i.classList.add('active');
                           else i.classList.remove('active');
                        });
                    }
                }
            }
        } else if (allMenuItems.length > 0) {
            // If no visible item found by complex check, just try the first one in DOM if its section exists
            const firstItemCandidate = allMenuItems.find(item => document.getElementById(item.dataset.section));
            if(firstItemCandidate) {
                showSection(firstItemCandidate.dataset.section);
                 allMenuItems.forEach(i => {
                    if (i.dataset.section === firstItemCandidate.dataset.section) i.classList.add('active');
                    else i.classList.remove('active');
                });
            }
        }
    }

    // Initial setup
    updateMenuItems(); // Populate and attach listeners
    initializeActiveTab(); // Set the first visible tab

    // Optional: Re-initialize if feature flags cause DOM changes for menu items later
    // This would require 'feature-flags-loaded' event to be reliable and possibly a delay
    document.addEventListener('feature-flags-loaded', () => {
        console.log("Feature flags loaded event detected by tabs.js, re-initializing tabs.");
        initializeActiveTab(); // Re-evaluate active tab and listeners after flags might have changed menu
    });
});
