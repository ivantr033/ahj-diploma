import ChaosCore from './ChaosCore';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('chat-workspace-app');
    if (root) {
        const appInstance = new ChaosCore(root);
        appInstance.init();
    }

    if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('SW PWA Activado con éxito:', reg.scope))
                .catch(err => console.error('SW Crash:', err));
        });
    }
});
