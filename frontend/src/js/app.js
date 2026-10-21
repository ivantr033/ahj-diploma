import ChaosCore from './ChaosCore';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('chat-workspace-app');
    if (root) {
        const appInstance = new ChaosCore(root);
        appInstance.init();
    }

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('✅ Service Worker PWA active:', reg.scope))
                .catch(err => console.error('❌ Error in Service Worker:', err));
        });
    }
});